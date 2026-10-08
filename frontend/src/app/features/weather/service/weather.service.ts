import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap, map, catchError, throwError, timeout } from 'rxjs';
import {
  WeatherData, CurrentWeather, HourlyWeather, DailyWeather, CitySearchResult
} from '../model/weather.model';

const METEO = 'https://api.open-meteo.com/v1/forecast';
const GEO   = 'https://geocoding-api.open-meteo.com/v1/search';

const CURRENT_VARS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
  'is_day', 'precipitation', 'weather_code', 'cloud_cover',
  'surface_pressure', 'wind_speed_10m', 'wind_direction_10m',
  'wind_gusts_10m',
].join(',');

const HOURLY_VARS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
  'precipitation_probability', 'precipitation', 'weather_code', 'cloud_cover',
  'wind_speed_10m', 'wind_direction_10m', 'uv_index', 'visibility', 'is_day',
].join(',');

const DAILY_VARS = [
  'weather_code', 'temperature_2m_max', 'temperature_2m_min',
  'apparent_temperature_max', 'apparent_temperature_min',
  'sunrise', 'sunset',
  'precipitation_sum', 'precipitation_hours', 'precipitation_probability_max',
  'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant',
  'uv_index_max',
].join(',');

const LS_KEY = 'weather_location';

@Injectable({ providedIn: 'root' })
export class WeatherService {
  constructor(private http: HttpClient) {}

  getSavedLocation(): { lat: number; lon: number; city: string; country: string; admin1?: string; timezone?: string } | null {
    try {
      const r = localStorage.getItem(LS_KEY);
      const loc = r ? JSON.parse(r) : null;
      return loc && Number.isFinite(loc.lat) && Math.abs(loc.lat) <= 90 && Number.isFinite(loc.lon) && Math.abs(loc.lon) <= 180 ? loc : null;
    }
    catch { return null; }
  }

  saveLocation(loc: { lat: number; lon: number; city: string; country: string; admin1?: string; timezone?: string }): void {
    try { localStorage.setItem(LS_KEY, JSON.stringify(loc)); } catch { /* Storage may be disabled; weather still works. */ }
  }

  getBrowserLocation(): Observable<{ lat: number; lon: number }> {
    return new Observable(obs => {
      if (!navigator.geolocation) { obs.error('Geolocation nicht unterstützt'); return; }
      navigator.geolocation.getCurrentPosition(
        p => { obs.next({ lat: p.coords.latitude, lon: p.coords.longitude }); obs.complete(); },
        e => obs.error(e.message || 'Standort konnte nicht ermittelt werden'),
        { timeout: 10000 }
      );
    });
  }

  searchCity(name: string): Observable<CitySearchResult[]> {
    if (!name.trim()) return from([[]]);
    return this.http.get<{ results?: CitySearchResult[] }>(
      `${GEO}?name=${encodeURIComponent(name)}&count=8&language=de&format=json`
    ).pipe(timeout(15000), map(r => r.results ?? []));
  }

  getWeatherByCoords(
    lat: number, lon: number,
    city = '', country = '', admin1?: string, timezone?: string
  ): Observable<WeatherData> {
    const url = `${METEO}?latitude=${lat}&longitude=${lon}` +
      `&current=${CURRENT_VARS}&hourly=${HOURLY_VARS}&daily=${DAILY_VARS}` +
      `&timezone=auto&forecast_days=7&wind_speed_unit=kmh`;

    return this.http.get<any>(url).pipe(
      timeout(15000),
      map(raw => this.mapRaw(raw, lat, lon, city, country, admin1, timezone)),
      catchError(err => throwError(() => new Error('Wetterdaten konnten nicht geladen werden. Bitte erneut versuchen.')))
    );
  }

  /** Backward-compat wrapper used by the widget */
  getWeather(): Observable<WeatherData> {
    const saved = this.getSavedLocation();
    if (saved) return this.getWeatherByCoords(saved.lat, saved.lon, saved.city, saved.country, saved.admin1, saved.timezone);
    return throwError(() => new Error('Wähle auf der Wetterseite zuerst einen Ort.'));
  }

