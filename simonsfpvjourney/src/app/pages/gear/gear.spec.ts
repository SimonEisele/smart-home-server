import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Gear } from './gear';

describe('Gear', () => {
  let component: Gear;
  let fixture: ComponentFixture<Gear>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Gear]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Gear);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
