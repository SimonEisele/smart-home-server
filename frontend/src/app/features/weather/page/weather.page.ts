import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { WeatherService } from '../service/weather.service';
import { WeatherData, HourlyWeather, DailyWeather, CitySearchResult } from '../model/weather.model';
import { wmoIcon, wmoLabel } from '../pipes/weather.pipe';

const SUN_R   = 90;
const SUN_CX  = 100;
const SUN_CY  = 100;
const ARC_LEN = Math.PI * SUN_R; // ~282.74

@Component({
  selector: 'weather-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './weather.page.html',
  styleUrl: './weather.page.css',
})
export class WeatherPage implements OnInit, OnDestroy {
  weather: WeatherData | null = null;
  loading  = false;
  locating = false;
  error: string | null = null;

  // Map layer tabs
  radarLayer = 'rain';
  europeLayer = 'clouds';

  readonly RADAR_LAYERS: Array<{ key: string; label: string }> = [
    { key: 'rain', label: 'Regen' }, { key: 'wind', label: 'Wind' },
    { key: 'clouds', label: 'Wolken' }, { key: 'pressure', label: 'Druck' },
  ];
  readonly EUROPE_LAYERS: Array<{ key: string; label: string }> = [
    { key: 'clouds', label: 'Wolken/Satellit' }, { key: 'pressure', label: 'Druck' },
    { key: 'wind', label: 'Wind' }, { key: 'temp', label: 'Temperatur' },
  ];

  citySearch = '';
  cityResults: CitySearchResult[] = [];
  showSearch  = false;
  searching   = false;
  private searchTimer: any = null;

  constructor(private svc: WeatherService, private cdr: ChangeDetectorRef, private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    const saved = this.svc.getSavedLocation();
    if (saved) {
      this.loadWeather(saved.lat, saved.lon, saved.city, saved.country, saved.admin1, saved.timezone);
    } else {
      this.useGeolocation();
    }
  }

  // ── Location ─────────────────────────────────────────────────────────
  useGeolocation(): void {
    this.locating = true; this.error = null; this.cdr.detectChanges();
    this.svc.getBrowserLocation().subscribe({
      next: ({ lat, lon }) => {
        this.locating = false;
        this.loadWeather(lat, lon);
      },
      error: (msg) => {
        this.locating = false;
        this.error = 'Standort konnte nicht ermittelt werden. Bitte Stadt suchen.';
        this.showSearch = true;
        this.cdr.detectChanges();
      },
    });
  }

  refresh(): void {
    if (!this.weather) return;
    const { latitude: lat, longitude: lon, city, country, admin1, timezone } = this.weather.location;
    this.loadWeather(lat, lon, city, country, admin1, timezone);
  }

  private loadWeather(lat: number, lon: number, city = '', country = '', admin1?: string, tz?: string): void {
    this.loading = true; this.error = null; this.cdr.detectChanges();
    this.svc.getWeatherByCoords(lat, lon, city, country, admin1, tz).subscribe({
      next: w => {
        this.weather = w; this.loading = false;
        if (!city) {
          // save with resolved city from timezone
          this.svc.saveLocation({ lat, lon, city: w.location.city, country: w.location.country, admin1: w.location.admin1, timezone: w.location.timezone });
        }
        this.cdr.detectChanges();
      },
      error: (err: Error) => { this.error = err.message; this.loading = false; this.cdr.detectChanges(); },
    });
  }

  // ── City search ───────────────────────────────────────────────────────
  onSearchInput(): void {
    clearTimeout(this.searchTimer);
    if (!this.citySearch.trim()) { this.cityResults = []; return; }
    this.searchTimer = setTimeout(() => {
      this.searching = true; this.cdr.detectChanges();
      this.svc.searchCity(this.citySearch).subscribe(r => {
        this.cityResults = r; this.searching = false; this.cdr.detectChanges();
      });
    }, 350);
  }

  selectCity(r: CitySearchResult): void {
    this.svc.saveLocation({ lat: r.latitude, lon: r.longitude, city: r.name, country: r.country, admin1: r.admin1, timezone: r.timezone });
    this.showSearch = false; this.citySearch = ''; this.cityResults = [];
    this.loadWeather(r.latitude, r.longitude, r.name, r.country, r.admin1, r.timezone);
  }

  // ── Computed ──────────────────────────────────────────────────────────
  get next24Hours(): HourlyWeather[] {
    if (!this.weather) return [];
    const nowStr = new Date().toISOString().slice(0, 16); // "2026-07-03T14"
    const idx = this.weather.hourly.findIndex(h => h.time >= nowStr);
    const start = Math.max(0, idx);
    return this.weather.hourly.slice(start, start + 24);
  }

  get todayForecast(): DailyWeather | null {
    if (!this.weather) return null;
    const today = new Date().toISOString().split('T')[0];
    return this.weather.daily.find(d => d.date === today) ?? this.weather.daily[0] ?? null;
  }

  get weekTempRange(): { min: number; max: number } {
    if (!this.weather) return { min: 0, max: 30 };
    const all = this.weather.daily.flatMap(d => [d.tempMin, d.tempMax]);
    return { min: Math.min(...all), max: Math.max(...all) };
  }

  tempBarLeft(d: DailyWeather): number {
    const { min, max } = this.weekTempRange;
    return ((d.tempMin - min) / (max - min || 1)) * 100;
  }
  tempBarWidth(d: DailyWeather): number {
    const { min, max } = this.weekTempRange;
    return ((d.tempMax - d.tempMin) / (max - min || 1)) * 100;
  }

