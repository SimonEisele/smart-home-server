import { DialogDirective } from '../../shared/directives/dialog.directive';
import { Component, ElementRef, HostListener, OnInit, ViewChild, ChangeDetectorRef, DestroyRef, inject, OnDestroy } from '@angular/core';
import { CompactType, DisplayGrid, Gridster, GridsterConfig, GridsterItem, GridsterItemConfig, GridType } from 'angular-gridster2';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardItem } from '../models/dashboard.models';
import { normalizeWidgetLayout } from '../models/widget-layout';
import { WidgetHost } from '../../widgets/widget-host/widget-host';
import { Card } from '../card/card';
import { WIDGET_REGISTRY, WidgetDefinition } from '../../widgets/widgets.registry';
import { AddWidget } from '../../popovers/add-widget-popver/add-widget-popover';
import { DashboardService, DashboardLayout } from '../service/dashboard.service';
import { AuthService } from '../../core/auth/service/auth.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, concatMap, distinctUntilChanged, finalize, forkJoin, of } from 'rxjs';
import { User } from '../../core/auth/model/auth.model';

const ADD_WIDGET_POPOVER_WIDTH = 250;
const VIEWPORT_PADDING = 8;
const ARROW_WIDTH = 20;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DialogDirective,  CommonModule, FormsModule, GridsterItem, Gridster, WidgetHost, Card, AddWidget ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly mutations = new Subject<() => Observable<unknown>>();
  private readonly saveTimeouts = new Map<DashboardItem, ReturnType<typeof setTimeout>>();
  errorMessage = "";
  isMobile = window.innerWidth < 1100;
  @ViewChild('dashboardGrid', { read: ElementRef }) dashboardGrid?: ElementRef<HTMLElement>;
  @ViewChild('addWidgetButton', { read: ElementRef }) addWidgetBtn!: ElementRef;

  showAddWidgetPopover = false;
  addWidgetPopoverBottom = 0;
  addWidgetPopoverLeft = 0;
  addWidgetPopoverArrowLeft = 0;

  options!: GridsterConfig;
  dashboard: DashboardItem[] = [];
  dashboardLoaded = false;
  availableWidgets: WidgetDefinition[] = WIDGET_REGISTRY;
  editMode: boolean = false;
  containerWith = window.innerWidth;
  containerHeight = window.innerHeight;
  columns = 12;
  rows = 12;
  maxColumns = 24;
  maxRows = 24;
  navbarHeight = 64;

  // Layout manager
  showLayoutPanel = false;
  layouts: DashboardLayout[] = [];
  newLayoutName = '';
  layoutSaving = false;
  layoutApplying = false;


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
      this.updateGridsterOptions();
    });
  }

  ngOnInit() {
    this.initGrid();

    this.auth.user$.pipe(
      distinctUntilChanged((a, b) => a?.id === b?.id),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(user => {
      this.loadDashboardForUser(user);
    });
  }

  private initGrid() {
    this.options = {
      gridType: GridType.VerticalFixed,
      mobileBreakpoint: 1100,
      keepFixedHeightInMobile: true,
      compactType: CompactType.None,
      margin: 8,
      outerMargin: false,
      useTransformPositioning: false,
      fixedColWidth: this.containerWith / this.columns,
      fixedRowHeight: 48,
      minCols: this.columns,
      maxCols: this.columns,
      minRows: this.rows,
      maxRows: 1000,
      draggable: {
        enabled: this.editMode,
        stop: (item: GridsterItemConfig) => this.onItemChange(item)
      },
      resizable: {
        enabled: this.editMode,
        stop: (item: GridsterItemConfig) => this.onItemChange(item)
      },
      swap: false,
      pushItems: true,
      displayGrid: DisplayGrid.OnDragAndResize,
      api: {
        optionsChanged: () => {},
        resize: () => {},
      },
    };
  }

  private updateGridsterOptions() {
    this.options = {
      ...this.options,
      draggable: {
        enabled: this.editMode,
        stop: (item: GridsterItemConfig) => this.onItemChange(item)
      },
      resizable: {
        enabled: this.editMode,
        stop: (item: GridsterItemConfig) => this.onItemChange(item)
      },
    }
  }

  toggleAddWidgetPopover() {
    this.showAddWidgetPopover = !this.showAddWidgetPopover;

    if (this.showAddWidgetPopover) {
      queueMicrotask(() => {
        const rect = this.addWidgetBtn.nativeElement.getBoundingClientRect();

        this.addWidgetPopoverBottom = window.innerHeight - rect.top + 24;

        let left = rect.left + rect.width / 2 - ADD_WIDGET_POPOVER_WIDTH / 2;
        const minLeft = VIEWPORT_PADDING;
        const maxLeft = window.innerWidth - ADD_WIDGET_POPOVER_WIDTH - VIEWPORT_PADDING;
        this.addWidgetPopoverLeft = Math.round(Math.max(minLeft, Math.min(left, maxLeft)));

        this.addWidgetPopoverArrowLeft = Math.round(rect.left + rect.width / 2 - this.addWidgetPopoverLeft - ARROW_WIDTH / 2);
      });
    }
  }

  addWidget(widgetType: string) {
    const def = WIDGET_REGISTRY.find(w => w.type === widgetType);
    if (!def) return;

    const newItem: DashboardItem = {
      id: '',
      widget_type: def.type,
      x: 0,
      y: 0,
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

    this.dashboard.push(newItem);
    this.saveItem(newItem);
    this.showAddWidgetPopover = false;
  }

  removeWidget(id: string) {
    const item = this.dashboard.find(w => w.id === id);
    if (!item) return;
    clearTimeout(this.saveTimeouts.get(item));
    this.saveTimeouts.delete(item);
    if (this.auth.user) {
      this.mutations.next(() => this.dashboardService.deleteItem(id).pipe(
        finalize(() => this.cdr.markForCheck()),
        // Keep the card until the server confirms deletion.
        concatMap(() => {
          this.dashboard = this.dashboard.filter(w => w !== item);
          return of(null);
        })
      ));
    } else {
      this.dashboard = this.dashboard.filter(w => w !== item);
      localStorage.setItem('dashboard', JSON.stringify(this.dashboard));
    }
  }

  private loadDashboardForUser(user: User | null) {
    if (user) {
      this.dashboardService.getDashboard().subscribe(items => {
        if (items && items.length > 0) {
          this.applyLoadedItems(items);
        } else {
          const initialItems = this.getInitialLayout();
          forkJoin(initialItems.map(item => this.dashboardService.saveItem(item))).subscribe({
            next: saved => this.applyLoadedItems(saved),
            error: () => { this.errorMessage = 'Dashboard konnte nicht angelegt werden.'; this.cdr.markForCheck(); }
          });
        }
      }, () => { this.errorMessage = 'Dashboard konnte nicht geladen werden.'; this.cdr.markForCheck(); });
    } else {
      let items: DashboardItem[] = JSON.parse(localStorage.getItem('dashboard') || '[]');

      if (items && items.length > 0) {
        this.applyLoadedItems(items);
      } else {
        const initialItems = this.getInitialLayout().map(item => ({ ...item }));
        initialItems.forEach(item => item.id = this.generateId());
        localStorage.setItem('dashboard', JSON.stringify(initialItems));
        this.applyLoadedItems(initialItems);
      }
    }
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
      localStorage.setItem('dashboard', JSON.stringify(this.dashboard));
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
    const dashboardItem = this.dashboard.find(d => d.id === item['id']);
    if (!dashboardItem) return;

    dashboardItem.x = item.x!;
    dashboardItem.y = item.y!;
    dashboardItem.cols = item.cols!;
    dashboardItem.rows = item.rows!;

    this.saveItem(dashboardItem);
    this.recalcFixedCellSize();
    this.options['api'].optionsChanged();
  }

  private applyLoadedItems(items: DashboardItem[]) {
    this.dashboard = normalizeWidgetLayout(items, this.columns);
    this.dashboardLoaded = true;
    setTimeout(() => {
      this.cdr.detectChanges();
      this.recalcFixedCellSize();
      this.options['api'].optionsChanged();
      this.options['api'].resize();
    });
  }

  private recalcFixedCellSize() {
    if (!this.dashboard.length) return;

    const maxExtentCols = Math.max(...this.dashboard.map(d => d.x + d.cols));
    const maxExtentRows = Math.max(...this.dashboard.map(d => d.y + d.rows));

    const effectiveCols = Math.max(this.columns, maxExtentCols);
    const effectiveRows = Math.max(this.rows, maxExtentRows);

    // Fit the saved coordinates to the actual grid viewport.
    this.options = {
      ...this.options,

      fixedRowHeight: 48,
      minCols: effectiveCols,
      minRows: effectiveRows,
    };
  }

  private getInitialLayout(): DashboardItem[] {
    return [
      { id: '', widget_type: 'datetime', x: 0, y: 0, cols: 3, rows: 4, minItemCols: 3, minItemRows: 4, config: {}, title: 'Uhr & Datum', icon: 'datetime.svg' },
      { id: '', widget_type: 'calendar', x: 3, y: 0, cols: 5, rows: 5, minItemCols: 3, minItemRows: 5, config: {}, title: 'Als Nächstes', icon: 'calendar.svg' },
      { id: '', widget_type: 'weather', x: 8, y: 0, cols: 4, rows: 5, minItemCols: 3, minItemRows: 5, config: {}, title: 'Wetter', icon: 'weather.svg' },
      { id: '', widget_type: 'menuplan', x: 0, y: 5, cols: 4, rows: 8, minItemCols: 3, minItemRows: 5, config: {}, title: 'Nächste Mahlzeiten', icon: 'menuplan.svg' },
      { id: '', widget_type: 'todos', x: 4, y: 5, cols: 4, rows: 8, minItemCols: 3, minItemRows: 5, config: {}, title: 'Offene Aufgaben', icon: 'todo.svg' },
      { id: '', widget_type: 'shoppinglist', x: 8, y: 5, cols: 4, rows: 8, minItemCols: 3, minItemRows: 5, config: {}, title: 'Einkaufsliste', icon: 'shoppinglist.svg' }
    ];
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
    return '_' + Math.random().toString(36).substr(2, 9);
  }

  @HostListener('window:resize')
  onResize() {
    this.isMobile = window.innerWidth < 1100;
    this.recalcFixedCellSize();
    this.options['api'].optionsChanged();
    this.options['api'].resize();
  }
}
