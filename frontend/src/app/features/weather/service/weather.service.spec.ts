import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WeatherService } from './weather.service';

describe('Weather API mapping', () => {
  let service: WeatherService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting()]});
    service = TestBed.inject(WeatherService); http = TestBed.inject(HttpTestingController);
    localStorage.removeItem('weather_location');
  });
  afterEach(() => { http.verify(); localStorage.removeItem('weather_location'); });
  it('preserves missing measurements, zero rain and hourly UV without inventing a city from the timezone', () => {
    let result: any;
    service.getWeatherByCoords(47, 7).subscribe(value => result = value);
    const request = http.expectOne(r => r.url.startsWith('https://api.open-meteo.com/'));
    const url = new URL(request.request.url);
    expect(url.searchParams.get('current')).not.toContain('uv_index');
    expect(url.searchParams.get('hourly')).toContain('is_day');
    request.flush({ timezone: 'Europe/Zurich', current: {time:'2026-10-08T12:15', temperature_2m: 18, precipitation: 0}, hourly: {time:['2026-10-08T12:00'], uv_index:[3], is_day:[1], visibility:[10000]}, daily: {time:[]} });
    expect(result.location.city).toBe('Mein Standort'); expect(result.current.precipitation).toBe(0);
    expect(Number.isNaN(result.current.windGusts)).toBe(true); expect(result.current.uvIndex).toBe(3);
    expect(result.hourly[0].visibility).toBe(10); expect(result.hourly[0].isDay).toBe(true);
  });
  it('rejects incomplete current data instead of showing a sunny zero-degree forecast', () => {
    let error: Error | undefined;
    service.getWeatherByCoords(47,7).subscribe({error:e => error=e});
    http.expectOne(r=>r.url.startsWith('https://api.open-meteo.com/')).flush({current:{}});
    expect(error?.message).toContain('nicht geladen');
  });
  it('ignores malformed and invalid saved coordinates', () => {
    for(const saved of ['{', 'null', '{"lat":999,"lon":7}', '{"lat":"47","lon":7}']) {
      localStorage.setItem('weather_location',saved); expect(service.getSavedLocation()).toBeNull();
    }
    service.saveLocation({lat:47,lon:7,city:'Biel',country:'Schweiz'}); expect(service.getSavedLocation()?.city).toBe('Biel');
  });
});
