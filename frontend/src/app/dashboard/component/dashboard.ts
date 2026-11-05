import { DialogDirective } from '../../shared/directives/dialog.directive';
import { Component, HostListener, OnInit, ChangeDetectorRef, DestroyRef, inject, OnDestroy } from '@angular/core';
import { CompactType, DisplayGrid, Gridster, GridsterConfig, GridsterItem, GridsterItemConfig, GridType } from 'angular-gridster2';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardItem } from '../models/dashboard.models';
import { findFreeSpot, normalizeWidgetLayout } from '../models/widget-layout';
import { WidgetHost } from '../../widgets/widget-host/widget-host';
import { Card } from '../card/card';
import { WIDGET_REGISTRY, widgetDefinition } from '../../widgets/widgets.registry';
import { WidgetPicker } from '../widget-picker/widget-picker';
import { DashboardService, DashboardLayout } from '../service/dashboard.service';
import { AuthService } from '../../core/auth/service/auth.service';
import { GreetingPipe } from '../../features/datetime/pipes/datetime.pipe';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, concatMap, distinctUntilChanged, finalize, forkJoin, interval, map, of } from 'rxjs';
import { User } from '../../core/auth/model/auth.model';

/** Below this window width the dashboard shows a single list instead of the grid. */
const MOBILE_WIDTH = 1100;

