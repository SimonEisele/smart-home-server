import { TestBed } from '@angular/core/testing';
import { Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { WeatherWidget } from './weather.widget';
import { WeatherService } from '../service/weather.service';

describe('Weather widget availability', () => {
  const service = { getWeather: vi.fn(), getSavedLocation: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({imports:[WeatherWidget],providers:[{provide:WeatherService,useValue:service}]});
  });
  it('asks for a location without calling the API or showing an error', () => {
    service.getSavedLocation.mockReturnValue(null);
    const fixture = TestBed.createComponent(WeatherWidget);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(fixture.componentInstance.noLocation).toBe(true);
    expect(service.getWeather).not.toHaveBeenCalled();
    expect(text).toContain('Wetterort wählen');
    expect(text).not.toContain('Lade Wetterdaten');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });
  it('shows a retry when the forecast fails', () => {
    service.getSavedLocation.mockReturnValue({ lat: 1, lon: 2, city: 'Biel', country: 'CH' });
    service.getWeather.mockReturnValue(throwError(()=>new Error('offline')));
    const fixture = TestBed.createComponent(WeatherWidget);
    fixture.detectChanges();
    expect(fixture.componentInstance.loading).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Erneut laden');
    expect(fixture.nativeElement.textContent).not.toContain('Lade Wetterdaten');
  });
  it('prevents duplicate retries while a forecast request is pending', () => {
    service.getWeather.mockReturnValue(new Subject());
    service.getSavedLocation.mockReturnValue({ lat: 1, lon: 2, city: 'Biel', country: 'CH' });
    const widget = TestBed.createComponent(WeatherWidget).componentInstance;
    widget.load(); widget.load(); expect(service.getWeather).toHaveBeenCalledTimes(1);
  });
  it('distinguishes unavailable data from zero', () => {
    const widget = TestBed.createComponent(WeatherWidget).componentInstance;
    expect(widget.value(NaN)).toBe('—'); expect(widget.value(0)).toBe('0');
  });
});
