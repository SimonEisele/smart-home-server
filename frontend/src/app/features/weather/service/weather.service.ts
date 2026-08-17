import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap, map, catchError, throwError } from 'rxjs';
import {
  WeatherData, CurrentWeather, HourlyWeather, DailyWeather, CitySearchResult
} from '../model/weather.model';

const METEO = 'https://api.open-meteo.com/v1/forecast';
const GEO   = 'https://geocoding-api.open-meteo.com/v1/search';

const CURRENT_VARS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
  'is_day', 'precipitation', 'weather_code', 'cloud_cover',
  'surface_pressure', 'wind_speed_10m', 'wind_direction_10m',
  'wind_gusts_10m', 'uv_index',
].join(',');

const HOURLY_VARS = [
  'temperature_2m', 'relative_humidity_2m', 'apparent_temperature',
  'precipitation_probability', 'precipitation', 'weather_code', 'cloud_cover',
  'wind_speed_10m', 'wind_direction_10m', 'uv_index', 'visibility',
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
    try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }
    catch { return null; }
  }

  saveLocation(loc: { lat: number; lon: number; city: string; country: string; admin1?: string; timezone?: string }): void {
    localStorage.setItem(LS_KEY, JSON.stringify(loc));
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
    ).pipe(map(r => r.results ?? []));
  }

  getWeatherByCoords(
    lat: number, lon: number,
    city = '', country = '', admin1?: string, timezone?: string
  ): Observable<WeatherData> {
    const url = `${METEO}?latitude=${lat}&longitude=${lon}` +
      `&current=${CURRENT_VARS}&hourly=${HOURLY_VARS}&daily=${DAILY_VARS}` +
      `&timezone=auto&forecast_days=7&wind_speed_unit=kmh`;

    return this.http.get<any>(url).pipe(
      map(raw => this.mapRaw(raw, lat, lon, city, country, admin1, timezone)),
      catchError(err => throwError(() => new Error(`Wetterdaten konnten nicht geladen werden: ${err.message}`)))
    );
  }

  /** Backward-compat wrapper used by the widget */
  getWeather(): Observable<WeatherData> {
    const saved = this.getSavedLocation();
    if (saved) return this.getWeatherByCoords(saved.lat, saved.lon, saved.city, saved.country, saved.admin1, saved.timezone);
    return this.getWeatherByCoords(52.52, 13.41, 'Berlin', 'Deutschland');
  }

  private mapRaw(raw: any, lat: number, lon: number, city: string, country: string, admin1?: string, tz?: string): WeatherData {
    const c = raw.current ?? {};
    const current: CurrentWeather = {
      temperature:         c.temperature_2m        ?? 0,
      apparentTemperature: c.apparent_temperature  ?? 0,
      humidity:            c.relative_humidity_2m  ?? 0,
      precipitation:       c.precipitation         ?? 0,
      weatherCode:         c.weather_code          ?? 0,
      cloudCover:          c.cloud_cover           ?? 0,
      pressure:            c.surface_pressure      ?? 0,
      windSpeed:           c.wind_speed_10m        ?? 0,
      windDirection:       c.wind_direction_10m    ?? 0,
      windGusts:           c.wind_gusts_10m        ?? 0,
      uvIndex:             c.uv_index              ?? 0,
      isDay:               c.is_day === 1,
      time:                c.time                  ?? '',
    };

    const h = raw.hourly ?? {};
    const hourly: HourlyWeather[] = (h.time ?? []).map((t: string, i: number) => ({
      time:                     t,
      temperature:              h.temperature_2m?.[i]             ?? 0,
      apparentTemperature:      h.apparent_temperature?.[i]       ?? 0,
      humidity:                 h.relative_humidity_2m?.[i]       ?? 0,
      precipitationProbability: h.precipitation_probability?.[i]  ?? 0,
      precipitation:            h.precipitation?.[i]              ?? 0,
      weatherCode:              h.weather_code?.[i]               ?? 0,
      cloudCover:               h.cloud_cover?.[i]                ?? 0,
      windSpeed:                h.wind_speed_10m?.[i]             ?? 0,
      windDirection:            h.wind_direction_10m?.[i]         ?? 0,
      uvIndex:                  h.uv_index?.[i]                   ?? 0,
      visibility:               (h.visibility?.[i] ?? 0) / 1000,
    }));

    const d = raw.daily ?? {};
    const daily: DailyWeather[] = (d.time ?? []).map((t: string, i: number) => ({
      date:                       t,
      weatherCode:                d.weather_code?.[i]                   ?? 0,
      tempMax:                    d.temperature_2m_max?.[i]              ?? 0,
      tempMin:                    d.temperature_2m_min?.[i]              ?? 0,
      apparentTempMax:            d.apparent_temperature_max?.[i]        ?? 0,
      apparentTempMin:            d.apparent_temperature_min?.[i]        ?? 0,
      sunrise:                    d.sunrise?.[i]                         ?? '',
      sunset:                     d.sunset?.[i]                          ?? '',
      precipitationSum:           d.precipitation_sum?.[i]               ?? 0,
      precipitationHours:         d.precipitation_hours?.[i]             ?? 0,
      precipitationProbabilityMax: d.precipitation_probability_max?.[i]  ?? 0,
      windSpeedMax:               d.wind_speed_10m_max?.[i]              ?? 0,
      windGustsMax:               d.wind_gusts_10m_max?.[i]              ?? 0,
      windDirectionDominant:      d.wind_direction_10m_dominant?.[i]     ?? 0,
      uvIndexMax:                 d.uv_index_max?.[i]                    ?? 0,
    }));

    const resolvedCity = city || ((raw.timezone ?? '').replace('_', ' ').split('/').pop() ?? `${lat.toFixed(2)},${lon.toFixed(2)}`);

    return {
      location: { latitude: lat, longitude: lon, city: resolvedCity, country, admin1, timezone: raw.timezone ?? tz ?? 'UTC' },
      current,
      hourly,
      daily,
      updatedAt: new Date(),
    };
  }
}

