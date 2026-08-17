import { Component, ElementRef, HostListener, OnInit, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CompactType, DisplayGrid, Gridster, GridsterConfig, GridsterItem, GridsterItemConfig, GridType } from 'angular-gridster2';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DashboardItem } from '../models/dashboard.models';
import { WidgetHost } from '../../widgets/widget-host/widget-host';
import { Card } from '../card/card';
import { WIDGET_REGISTRY, WidgetDefinition } from '../../widgets/widgets.registry';
import { AddWidget } from '../../popovers/add-widget-popver/add-widget-popover';
import { DashboardService, DashboardLayout } from '../service/dashboard.service';
import { AuthService } from '../../core/auth/service/auth.service';
import { User } from '../../core/auth/model/auth.model';

const ADD_WIDGET_POPOVER_WIDTH = 250;
const VIEWPORT_PADDING = 8;
const ARROW_WIDTH = 20;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [ CommonModule, FormsModule, GridsterItem, Gridster, WidgetHost, Card, AddWidget ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
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
  navbarHeight = 80;

  // Layout manager
  showLayoutPanel = false;
  layouts: DashboardLayout[] = [];
  newLayoutName = '';
  layoutSaving = false;
  layoutApplying = false;

  private saveTimeout?: any;

  constructor(public dashboardService: DashboardService, private cdr: ChangeDetectorRef, public auth: AuthService) {
    this.dashboardService.editMode$.subscribe(mode => {
      this.editMode = mode;
      this.updateGridsterOptions();
    });
  }

  ngOnInit() {
    this.initGrid();

    this.auth.user$.subscribe(user => {
      this.loadDashboardForUser(user);
    });
  }

  private initGrid() {
    this.options = {
      gridType: GridType.Fixed,
      compactType: CompactType.None,
      margin: 0,
      outerMargin: false,
      useTransformPositioning: false,
      fixedColWidth: this.containerWith / this.columns,
      fixedRowHeight: (this.containerHeight - this.navbarHeight) / this.rows,
      minCols: this.columns,
      maxCols: this.maxColumns,
      minRows: this.rows,
      maxRows: this.maxRows,
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
      maxItemCols: def.maxCols,
      rows: def.defaultRows,
      minItemRows: def.minRows,
      maxItemRows: def.maxRows,
      title: def.title,
      icon: def.icon,
      config: {}
    };

    this.dashboard.push(newItem);
    this.saveItem(newItem);
  }

  removeWidget(id: string) {
    this.dashboard = this.dashboard.filter(w => w.id !== id);
    clearTimeout(this.saveTimeout);
    const user = this.auth.user;
    if (user) {
      this.dashboardService.deleteItem(id).subscribe();
    } else {
      const saved: DashboardItem[] = JSON.parse(localStorage.getItem('dashboard') || '[]');
      const updated = saved.filter(d => d.id !== id);
      console.log(updated);
      localStorage.setItem('dashboard', JSON.stringify(updated));
    }
  }

  private loadDashboardForUser(user: User | null) {
    if (user) {
      this.dashboardService.getDashboard().subscribe(items => {
        if (items && items.length > 0) {
          this.applyLoadedItems(items);
        } else {
          const initialItems = this.getInitialLayout();
          this.dashboard = initialItems;
          initialItems.forEach(item =>
            this.dashboardService.saveItem(item).subscribe(saved => {
              item.id = saved.id;
              this.applyLoadedItems(this.dashboard);
            })
          );
        }
      });
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
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      const user = this.auth.user;
      if (user) {
        if (!item.id) {
          this.dashboardService.saveItem(item).subscribe(saved => item.id = saved.id);
        } else {
          this.dashboardService.saveItem(item).subscribe();
        }
      } else {
        if (!item.id) item.id = this.generateId();
        const saved: DashboardItem[] = JSON.parse(localStorage.getItem('dashboard') || '[]');
        const existingIndex = saved.findIndex(d => d.id === item.id);
        if (existingIndex >= 0) {
          saved[existingIndex] = item;
        } else {
          saved.push(item);
        }
        localStorage.setItem('dashboard', JSON.stringify(saved));
      }
    }, 300);
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
    items.forEach(item => {
      item.minItemCols = item.minItemCols || 1;
      item.minItemRows = item.minItemRows || 1;
      item.maxItemCols = item.maxItemCols || this.maxColumns;
      item.maxItemRows = item.maxItemRows || this.maxRows;
      // Always pull icon + title from registry so they never need to be persisted
      const def = WIDGET_REGISTRY.find(w => w.type === item.widget_type);
      if (def) {
        item.icon  = item.icon  || def.icon;
        item.title = item.title || def.title;
      }
    });
    this.dashboard = items;
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

    // Create a NEW options reference so Angular + gridster detect the change
    this.options = {
      ...this.options,
      fixedColWidth: window.innerWidth / effectiveCols,
      fixedRowHeight: (window.innerHeight - this.navbarHeight) / effectiveRows,
      minCols: effectiveCols,
      minRows: effectiveRows,
    };
  }

  private getInitialLayout(): DashboardItem[] {
    return [
      { id: '', widget_type: 'datetime',  x: 0, y: 0, cols: 3, minItemCols: 3, rows: 4, minItemRows: 4, config: {}, title: 'Datum und Uhrzeit', icon: 'datetime.svg' },
      { id: '', widget_type: 'menuplan',  x: 3, y: 0, cols: 9, minItemCols: 2, rows: 4, minItemRows: 4, config: {}, title: 'Menüplan',           icon: 'menuplan.svg' },
      { id: '', widget_type: 'weather',   x: 0, y: 4, cols: 4, minItemCols: 2, rows: 8, minItemRows: 8, config: {}, title: 'Wetter',             icon: 'weather.svg'  },
      { id: '', widget_type: 'todos',     x: 4, y: 4, cols: 3, minItemCols: 2, rows: 8, minItemRows: 4, config: {}, title: "ToDo's",             icon: 'todo.svg'     },
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
    this.layoutSaving = true;
    if (this.auth.user) {
      this.dashboardService.saveLayout(name).subscribe(layout => {
        this.layouts = [...this.layouts, layout];
        this.newLayoutName = '';
        this.layoutSaving = false;
        this.cdr.detectChanges();
      });
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
      this.dashboardService.applyLayout(layout.id).subscribe(items => {
        this.applyLoadedItems(items);
        this.layoutApplying = false;
        this.showLayoutPanel = false;
        this.cdr.detectChanges();
      });
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
    this.recalcFixedCellSize();
    this.options['api'].optionsChanged();
    this.options['api'].resize();
  }
}
