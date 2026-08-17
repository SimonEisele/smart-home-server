import { AfterViewInit, Component, ChangeDetectorRef, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DailyWeather, HourlyWeather, WeatherData } from '../model/weather.model';
import { WeatherIconPipe, WeatherLabelPipe } from '../pipes/weather.pipe';
import { WeatherService } from '../service/weather.service';

@Component({
  selector: 'weather-widget',
  standalone: true,
  imports: [ CommonModule, WeatherIconPipe, WeatherLabelPipe ],
  templateUrl: './weather.widget.html',
  styleUrl: './weather.widget.css',
})
export class WeatherWidget implements OnInit, AfterViewInit {
  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;

  data!: WeatherData;
  visibleHourlyData: HourlyWeather[] = [];
  visibleDailyData: DailyWeather[] = [];

  readonly GAP = 12;
  readonly HOURLY_WIDTH = 72;
  readonly DAILY_WIDTH = 72;

  constructor(private weatherService: WeatherService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.weatherService.getWeather().subscribe((weather) => {
      this.data = weather;
      this.updateVisibleData();
      this.cdr.detectChanges();
    });
  }

  ngAfterViewInit(): void {
    const observer = new ResizeObserver(() => {
      setTimeout(() => { this.updateVisibleData(); this.cdr.detectChanges(); });
    });
    observer.observe(this.container.nativeElement);
    setTimeout(() => { this.updateVisibleData(); this.cdr.detectChanges(); });
  }

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
    const now = new Date();
    return hours.filter(h => new Date(h.time) >= now);
  }

  hourTime(isoTime: string): string {
    const d = new Date(isoTime);
    return `${String(d.getHours()).padStart(2,'0')}:00`;
  }

  dayName(dateStr: string, i: number): string {
    if (i === 0) return 'Heute';
    const d = new Date(dateStr);
    return ['So','Mo','Di','Mi','Do','Fr','Sa'][d.getDay()];
  }
}
