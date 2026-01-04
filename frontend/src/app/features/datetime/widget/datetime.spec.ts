import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Datetime } from './datetime';

describe('Datetime', () => {
  let component: Datetime;
  let fixture: ComponentFixture<Datetime>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Datetime]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Datetime);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
