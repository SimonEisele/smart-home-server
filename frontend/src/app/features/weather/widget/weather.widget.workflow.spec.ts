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
  it('offers location selection instead of leaving an indefinite loading state', () => {
    service.getWeather.mockReturnValue(throwError(()=>new Error('no location')));
    service.getSavedLocation.mockReturnValue(null);
    const widget = TestBed.createComponent(WeatherWidget).componentInstance;
    widget.load(); expect(widget.loading).toBe(false); expect(widget.error).toContain('Wetterort');
  });
  it('prevents duplicate retries while a forecast request is pending', () => {
    service.getWeather.mockReturnValue(new Subject());
    const widget = TestBed.createComponent(WeatherWidget).componentInstance;
    widget.load(); widget.load(); expect(service.getWeather).toHaveBeenCalledTimes(1);
  });
  it('distinguishes unavailable data from zero', () => {
    const widget = TestBed.createComponent(WeatherWidget).componentInstance;
    expect(widget.value(NaN)).toBe('—'); expect(widget.value(0)).toBe('0');
  });
});
