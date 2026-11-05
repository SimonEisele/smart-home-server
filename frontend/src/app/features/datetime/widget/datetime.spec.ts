import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DateTimeWidget } from './datetime';

describe('DateTimeWidget', () => {
  let component: DateTimeWidget;
  let fixture: ComponentFixture<DateTimeWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DateTimeWidget]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DateTimeWidget);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('DateTimeWidget calendar helpers', () => {
  it('computes the ISO week and day of year', () => {
    const widget = TestBed.createComponent(DateTimeWidget).componentInstance;
    widget.now = new Date(2026, 0, 1, 12, 0);
    expect(widget.weekNumber).toBe(1);
    expect(widget.dayOfYear).toBe(1);
    expect(widget.dayProgress).toBe(50);
    widget.now = new Date(2026, 11, 31, 6, 0);
    expect(widget.weekNumber).toBe(53);
    expect(widget.dayOfYear).toBe(365);
  });
});
