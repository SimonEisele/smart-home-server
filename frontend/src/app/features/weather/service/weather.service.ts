import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { WeatherData } from '../model/weather.model';

@Injectable({ providedIn: 'root' })
export class WeatherService {
  constructor() {}

  getWeather(): Observable<WeatherData> {
    // Mock-Daten für Testzwecke
    return of({
      current: {
        temperature: 12,
        weatherCode: 1,
        precipitation: 0,
        windSpeed: 5,
        windDirection: 180
      },
      hourly: [
        { date: '2026-01-28', time: '20:00', temperature: 10, weatherCode: 1, precipitation: 0, windSpeed: 4, windDirection: 180 },
        { date: '2026-01-28', time: '21:00', temperature: 11, weatherCode: 1, precipitation: 0, windSpeed: 4, windDirection: 190 },
        { date: '2026-01-28', time: '22:00', temperature: 12, weatherCode: 2, precipitation: 0, windSpeed: 5, windDirection: 200 },
        { date: '2026-01-28', time: '23:00', temperature: 12, weatherCode: 2, precipitation: 0, windSpeed: 5, windDirection: 210 },
        { date: '2026-01-29', time: '00:00', temperature: 12, weatherCode: 2, precipitation: 0, windSpeed: 5, windDirection: 220 },
        { date: '2026-01-29', time: '01:00', temperature: 12, weatherCode: 2, precipitation: 0, windSpeed: 5, windDirection: 240 },
        { date: '2026-01-29', time: '02:00', temperature: 12, weatherCode: 2, precipitation: 0, windSpeed: 5, windDirection: 250 },
        { date: '2026-01-29', time: '03:00', temperature: 12, weatherCode: 2, precipitation: 0, windSpeed: 5, windDirection: 260 },
      ],
      daily: [
        { date: '2025-12-24', minTemperature: 10, maxTemperature: 20, weatherCode: 1, precipitation: 0, windSpeed: 4, windDirection: 180 },
        { date: '2025-12-25', minTemperature: 8, maxTemperature: 15, weatherCode: 2, precipitation: 10, windSpeed: 4, windDirection: 180 },
        { date: '2025-12-26', minTemperature: 5, maxTemperature: 13, weatherCode: 3, precipitation: 20, windSpeed: 4, windDirection: 180 },
        { date: '2025-12-27', minTemperature: 5, maxTemperature: 10, weatherCode: 3, precipitation: 50, windSpeed: 4, windDirection: 180 },
        { date: '2025-12-28', minTemperature: 3, maxTemperature: 7, weatherCode: 3, precipitation: 100, windSpeed: 4, windDirection: 180 },
      ]
    });
  }
}