import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectorRef, Component, ElementRef, HostListener, Inject, OnDestroy, OnInit, AfterViewInit, PLATFORM_ID, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import {
  AnalyticsService,
  AnalyticsOverview,
  AnalyticsSeriesPoint,
  AnalyticsTopItem,
  AnalyticsDeviceItem,
  AnalyticsMapItem,
  AnalyticsGalleryItem,
  AnalyticsDroneItem,
  AnalyticsPopupDurationItem,
  AnalyticsPopupDurationDetailItem,
} from '../../services/analytics.service';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [ CommonModule, FormsModule, TranslateModule ],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css',
})
export class Analytics implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('viewsChart') viewsChart?: ElementRef<HTMLDivElement>;
  @ViewChild('deviceChart') deviceChart?: ElementRef<HTMLDivElement>;

  overview?: AnalyticsOverview;
  viewsSeries: AnalyticsSeriesPoint[] = [];
  topVideos: AnalyticsTopItem[] = [];
  deviceStats: AnalyticsDeviceItem[] = [];
  mapStats: AnalyticsMapItem[] = [];
  galleryStats: AnalyticsGalleryItem[] = [];
  droneStats: AnalyticsDroneItem[] = [];
  popupDurationStats: AnalyticsPopupDurationItem[] = [];
  popupDurationVideos: AnalyticsPopupDurationDetailItem[] = [];
  popupDurationPictures: AnalyticsPopupDurationDetailItem[] = [];
  popupDurationDrones: AnalyticsPopupDurationDetailItem[] = [];
  popupDurationFilter = 'all';

  readonly dayOptions = [7, 14, 30, 60, 90, 180];
  selectedDays = 30;

  showSection = {
    overview: true,
    trend: true,
    devices: true,
    topVideos: true,
    topSpots: true,
    gallery: true,
    topDrones: true,
    popupDuration: true,
  };

  loading = true;
  errorMessageKey = '';
  private readonly isBrowser: boolean;
  private echarts?: typeof import('echarts');
  private viewsChartInstance?: any;
  private deviceChartInstance?: any;
  private subscription?: Subscription;
  private viewReady = false;

  constructor(
    private analyticsService: AnalyticsService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    // Defer initial load to AfterViewInit so charts can render immediately.
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.loadData();
    if (!this.loading) {
      void this.renderCharts();
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.disposeCharts();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.isBrowser) return;
    try { this.viewsChartInstance?.resize?.(); } catch {}
    try { this.deviceChartInstance?.resize?.(); } catch {}
  }

  onDaysChange(value: string): void {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    this.selectedDays = next;
    this.loadData();
  }

  onToggleChange(): void {
    if (!this.isBrowser) return;
    setTimeout(() => {
      void this.renderCharts();
    }, 0);
  }

  get topPopupDurations(): Array<{ label: string; kindKey: string; avg_seconds: number; count: number }> {
    return this.getPopupDurationItems()
      .sort((a, b) => b.avg_seconds - a.avg_seconds);
  }

  get popupDurationFilteredResults(): Array<{ label: string; kindKey: string; avg_seconds: number; count: number }> {
    const filter = this.popupDurationFilter;
    const items = this.getPopupDurationItems();
    if (filter === 'all') return items;
    const filterKey = `popup.kind.${filter}`;
    return items.filter(item => item.kindKey === filterKey);
  }

  private getPopupDurationItems(): Array<{ label: string; kindKey: string; avg_seconds: number; count: number }> {
    const items: Array<{ label: string; kindKey: string; avg_seconds: number; count: number }> = [];
    for (const item of this.popupDurationVideos) {
      items.push({ label: item.name, kindKey: 'popup.kind.video', avg_seconds: item.avg_seconds, count: item.count });
    }
    for (const item of this.popupDurationDrones) {
      items.push({ label: item.name, kindKey: 'popup.kind.drone', avg_seconds: item.avg_seconds, count: item.count });
    }
    for (const item of this.popupDurationPictures) {
      items.push({ label: item.name, kindKey: 'popup.kind.picture', avg_seconds: item.avg_seconds, count: item.count });
    }
    return items;
  }

  formatDuration(seconds?: number | null): string {
    const totalSeconds = Math.max(0, Math.round(Number(seconds ?? 0)));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }

  private loadData(): void {
    this.subscription?.unsubscribe();
    this.loading = true;
    this.errorMessageKey = '';

    const days = this.selectedDays;
    this.subscription = forkJoin({
      overview: this.analyticsService.getOverview(days),
      views: this.analyticsService.getViewsPerDay(days),
      top: this.analyticsService.getTopVideos(days, 8),
      device: this.analyticsService.getDeviceStats(days),
      map: this.analyticsService.getMapStats(days, 8),
      gallery: this.analyticsService.getGalleryStats(days, 8),
      drones: this.analyticsService.getDroneStats(days, 8),
      popupDuration: this.analyticsService.getPopupDurationStats(days),
      popupDurationDetail: this.analyticsService.getPopupDurationDetail(days),
    }).subscribe({
      next: ({ overview, views, top, device, map, gallery, drones, popupDuration, popupDurationDetail }) => {
        this.overview = overview;
        this.viewsSeries = views.series ?? [];
        this.topVideos = top.items ?? [];
        this.deviceStats = device.items ?? [];
        this.mapStats = map.items ?? [];
        this.galleryStats = gallery.items ?? [];
        this.droneStats = drones.items ?? [];
        this.popupDurationStats = popupDuration.items ?? [];
        this.popupDurationVideos = popupDurationDetail.videos ?? [];
        this.popupDurationPictures = popupDurationDetail.pictures ?? [];
        this.popupDurationDrones = popupDurationDetail.drones ?? [];
        this.loading = false;
        this.cdr.detectChanges();
        if (this.viewReady) {
          void this.renderCharts();
        }
      },
      error: (err: HttpErrorResponse) => {
        if (err?.status === 401 || err?.status === 403) {
          this.errorMessageKey = 'analytics.errorAuth';
        } else {
          this.errorMessageKey = 'analytics.errorGeneric';
        }
        this.loading = false;
      },
    });
  }

  private async renderCharts(): Promise<void> {
    if (!this.isBrowser) return;
    const viewsEl = this.viewsChart?.nativeElement;
    const deviceEl = this.deviceChart?.nativeElement;
    if (!viewsEl && !deviceEl) return;

    if (!this.echarts) {
      this.echarts = await import('echarts');
    }

    const echarts = this.echarts;
    if (!echarts) return;

    this.viewsChartInstance?.dispose?.();
    this.deviceChartInstance?.dispose?.();

    if (viewsEl) {
      this.viewsChartInstance = echarts.init(viewsEl, undefined, { renderer: 'canvas' });
    }
    if (deviceEl) {
      this.deviceChartInstance = echarts.init(deviceEl, undefined, { renderer: 'canvas' });
    }

    const viewLabels = this.viewsSeries.map(p => p.date);
    const viewCounts = this.viewsSeries.map(p => p.count);

    this.viewsChartInstance?.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      grid: { left: 10, right: 24, top: 20, bottom: 26, containLabel: true },
      xAxis: {
        type: 'category',
        data: viewLabels,
        axisLine: { lineStyle: { color: 'rgba(174, 193, 222, 0.35)' } },
        axisLabel: { color: 'rgba(237, 244, 255, 0.7)' },
      },
      yAxis: {
        type: 'value',
        axisLine: { lineStyle: { color: 'rgba(174, 193, 222, 0.35)' } },
        splitLine: { lineStyle: { color: 'rgba(174, 193, 222, 0.15)' } },
        axisLabel: { color: 'rgba(237, 244, 255, 0.7)' },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          data: viewCounts,
          lineStyle: { color: '#6fe7ff', width: 3 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(111, 231, 255, 0.45)' },
                { offset: 1, color: 'rgba(111, 231, 255, 0.05)' },
              ],
            },
          },
          symbol: 'circle',
          symbolSize: 6,
          itemStyle: { color: '#6fe7ff' },
        },
      ],
    });

    const deviceLabels = this.deviceStats.map(d => d.device || 'unknown');
    const deviceData = this.deviceStats.map(d => ({ value: d.count, name: d.device || 'unknown' }));

    this.deviceChartInstance?.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item' },
      legend: {
        orient: 'vertical',
        right: 8,
        top: 'center',
        textStyle: { color: 'rgba(237, 244, 255, 0.7)' },
      },
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          center: ['35%', '50%'],
          label: { color: 'rgba(237, 244, 255, 0.75)' },
          data: deviceData,
        },
      ],
    });
  }

  private disposeCharts(): void {
    try { this.viewsChartInstance?.dispose?.(); } catch {}
    try { this.deviceChartInstance?.dispose?.(); } catch {}
    this.viewsChartInstance = undefined;
    this.deviceChartInstance = undefined;
  }
}