/** Default arrangement for new accounts and for "Zurücksetzen". */
const INITIAL_LAYOUT: Array<[type: string, x: number, y: number, cols: number, rows: number]> = [
  ['datetime', 0, 0, 3, 5],
  ['calendar', 3, 0, 5, 5],
  ['weather', 8, 0, 4, 5],
  ['menuplan', 0, 5, 4, 8],
  ['todos', 4, 5, 4, 8],
  ['shoppinglist', 8, 5, 4, 8],
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DialogDirective, DatePipe, FormsModule, GridsterItem, Gridster, WidgetHost, Card, WidgetPicker],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly mutations = new Subject<() => Observable<unknown>>();
  private readonly saveTimeouts = new Map<DashboardItem, ReturnType<typeof setTimeout>>();
  private readonly greetingPipe = new GreetingPipe();
  errorMessage = "";
  isMobile = window.innerWidth < MOBILE_WIDTH;

  showWidgetPicker = false;

  options!: GridsterConfig;
  dashboard: DashboardItem[] = [];
  dashboardLoaded = false;
  editMode = false;
  columns = 12;
  rows = 12;
  maxRows = 24;

  now = new Date();
  firstName = '';

  // Layout manager
  showLayoutPanel = false;
  layouts: DashboardLayout[] = [];
  newLayoutName = '';
  layoutSaving = false;
  layoutApplying = false;
  resetting = false;

  constructor(public dashboardService: DashboardService, private cdr: ChangeDetectorRef, public auth: AuthService) {
    this.mutations.pipe(
      concatMap(operation => operation().pipe(catchError(() => {
        this.errorMessage = 'Änderung konnte nicht gespeichert werden. Bitte erneut versuchen.';
        this.cdr.markForCheck();
        return of(null);
      })))
    ).subscribe();
    this.dashboardService.editMode$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(mode => {
      this.editMode = mode;
      if (!mode) this.showWidgetPicker = false;
      this.updateGridsterOptions();
      this.recalcFixedCellSize();
    });
    // The greeting follows the time of day while the page stays open.
    interval(60_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.now = new Date(); this.cdr.markForCheck(); });
  }

  get greeting(): string {
    return this.greetingPipe.transform(this.now);
  }

  /** Reading order of the grid; the mobile list follows it. */
  get orderedItems(): DashboardItem[] {
    return [...this.dashboard].sort((a, b) => a.y - b.y || a.x - b.x);
  }

  /** How often each widget type is on the dashboard, for the picker. */
  get widgetsInUse(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of this.dashboard) counts[item.widget_type] = (counts[item.widget_type] ?? 0) + 1;
    return counts;
  }

  routeFor(item: DashboardItem): string | undefined {
    return widgetDefinition(item.widget_type)?.route;
  }

  sizeLabel(item: DashboardItem): string {
    return `${item.cols} × ${item.rows}`;
  }

  ngOnInit() {
    this.initGrid();

    this.auth.user$.pipe(
      distinctUntilChanged((a, b) => a?.id === b?.id),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(user => {
      this.firstName = user?.first_name ?? '';
      this.loadDashboardForUser(user);
    });
  }

  private initGrid() {
    this.options = {
      gridType: GridType.VerticalFixed,
      // Below MOBILE_WIDTH the dashboard shows its own list (isMobile).
      // Gridster measures its own width (without the sidebar), so its breakpoint must
      // stay lower, or laptops around 1280px get a single stacked column.
      mobileBreakpoint: 640,
      keepFixedHeightInMobile: true,
      compactType: CompactType.None,
      margin: 14,
      outerMargin: false,
      useTransformPositioning: false,
      fixedRowHeight: 48,
      minCols: this.columns,
      maxCols: this.columns,
      minRows: this.rows,
      maxRows: 1000,
      swap: false,
      pushItems: true,
      // Fires after gridster commits a move, resize or push, so every moved card is saved.
      itemChangeCallback: (item: GridsterItemConfig) => this.onItemChange(item),
      api: {
        optionsChanged: () => {},
        resize: () => {},
      },
      ...this.editOptions(),
    };
  }

  private editOptions(): GridsterConfig {
    return {
      displayGrid: this.editMode ? DisplayGrid.Always : DisplayGrid.None,
      draggable: { enabled: this.editMode, dragHandleClass: 'dash-card-header', ignoreContent: true },
      resizable: {
        enabled: this.editMode,
        handles: { s: true, e: true, se: true, n: false, w: false, ne: false, nw: false, sw: false },
      },
    };
  }

  private updateGridsterOptions() {
    if (!this.options) return;
    this.options = { ...this.options, ...this.editOptions() };
  }

  startEditing() { this.dashboardService.setEditMode(true); }

  openWidgetPicker() {
    if (!this.editMode) this.startEditing();
    this.showWidgetPicker = true;
  }

  finishEditing() {
    this.flushPendingSaves();
    this.dashboardService.setEditMode(false);
  }

  addWidget(widgetType: string) {
    const def = widgetDefinition(widgetType);
    if (!def) return;

    const spot = findFreeSpot(this.dashboard, def.defaultCols, def.defaultRows, this.columns);
    const newItem: DashboardItem = {
      id: '',
      widget_type: def.type,
      ...spot,
      cols: def.defaultCols,
      minItemCols: def.minCols,
      maxItemCols: def.maxCols ?? this.columns,
      rows: def.defaultRows,
      minItemRows: def.minRows,
      maxItemRows: def.maxRows ?? this.maxRows,
      title: def.title,
      icon: def.icon,
      config: {}
    };

    this.dashboard = [...this.dashboard, newItem];
    this.saveItem(newItem);
    this.showWidgetPicker = false;
    this.refreshGrid();
    setTimeout(() => document.querySelector(`[data-widget-index="${this.dashboard.indexOf(newItem)}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
  }

  removeWidget(item: DashboardItem) {
    if (!confirm(`„${item.title || 'Widget'}" vom Dashboard entfernen?`)) return;
    clearTimeout(this.saveTimeouts.get(item));
    this.saveTimeouts.delete(item);
    if (this.auth.user && item.id) {
      this.mutations.next(() => this.dashboardService.deleteItem(item.id).pipe(
        finalize(() => this.cdr.markForCheck()),
        // Keep the card until the server confirms deletion.
        concatMap(() => {
          this.dashboard = this.dashboard.filter(w => w !== item);
          return of(null);
        })
      ));
    } else {
      this.dashboard = this.dashboard.filter(w => w !== item);
      this.storeLocally();
    }
  }

  renameWidget(item: DashboardItem, title: string) {
    item.title = title;
    this.saveItem(item);
  }

  /** Mobile editing: move a card one step in reading order. The grid positions swap. */
  moveWidget(item: DashboardItem, direction: -1 | 1) {
    const order = this.orderedItems;
    const index = order.indexOf(item);
    const other = order[index + direction];
    if (!other) return;
    [item.x, item.y, other.x, other.y] = [other.x, other.y, item.x, item.y];
    // Cards of different sizes may overlap after swapping; push later ones down.
    const sorted = [...this.dashboard].sort((a, b) => a.y - b.y || a.x - b.x);
    const fixed = normalizeWidgetLayout(sorted, this.columns);
    sorted.forEach((original, i) => {
      const next = fixed[i];
      const changed = original === item || original === other || original.x !== next.x || original.y !== next.y;
      Object.assign(original, { x: next.x, y: next.y, cols: next.cols, rows: next.rows });
      if (changed) this.saveItem(original);
    });
    this.dashboard = [...this.dashboard];
  }

  resetDashboard() {
    if (this.resetting) return;
    if (!confirm('Dashboard auf die Standardansicht zurücksetzen? Eigene Anordnung und Titel gehen verloren.')) return;
    this.flushPendingSaves();
    const initial = this.getInitialLayout();
    if (!this.auth.user) {
      initial.forEach(item => item.id = this.generateId());
      this.applyLoadedItems(initial);
      this.storeLocally();
      return;
    }
    this.resetting = true;
    const existing = this.dashboard.filter(item => item.id);
    this.mutations.next(() => (existing.length ? forkJoin(existing.map(item => this.dashboardService.deleteItem(item.id))) : of([])).pipe(
      concatMap(() => forkJoin(initial.map(item => this.dashboardService.saveItem(item)))),
      map(saved => { this.applyLoadedItems(saved); return saved; }),
      finalize(() => { this.resetting = false; this.cdr.markForCheck(); })
    ));
  }

  private loadDashboardForUser(user: User | null) {
    if (user) {
      this.dashboardService.getDashboard().subscribe(items => {
        if (items && items.length > 0) {
          this.applyLoadedItems(items);
        } else {
          forkJoin(this.getInitialLayout().map(item => this.dashboardService.saveItem(item))).subscribe({
            next: saved => this.applyLoadedItems(saved),
            error: () => { this.errorMessage = 'Dashboard konnte nicht angelegt werden.'; this.cdr.markForCheck(); }
          });
        }
      }, () => { this.errorMessage = 'Dashboard konnte nicht geladen werden.'; this.cdr.markForCheck(); });
    } else {
      const items: DashboardItem[] = JSON.parse(localStorage.getItem('dashboard') || '[]');

      if (items && items.length > 0) {
        this.applyLoadedItems(items);
      } else {
        const initialItems = this.getInitialLayout();
        initialItems.forEach(item => item.id = this.generateId());
        this.applyLoadedItems(initialItems);
        this.storeLocally();
      }
    }
  }

  private storeLocally() {
    localStorage.setItem('dashboard', JSON.stringify(this.dashboard));
  }

  private saveItem(item: DashboardItem) {
    clearTimeout(this.saveTimeouts.get(item));
    // Persist new cards immediately so rapid additions get independent IDs.
    if (!item.id) {
      this.persistItem(item);
      return;
    }
    this.saveTimeouts.set(item, setTimeout(() => {
      this.saveTimeouts.delete(item);
      this.persistItem(item);
    }, 300));
  }

  private persistItem(item: DashboardItem) {
    if (this.auth.user) {
      this.mutations.next(() => this.dashboardService.saveItem(item).pipe(
        concatMap(saved => { item.id = saved.id; this.cdr.markForCheck(); return of(saved); })
      ));
    } else {
      if (!item.id) item.id = this.generateId();
      this.storeLocally();
    }
  }

  private flushPendingSaves() {
    for (const [item, timer] of this.saveTimeouts) {
      clearTimeout(timer);
      this.persistItem(item);
    }
    this.saveTimeouts.clear();
  }

  ngOnDestroy() {
    this.flushPendingSaves();
    // Completing the queue drains outstanding requests before it unsubscribes.
    this.mutations.complete();
  }

  private onItemChange(item: GridsterItemConfig) {
    const dashboardItem = this.dashboard.find(d => d === item) ?? this.dashboard.find(d => d.id && d.id === item['id']);
    if (!dashboardItem) return;

    dashboardItem.x = item.x!;
    dashboardItem.y = item.y!;
    dashboardItem.cols = item.cols!;
    dashboardItem.rows = item.rows!;

    this.saveItem(dashboardItem);
    this.recalcFixedCellSize();
    this.options['api']?.optionsChanged?.();
    this.cdr.markForCheck();
  }

  private applyLoadedItems(items: DashboardItem[]) {
    this.dashboard = normalizeWidgetLayout(items, this.columns);
    this.dashboardLoaded = true;
    this.refreshGrid();
  }

  private refreshGrid() {
    setTimeout(() => {
      this.cdr.detectChanges();
      this.recalcFixedCellSize();
      this.options['api']?.optionsChanged?.();
      this.options['api']?.resize?.();
    });
  }

  private recalcFixedCellSize() {
    if (!this.dashboard.length) return;

    const maxExtentCols = Math.max(...this.dashboard.map(d => d.x + d.cols));
    const maxExtentRows = Math.max(...this.dashboard.map(d => d.y + d.rows));

    // In edit mode keep a few empty rows below the cards as room to drop into.
    const spareRows = this.editMode ? 4 : 0;
    this.options = {
      ...this.options,
      minCols: Math.max(this.columns, maxExtentCols),
      minRows: Math.max(this.rows, maxExtentRows + spareRows),
    };
  }

  private getInitialLayout(): DashboardItem[] {
    return INITIAL_LAYOUT.map(([type, x, y, cols, rows]) => {
      const def = widgetDefinition(type)!;
      return {
        id: '', widget_type: type, x, y, cols, rows,
        minItemCols: def.minCols, minItemRows: def.minRows,
        config: {}, title: def.title, icon: def.icon,
      };
    });
  }

  // ── Layout manager ────────────────────────────────────────────────────────
  openLayoutPanel(): void {
    this.showLayoutPanel = true;
    this.newLayoutName = '';
    if (this.auth.user) {
      this.dashboardService.getLayouts().subscribe(layouts => {
        this.layouts = layouts; this.cdr.detectChanges();
      });
    } else {
      this.layouts = this.getLocalLayouts();
    }
    this.cdr.detectChanges();
  }

  closeLayoutPanel(): void { this.showLayoutPanel = false; }

  saveCurrentLayout(): void {
    const name = this.newLayoutName.trim();
    if (!name || this.layoutSaving) return;
    this.flushPendingSaves();
    this.layoutSaving = true;
    if (this.auth.user) {
      this.mutations.next(() => this.dashboardService.saveLayout(name).pipe(
        concatMap(layout => {
          this.layouts = [...this.layouts, layout];
          this.newLayoutName = '';
          return of(layout);
        }),
        finalize(() => { this.layoutSaving = false; this.cdr.markForCheck(); })
      ));
    } else {
      const snapshot = this.dashboard.map(({ id, widget_type, x, y, cols, rows, minItemCols, minItemRows, maxItemCols, maxItemRows, title, icon, config }) =>
        ({ id, widget_type, x, y, cols, rows, minItemCols, minItemRows, maxItemCols, maxItemRows, title, icon, config }));
      const newLayout: DashboardLayout = {
        id: this.generateId(), name, itemCount: snapshot.length, createdAt: new Date().toISOString()
      };
      const local = this.getLocalLayouts();
      local.push({ ...newLayout, items: snapshot } as any);
      localStorage.setItem('dashboard_layouts', JSON.stringify(local));
      this.layouts = [...this.layouts, newLayout];
      this.newLayoutName = '';
      this.layoutSaving = false;
      this.cdr.detectChanges();
    }
  }

  applyLayout(layout: DashboardLayout): void {
    if (this.layoutApplying) return;
    if (!confirm(`Layout „${layout.name}" laden? Das aktuelle Dashboard wird ersetzt.`)) return;
    this.layoutApplying = true;
    if (this.auth.user) {
      this.flushPendingSaves();
      this.mutations.next(() => this.dashboardService.applyLayout(layout.id).pipe(
        concatMap(items => { this.applyLoadedItems(items); this.showLayoutPanel = false; return of(items); }),
        finalize(() => { this.layoutApplying = false; this.cdr.markForCheck(); })
      ));
    } else {
      const all: any[] = JSON.parse(localStorage.getItem('dashboard_layouts') || '[]');
      const found = all.find(l => l.id === layout.id);
      if (found?.items) {
        const ids = found.items.map((i: any) => ({ ...i, id: this.generateId() }));
        localStorage.setItem('dashboard', JSON.stringify(ids));
        this.applyLoadedItems(ids);
      }
      this.layoutApplying = false;
      this.showLayoutPanel = false;
      this.cdr.detectChanges();
    }
  }

  deleteLayout(layout: DashboardLayout, e: Event): void {
    e.stopPropagation();
    if (!confirm(`Layout „${layout.name}" löschen?`)) return;
    if (this.auth.user) {
      this.dashboardService.deleteLayout(layout.id).subscribe(() => {
        this.layouts = this.layouts.filter(l => l.id !== layout.id); this.cdr.detectChanges();
      });
    } else {
      const all: any[] = JSON.parse(localStorage.getItem('dashboard_layouts') || '[]');
      localStorage.setItem('dashboard_layouts', JSON.stringify(all.filter(l => l.id !== layout.id)));
      this.layouts = this.layouts.filter(l => l.id !== layout.id);
      this.cdr.detectChanges();
    }
  }

  private getLocalLayouts(): DashboardLayout[] {
    try {
      const raw: any[] = JSON.parse(localStorage.getItem('dashboard_layouts') || '[]');
      return raw.map(l => ({ id: l.id, name: l.name, itemCount: (l.items || []).length, createdAt: l.createdAt }));
    } catch { return []; }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  private generateId(): string {
    return '_' + Math.random().toString(36).substring(2, 11);
  }

  @HostListener('window:resize')
  onResize() {
    this.isMobile = window.innerWidth < MOBILE_WIDTH;
    this.recalcFixedCellSize();
    this.options['api']?.optionsChanged?.();
    this.options['api']?.resize?.();
  }
}
