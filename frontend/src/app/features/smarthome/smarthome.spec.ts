import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Smarthome } from './smarthome';

describe('Smarthome', () => {
  let component: Smarthome;
  let fixture: ComponentFixture<Smarthome>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Smarthome]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Smarthome);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
