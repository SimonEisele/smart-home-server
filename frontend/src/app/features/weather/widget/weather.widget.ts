import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
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

  constructor(private weatherService: WeatherService) {}

  ngOnInit() {
    this.weatherService.getWeather().subscribe((weather) => {
      this.data = weather;
    });
  }

  ngAfterViewInit(): void {
    const observer = new ResizeObserver(() => {
      setTimeout(() => this.updateVisibleData());
    });

    observer.observe(this.container.nativeElement);
    setTimeout(() => this.updateVisibleData());
  }

  updateVisibleData() {
    if (!this.data) {
      console.log('NO DATA');
      return;
    }

    const width = this.container.nativeElement.clientWidth;
    if (width <= 0) return;

    const hourlyCount = Math.max(1, Math.floor((width + this.GAP) / (this.HOURLY_WIDTH + this.GAP)));
    const dailyCount = Math.max(1, Math.floor((width + this.GAP) / (this.DAILY_WIDTH + this.GAP)));

    const upcomingHours = this.getUpcomingHours(this.data.hourly);

    this.visibleHourlyData = upcomingHours.slice(0, hourlyCount);
    this.visibleDailyData = this.data.daily.slice(0, dailyCount);
  }

  getUpcomingHours(hours: HourlyWeather[]): HourlyWeather[] {
    const now = new Date();

    return hours.filter(h => {
      const [hour, minute] = h.time.split(':').map(Number);
      const [year, month, day] = h.date.split('-').map(Number);

      const hourDate = new Date(year, month - 1, day, hour, minute, 0);

      return hourDate >= now;
    });
  }

  getUpcomingDays(days: DailyWeather[]): DailyWeather[] {
    const now = new Date();

    return days.filter(d => {
      const [hour, minute] = d.date.split(':').map(Number);
      const [year, month, day] = d.date.split('-').map(Number);

      const date = new Date(year, month - 1, day);

      return date >= now;
    });
  }
}
