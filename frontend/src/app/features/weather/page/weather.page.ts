import { Component, OnInit, OnDestroy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WeatherSymbol } from '../icon/weather-icon';
import { dateTimeInZone } from '../../../shared/date-utils';
import { WeatherService } from '../service/weather.service';
import { WeatherData, HourlyWeather, DailyWeather, CitySearchResult } from '../model/weather.model';
import { wmoLabel } from '../pipes/weather.pipe';

@Component({
  selector: 'weather-page', standalone: true,
  imports: [CommonModule, FormsModule, WeatherSymbol],
  templateUrl: './weather.page.html', styleUrl: './weather.page.css',
})
export class WeatherPage implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private weatherRequest?: Subscription;
  private searchRequest?: Subscription;
  private locationRequest?: Subscription;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private searchRevision = 0;
  weather: WeatherData | null = null;
  loading = false;
  locating = false;
  error = '';
  showSearch = false;
  citySearch = '';
  cityResults: CitySearchResult[] = [];
  searching = false;
  searchCompleted = false;
  searchError = '';
  selectedDate = '';
  mapVisible = false;
  mapLayer = 'rain';
  mapRegion = 'local';
  mapUrl: SafeResourceUrl | null = null;
  readonly mapLayers = [{ key: 'rain', label: 'Niederschlag' }, { key: 'wind', label: 'Wind' }, { key: 'clouds', label: 'Wolken' }, { key: 'temp', label: 'Temperatur' }];

  constructor(private svc: WeatherService, private cdr: ChangeDetectorRef, private sanitizer: DomSanitizer) {}

  ngOnInit(): void {
    const saved = this.svc.getSavedLocation();
    if (saved) this.loadWeather(saved.lat, saved.lon, saved.city, saved.country, saved.admin1, saved.timezone);
    else this.showSearch = true;
  }

  useGeolocation(): void {
    if (this.locating || this.loading) return;
    this.locating = true;
    this.error = '';
    this.locationRequest = this.svc.getBrowserLocation().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ lat, lon }) => { this.locating = false; this.loadWeather(lat, lon); },
      error: () => {
        this.locating = false;
        this.error = 'Standort nicht verfügbar. Suche stattdessen einen Ort.';
        this.showSearch = true;
        this.cdr.markForCheck();
      },
    });
  }

  refresh(): void {
    if (this.loading || this.locating || !this.weather) return;
    const l = this.weather.location;
    this.loadWeather(l.latitude, l.longitude, l.city, l.country, l.admin1, l.timezone);
  }

  private loadWeather(lat: number, lon: number, city = '', country = '', admin1?: string, tz?: string): void {
    // Only the latest location may replace the page or its saved location.
    this.weatherRequest?.unsubscribe();
    this.loading = true;
    this.error = '';
    this.weatherRequest = this.svc.getWeatherByCoords(lat, lon, city, country, admin1, tz)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: w => {
          this.weather = w;
          this.selectedDate = this.todayForecast?.date ?? w.daily[0]?.date ?? '';
          this.loading = false;
          this.svc.saveLocation({ lat, lon, city: w.location.city, country: w.location.country, admin1: w.location.admin1, timezone: w.location.timezone });
          this.updateMap();
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.error = this.weather
            ? 'Aktualisierung fehlgeschlagen. Du siehst weiterhin die zuletzt geladenen Daten.'
            : 'Wetterdaten konnten nicht geladen werden. Bitte den Ort erneut wählen.';
          this.showSearch = !this.weather;
          this.cdr.markForCheck();
        },
      });
  }

  toggleSearch(): void {
    this.showSearch = !this.showSearch;
    if (!this.showSearch) this.cancelSearch();
  }

  private cancelSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchRequest?.unsubscribe();
    this.searchRevision++;
    this.searching = false;
    this.cityResults = [];
    this.searchError = '';
    this.searchCompleted = false;
  }

  onSearchInput(): void {
    this.cancelSearch();
    const query = this.citySearch.trim();
    if (query.length < 2) return;
    const revision = this.searchRevision;
    this.searching = true;
    this.searchTimer = setTimeout(() => {
      this.searchRequest = this.svc.searchCity(query).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: results => {
          if (revision !== this.searchRevision) return;
          this.cityResults = results;
          this.searching = false;
          this.searchCompleted = true;
          this.cdr.markForCheck();
        },
        error: () => {
          if (revision !== this.searchRevision) return;
          this.searching = false;
          this.searchError = 'Ortssuche fehlgeschlagen. Bitte erneut suchen.';
          this.cdr.markForCheck();
        },
      });
    }, 300);
  }

  selectCity(r: CitySearchResult): void {
    this.cancelSearch();
    this.locationRequest?.unsubscribe();
    this.locating = false;
    this.showSearch = false;
    this.citySearch = '';
    this.loadWeather(r.latitude, r.longitude, r.name, r.country, r.admin1, r.timezone);
  }

  get todayDate(): string {
    return dateTimeInZone(new Date(), this.weather?.location.timezone || 'UTC').slice(0, 10);
  }
  get todayForecast(): DailyWeather | null {
    return this.weather?.daily.find(d => d.date === this.todayDate) ?? null;
  }
  get selectedDay(): DailyWeather | null {
    return this.weather?.daily.find(d => d.date === this.selectedDate) ?? null;
  }
  get next24Hours(): HourlyWeather[] {
    if (!this.weather) return [];
    const hour = dateTimeInZone(new Date(), this.weather.location.timezone).slice(0, 13);
    return this.weather.hourly.filter(h => h.time.slice(0, 13) >= hour).slice(0, 24);
  }
  get displayedHours(): HourlyWeather[] {
    if (!this.selectedDate) return [];
    if (this.selectedDate === this.todayDate) return this.next24Hours;
    return this.weather?.hourly.filter(h => h.time.startsWith(this.selectedDate)) ?? [];
  }
  get rainSummary(): string {
    if (!this.next24Hours.length) return 'Keine Stundenvorhersage verfügbar.';
    const rain = this.next24Hours.find(h => Number.isFinite(h.precipitation) && h.precipitation > 0);
    if (rain) return `Niederschlag vorhergesagt: ${this.dayName(rain.time.slice(0, 10))}, ${this.formatTime(rain.time)} Uhr.`;
    return this.next24Hours.some(h => !Number.isFinite(h.precipitation))
      ? 'Niederschlagsdaten sind teilweise nicht verfügbar.'
      : 'Kein Niederschlag in den nächsten 24 Stunden vorhergesagt.';
  }

  selectDay(day: DailyWeather): void { this.selectedDate = day.date; }
  label(code: number): string { return wmoLabel(code); }
  value(n: number | undefined, decimals = 0): string {
    return n != null && Number.isFinite(n) ? new Intl.NumberFormat('de-CH', { maximumFractionDigits: decimals }).format(n) : '—';
  }
  windDir(deg: number): string {
    return Number.isFinite(deg) ? ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) + 360) % 360 / 45) % 8] : '—';
  }
  formatTime(iso: string): string { return iso?.slice(11, 16) || '—'; }
  dayName(date: string, _index?: number): string {
    if (date === this.todayDate) return 'Heute';
    const tomorrow = new Date(this.todayDate + 'T12:00:00Z');
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (date === tomorrow.toISOString().slice(0, 10)) return 'Morgen';
    return new Intl.DateTimeFormat('de-CH', { weekday: 'short', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
  }
  shortDate(date: string): string { return `${date.slice(8, 10)}.${date.slice(5, 7)}.`; }
  uvLabel(uv: number): string {
    if (!Number.isFinite(uv)) return 'Keine Daten';
    return uv < 3 ? 'Niedrig' : uv < 6 ? 'Moderat' : uv < 8 ? 'Hoch' : uv < 11 ? 'Sehr hoch' : 'Extrem';
  }
  isDayHour(h: HourlyWeather): boolean {
    if (h.isDay != null) return h.isDay;
    const day = this.weather?.daily.find(d => d.date === h.time.slice(0, 10));
    return !!day && h.time >= day.sunrise && h.time < day.sunset;
  }
  get dayLength(): string {
    const day = this.selectedDay;
    if (!day?.sunrise || !day.sunset) return '—';
    const minutes = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
    const duration = minutes(day.sunset) - minutes(day.sunrise);
    return duration >= 0 ? `${Math.floor(duration / 60)} h ${duration % 60} min` : '—';
  }

  showMap(): void { this.mapVisible = true; this.updateMap(); }
  changeMapLayer(layer: string): void { this.mapLayer = layer; this.updateMap(); }
  changeMapRegion(region: string): void { this.mapRegion = region; this.updateMap(); }
  private updateMap(): void {
    if (!this.mapVisible || !this.weather) return;
    const l = this.weather.location;
    const params = new URLSearchParams({ lat: String(this.mapRegion === 'local' ? l.latitude : 52), lon: String(this.mapRegion === 'local' ? l.longitude : 15), zoom: this.mapRegion === 'local' ? '8' : '4', level: 'surface', overlay: this.mapLayer, product: 'ecmwf', marker: 'true', metricWind: 'km/h', metricTemp: '°C' });
    this.mapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`https://embed.windy.com/embed2.html?${params}`);
  }

  ngOnDestroy(): void { this.cancelSearch(); }
}
