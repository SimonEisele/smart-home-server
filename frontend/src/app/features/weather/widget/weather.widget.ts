import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AfterViewInit, Component, OnDestroy, DestroyRef, inject, ChangeDetectorRef, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { dateTimeInZone } from '../../../shared/date-utils';
import { DailyWeather, HourlyWeather, WeatherData } from '../model/weather.model';
import { WeatherSymbol } from '../icon/weather-icon';
import { WeatherLabelPipe } from '../pipes/weather.pipe';
import { WeatherService } from '../service/weather.service';

@Component({
  selector: 'weather-widget',
  standalone: true,
  imports: [ CommonModule, WeatherSymbol, WeatherLabelPipe, RouterLink ],
  templateUrl: './weather.widget.html',
  styleUrl: './weather.widget.css',
})
export class WeatherWidget implements OnInit, AfterViewInit, OnDestroy {
  private observer?: ResizeObserver;
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;

  data: WeatherData | null = null;
  error = '';
  loading = false;
  visibleHourlyData: HourlyWeather[] = [];
  visibleDailyData: DailyWeather[] = [];

  readonly GAP = 12;
  readonly HOURLY_WIDTH = 72;
  readonly DAILY_WIDTH = 72;

  constructor(private weatherService: WeatherService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.load(); }

  load(): void {
    if (this.loading) return;
    this.loading = true;
    this.error = '';
    this.weatherService.getWeather().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: weather => {
        this.data = weather;
        this.loading = false;
        this.updateVisibleData();
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error = this.weatherService.getSavedLocation()
          ? 'Wetter nicht verfügbar. Bitte erneut laden.'
          : 'Wähle zuerst deinen Wetterort.';
        this.cdr.markForCheck();
      },
    });
  }

  ngAfterViewInit(): void {
    this.observer = new ResizeObserver(() => {
      setTimeout(() => { if (!this.destroyRef.destroyed) { this.updateVisibleData(); this.cdr.detectChanges(); } });
    });
    this.observer.observe(this.container.nativeElement);
    setTimeout(() => { if (!this.destroyRef.destroyed) { this.updateVisibleData(); this.cdr.detectChanges(); } });
  }

  ngOnDestroy(): void { this.observer?.disconnect(); }

  updateVisibleData() {
    if (!this.data) return;
    const width = this.container.nativeElement.clientWidth;
    if (width <= 0) return;
    const hourlyCount = Math.max(1, Math.floor((width + this.GAP) / (this.HOURLY_WIDTH + this.GAP)));
    const dailyCount  = Math.max(1, Math.floor((width + this.GAP) / (this.DAILY_WIDTH  + this.GAP)));
    this.visibleHourlyData = this.getUpcomingHours(this.data.hourly).slice(0, hourlyCount);
    this.visibleDailyData  = this.data.daily.slice(0, dailyCount);
  }

  getUpcomingHours(hours: HourlyWeather[]): HourlyWeather[] {
    const hour = dateTimeInZone(new Date(), this.data?.location.timezone || 'UTC').slice(0, 13);
    return hours.filter(h => h.time.slice(0, 13) >= hour);
  }

  hourTime(isoTime: string): string {
    return isoTime.slice(11, 16);
  }

  value(n: number): string {
    return Number.isFinite(n) ? new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 }).format(n) : '—';
  }

  dayName(dateStr: string, i: number): string {
    if (dateStr === dateTimeInZone(new Date(), this.data?.location.timezone || 'UTC').slice(0, 10)) return 'Heute';
    const d = new Date(dateStr + 'T12:00:00Z');
    return ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getUTCDay()];
  }
}
