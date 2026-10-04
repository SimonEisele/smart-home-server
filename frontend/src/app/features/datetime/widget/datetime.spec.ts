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
