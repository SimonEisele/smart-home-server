import { TestBed, ComponentFixture } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { WeatherPage } from './weather.page';
import { WeatherService } from '../service/weather.service';
import { WeatherData, CitySearchResult } from '../model/weather.model';

const city = (name: string): CitySearchResult => ({ id: 1, name, latitude: 47, longitude: 7, country: 'Schweiz', country_code: 'CH', timezone: 'Europe/Zurich' });
function data(name = 'Biel'): WeatherData {
  return {
    location: { latitude: 47, longitude: 7, city: name, country: 'Schweiz', timezone: 'Europe/Zurich' },
    updatedAt: new Date('2026-10-08T10:37:00Z'),
    current: { temperature: 18, apparentTemperature: 17, humidity: 60, precipitation: 0, weatherCode: 2, cloudCover: 40, pressure: 955, windSpeed: 12, windDirection: 225, windGusts: 20, uvIndex: 2, isDay: true, time: '2026-10-08T12:30' },
    hourly: ['2026-10-08', '2026-10-09'].flatMap(date => Array.from({length: 24}, (_, hour) => ({ time: `${date}T${String(hour).padStart(2,'0')}:00`, temperature: 18, apparentTemperature: 17, humidity: 60, precipitationProbability: 20, precipitation: 0, weatherCode: 2, cloudCover: 40, windSpeed: 12, windDirection: 225, uvIndex: 2, visibility: 10, isDay: hour >= 7 && hour < 19 }))),
    daily: ['2026-10-08', '2026-10-09'].map(date => ({ date, weatherCode: 2, tempMin: 10, tempMax: 20, apparentTempMin: 9, apparentTempMax: 20, sunrise: `${date}T07:30`, sunset: `${date}T18:45`, precipitationSum: 0, precipitationHours: 0, precipitationProbabilityMax: 20, windSpeedMax: 15, windGustsMax: 25, windDirectionDominant: 225, uvIndexMax: 3 })),
  };
}
describe('Weather planning workflow', () => {
  let page: WeatherPage;
  let fixture: ComponentFixture<WeatherPage>;
  const service = { getSavedLocation: vi.fn(), getWeatherByCoords: vi.fn(), getBrowserLocation: vi.fn(), searchCity: vi.fn(), saveLocation: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-08T10:37:00Z'));
    vi.resetAllMocks();
    service.getSavedLocation.mockReturnValue(null);
    service.getWeatherByCoords.mockReturnValue(of(data()));
    TestBed.configureTestingModule({imports: [WeatherPage], providers: [{provide: WeatherService, useValue: service}]});
    fixture = TestBed.createComponent(WeatherPage); page = fixture.componentInstance;
  });
  afterEach(() => { fixture.destroy(); vi.useRealTimers(); });
  it('lets people choose a location before requesting browser permission', () => {
    page.ngOnInit();
    expect(page.showSearch).toBe(true);
    expect(service.getBrowserLocation).not.toHaveBeenCalled();
  });
  it('keeps the current forecast on refresh failure and does not save a failed new city', () => {
    page.selectCity(city('Biel')); const previous = page.weather;
    service.saveLocation.mockClear(); service.getWeatherByCoords.mockReturnValue(throwError(() => new Error('offline')));
    page.selectCity(city('Thun'));
    expect(page.weather).toBe(previous); expect(page.error).toContain('zuletzt geladenen');
    expect(service.saveLocation).not.toHaveBeenCalled();
    page.refresh(); expect(service.getWeatherByCoords.mock.lastCall?.[2]).toBe('Biel');
  });
  it('uses only the latest weather request and locks duplicate refreshes', () => {
    const first = new Subject<WeatherData>(), second = new Subject<WeatherData>();
    service.getWeatherByCoords.mockReturnValueOnce(first).mockReturnValueOnce(second);
    page.selectCity(city('Biel')); page.selectCity(city('Thun')); first.next(data('Biel'));
    expect(page.weather).toBeNull(); second.next(data('Thun')); expect(page.weather?.location.city).toBe('Thun');
    service.getWeatherByCoords.mockReturnValue(new Subject<WeatherData>());
    page.refresh(); page.refresh(); expect(service.getWeatherByCoords).toHaveBeenCalledTimes(3);
  });
  it('includes the current hour in the location timezone and crosses midnight clearly', () => {
    page.weather = data();
    expect(page.next24Hours).toHaveLength(24);
    expect(page.next24Hours[0].time).toBe('2026-10-08T12:00');
    expect(page.next24Hours[12].time).toBe('2026-10-09T00:00');
    expect(page.dayName('2026-10-08')).toBe('Heute'); expect(page.dayName('2026-10-09')).toBe('Morgen');
    page.weather.location.timezone = 'America/New_York';
    expect(page.next24Hours[0].time).toBe('2026-10-08T06:00');
  });
  it('shows the selected day hours, sunlight times and night icons independently of browser timezone', () => {
    page.weather = data(); page.selectDay(page.weather.daily[1]);
    expect(page.displayedHours).toHaveLength(24); expect(page.displayedHours[0].time).toBe('2026-10-09T00:00');
    expect(page.dayLength).toBe('11 h 15 min'); expect(page.formatTime('2026-10-09T07:30')).toBe('07:30');
    expect(page.isDayHour(page.displayedHours[0])).toBe(false);
  });
  it('distinguishes missing values from zero and reports missing rainfall data', () => {
    page.weather = data(); expect(page.value(0)).toBe('0'); expect(page.value(NaN)).toBe('—'); expect(page.uvLabel(NaN)).toBe('Keine Daten');
    page.weather.hourly[13].precipitation = NaN; expect(page.rainSummary).toContain('teilweise');
    page.weather.hourly[14].precipitation = 1; expect(page.rainSummary).toContain('14:00');
  });
  it('discards stale search results and supports search errors and retry', () => {
    const first = new Subject<CitySearchResult[]>(), second = new Subject<CitySearchResult[]>();
    service.searchCity.mockReturnValueOnce(first).mockReturnValueOnce(second);
    page.citySearch = 'Biel'; page.onSearchInput(); vi.advanceTimersByTime(300);
    page.citySearch = 'Thun'; page.onSearchInput(); vi.advanceTimersByTime(300);
    first.next([city('Biel')]); expect(page.cityResults).toEqual([]);
    second.error(new Error('offline')); expect(page.searching).toBe(false); expect(page.searchError).toContain('fehlgeschlagen');
    service.searchCity.mockReturnValue(of([city('Thun')])); page.onSearchInput(); vi.advanceTimersByTime(300);
    expect(page.cityResults[0].name).toBe('Thun'); expect(page.searchError).toBe('');
  });
  it('cancels queued searches on close and destroy', () => {
    page.showSearch = true; page.citySearch = 'Biel'; page.onSearchInput(); page.toggleSearch();
    vi.advanceTimersByTime(300); expect(service.searchCity).not.toHaveBeenCalled();
    page.onSearchInput(); fixture.destroy(); vi.advanceTimersByTime(300); expect(service.searchCity).not.toHaveBeenCalled();
  });
  it('offers city search after denied geolocation and prevents duplicate requests', () => {
    const request = new Subject<{lat:number;lon:number}>(); service.getBrowserLocation.mockReturnValue(request);
    page.useGeolocation(); page.useGeolocation(); expect(service.getBrowserLocation).toHaveBeenCalledTimes(1);
    request.error(new Error('denied')); expect(page.showSearch).toBe(true); expect(page.locating).toBe(false);
  });
  it('loads one stable map only on request and updates its region and layer', () => {
    page.weather = data(); expect(page.mapUrl).toBeNull(); page.showMap(); const url = page.mapUrl;
    expect(page.mapUrl).toBe(url); page.changeMapLayer('wind'); expect(page.mapUrl).not.toBe(url);
    page.changeMapRegion('europe'); expect(String(page.mapUrl)).toContain('lat=52');
  });
});