  private mapRaw(raw: any, lat: number, lon: number, city: string, country: string, admin1?: string, tz?: string): WeatherData {
    const c = raw.current ?? {};
    const current: CurrentWeather = {
      temperature:         c.temperature_2m        ?? Number.NaN,
      apparentTemperature: c.apparent_temperature  ?? Number.NaN,
      humidity:            c.relative_humidity_2m  ?? Number.NaN,
      precipitation:       c.precipitation         ?? Number.NaN,
      weatherCode:         c.weather_code          ?? Number.NaN,
      cloudCover:          c.cloud_cover           ?? Number.NaN,
      pressure:            c.surface_pressure      ?? Number.NaN,
      windSpeed:           c.wind_speed_10m        ?? Number.NaN,
      windDirection:       c.wind_direction_10m    ?? Number.NaN,
      windGusts:           c.wind_gusts_10m        ?? Number.NaN,
      uvIndex:             c.uv_index              ?? Number.NaN,
      isDay:               c.is_day === 1,
      time:                c.time                  ?? '',
    };

    const h = raw.hourly ?? {};
    const hourly: HourlyWeather[] = (h.time ?? []).map((t: string, i: number) => ({
      time:                     t,
      isDay:                    h.is_day?.[i] == null ? undefined : h.is_day[i] === 1,
      temperature:              h.temperature_2m?.[i]             ?? Number.NaN,
      apparentTemperature:      h.apparent_temperature?.[i]       ?? Number.NaN,
      humidity:                 h.relative_humidity_2m?.[i]       ?? Number.NaN,
      precipitationProbability: h.precipitation_probability?.[i]  ?? Number.NaN,
      precipitation:            h.precipitation?.[i]              ?? Number.NaN,
      weatherCode:              h.weather_code?.[i]               ?? Number.NaN,
      cloudCover:               h.cloud_cover?.[i]                ?? Number.NaN,
      windSpeed:                h.wind_speed_10m?.[i]             ?? Number.NaN,
      windDirection:            h.wind_direction_10m?.[i]         ?? Number.NaN,
      uvIndex:                  h.uv_index?.[i]                   ?? Number.NaN,
      visibility:               (h.visibility?.[i] ?? Number.NaN) / 1000,
    }));

    const d = raw.daily ?? {};
    const daily: DailyWeather[] = (d.time ?? []).map((t: string, i: number) => ({
      date:                       t,
      weatherCode:                d.weather_code?.[i]                   ?? Number.NaN,
      tempMax:                    d.temperature_2m_max?.[i]              ?? Number.NaN,
      tempMin:                    d.temperature_2m_min?.[i]              ?? Number.NaN,
      apparentTempMax:            d.apparent_temperature_max?.[i]        ?? Number.NaN,
      apparentTempMin:            d.apparent_temperature_min?.[i]        ?? Number.NaN,
      sunrise:                    d.sunrise?.[i]                         ?? '',
      sunset:                     d.sunset?.[i]                          ?? '',
      precipitationSum:           d.precipitation_sum?.[i]               ?? Number.NaN,
      precipitationHours:         d.precipitation_hours?.[i]             ?? Number.NaN,
      precipitationProbabilityMax: d.precipitation_probability_max?.[i]  ?? Number.NaN,
      windSpeedMax:               d.wind_speed_10m_max?.[i]              ?? Number.NaN,
      windGustsMax:               d.wind_gusts_10m_max?.[i]              ?? Number.NaN,
      windDirectionDominant:      d.wind_direction_10m_dominant?.[i]     ?? Number.NaN,
      uvIndexMax:                 d.uv_index_max?.[i]                    ?? Number.NaN,
    }));

    if (!raw.current?.time || !Number.isFinite(current.temperature)) {
      throw new Error('Unvollständige Wetterdaten');
    }
    const currentHour = hourly.find(h => h.time.slice(0, 13) === current.time.slice(0, 13));
    current.uvIndex = currentHour?.uvIndex ?? Number.NaN;
    // A time zone name is not a reverse-geocoded city.
    const resolvedCity = city || 'Mein Standort';

    return {
      location: { latitude: lat, longitude: lon, city: resolvedCity, country, admin1, timezone: raw.timezone ?? tz ?? 'UTC' },
      current,
      hourly,
      daily,
      updatedAt: new Date(),
    };
  }
}

