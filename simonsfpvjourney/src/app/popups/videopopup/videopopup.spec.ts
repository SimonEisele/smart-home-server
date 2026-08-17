import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Videopopup } from './videopopup';

describe('Videopopup', () => {
  let component: Videopopup;
  let fixture: ComponentFixture<Videopopup>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Videopopup]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Videopopup);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
