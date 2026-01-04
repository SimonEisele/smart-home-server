import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WeatherPage } from './weather.page';

describe('WeatherPage', () => {
  let component: WeatherPage;
  let fixture: ComponentFixture<WeatherPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WeatherPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WeatherPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
