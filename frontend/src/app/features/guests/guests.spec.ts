import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Guests } from './guests';

describe('Guests', () => {
  let component: Guests;
  let fixture: ComponentFixture<Guests>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Guests]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Guests);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