  get dewPoint(): number {
    if (!this.weather) return 0;
    const { temperature: T, humidity: RH } = this.weather.current;
    // Magnus approximation
    const a = 17.625, b = 243.04;
    const alpha = Math.log(RH / 100) + (a * T) / (b + T);
    return Math.round((b * alpha) / (a - alpha));
  }

  get dayProgressPct(): number {
    if (!this.todayForecast) return 0;
    const rise = new Date(this.todayForecast.sunrise).getTime();
    const set  = new Date(this.todayForecast.sunset).getTime();
    const now  = Date.now();
    return Math.max(0, Math.min(100, ((now - rise) / (set - rise)) * 100));
  }

  get sunX(): number { return SUN_CX + SUN_R * Math.cos(Math.PI - (this.dayProgressPct / 100) * Math.PI); }
  get sunY(): number { return SUN_CY - SUN_R * Math.sin(Math.PI - (this.dayProgressPct / 100) * Math.PI); }
  get sunDashArray(): string {
    const len = (this.dayProgressPct / 100) * ARC_LEN;
    return `${len} ${ARC_LEN - len}`;
  }

  get dayLength(): string {
    if (!this.todayForecast) return '';
    const rise = new Date(this.todayForecast.sunrise).getTime();
    const set  = new Date(this.todayForecast.sunset).getTime();
    const mins = Math.round((set - rise) / 60000);
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${h}h ${m}min`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  icon(code: number, isDay = true): string { return wmoIcon(code, isDay); }
  label(code: number): string { return wmoLabel(code); }

  windDir(deg: number): string {
    const dirs = ['N','NO','O','SO','S','SW','W','NW'];
    return dirs[Math.round(deg / 45) % 8];
  }

  windArrow(deg: number): string {
    // CSS rotation applied in template
    return '↑';
  }

  uvLabel(uv: number): string {
    if (uv < 3) return 'Niedrig';
    if (uv < 6) return 'Moderat';
    if (uv < 8) return 'Hoch';
    if (uv < 11) return 'Sehr hoch';
    return 'Extrem';
  }

  uvColor(uv: number): string {
    if (uv < 3)  return '#68d391';
    if (uv < 6)  return '#f6e05e';
    if (uv < 8)  return '#f6ad55';
    if (uv < 11) return '#fc8181';
    return '#b794f4';
  }

  precipColor(prob: number): string {
    if (prob < 20) return 'rgba(111,231,255,0.3)';
    if (prob < 50) return 'rgba(111,231,255,0.55)';
    if (prob < 80) return 'rgba(79,209,197,0.7)';
    return '#4fd1c5';
  }

  tempColor(t: number): string {
    if (t <= 0)  return '#90cdf4';
    if (t <= 10) return '#b2f5ea';
    if (t <= 18) return '#9ae6b4';
    if (t <= 25) return '#f6e05e';
    if (t <= 30) return '#f6ad55';
    return '#fc8181';
  }

  heroGradient(): string {
    const w = this.weather;
    if (!w) return '';
    const code = w.current.weatherCode;
    const isDay = w.current.isDay;
    if (!isDay) return 'linear-gradient(145deg,#0f172a 0%,#1e293b 60%,#0f172a 100%)';
    if (code === 0) return 'linear-gradient(145deg,rgba(251,191,36,0.15),rgba(251,146,60,0.08))';
    if (code <= 2)  return 'linear-gradient(145deg,rgba(147,197,253,0.12),rgba(196,181,253,0.06))';
    if (code <= 3)  return 'linear-gradient(145deg,rgba(100,116,139,0.15),rgba(51,65,85,0.1))';
    if (code <= 67) return 'linear-gradient(145deg,rgba(96,165,250,0.15),rgba(56,189,248,0.08))';
    if (code <= 77) return 'linear-gradient(145deg,rgba(186,230,253,0.15),rgba(224,242,254,0.08))';
    return 'linear-gradient(145deg,rgba(99,102,241,0.12),rgba(139,92,246,0.06))';
  }

  dayName(dateStr: string, i: number): string {
    if (i === 0) return 'Heute';
    if (i === 1) return 'Morgen';
    const d = new Date(dateStr);
    const names = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    return names[d.getDay()];
  }

  formatTime(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  hourLabel(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:00`;
  }

  round(n: number, dec = 0): number { return Number(n.toFixed(dec)); }

  // ── Weather maps ──────────────────────────────────────────────────────
  private windyUrl(lat: number, lon: number, zoom: number, overlay: string, pressure: boolean): string {
    const p = new URLSearchParams({
      lat: lat.toFixed(4), lon: lon.toFixed(4),
      detailLat: lat.toFixed(4), detailLon: lon.toFixed(4),
      zoom: String(zoom), level: 'surface', overlay,
      product: 'ecmwf', menu: '', message: 'true', marker: 'true',
      calendar: '24', pressure: pressure ? 'true' : '',
      type: 'map', location: 'coordinates', detail: 'true',
      metricWind: 'km/h', metricTemp: '°C', radarRange: '-1',
    });
    return `https://embed.windy.com/embed2.html?${p.toString()}`;
  }

  get radarMapUrl(): SafeResourceUrl {
    if (!this.weather) return this.sanitizer.bypassSecurityTrustResourceUrl('about:blank');
    const { latitude: lat, longitude: lon } = this.weather.location;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      this.windyUrl(lat, lon, 8, this.radarLayer, this.radarLayer === 'pressure')
    );
  }

  get europeMapUrl(): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      this.windyUrl(52, 15, 4, this.europeLayer, true)
    );
  }

  ngOnDestroy(): void {}
}

