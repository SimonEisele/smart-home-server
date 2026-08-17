import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Impressum } from './impressum';

describe('Impressum', () => {
  let component: Impressum;
  let fixture: ComponentFixture<Impressum>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Impressum]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Impressum);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
