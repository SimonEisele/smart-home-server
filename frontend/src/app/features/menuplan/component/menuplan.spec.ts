import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Menuplan } from './menuplan';

describe('Menuplan', () => {
  let component: Menuplan;
  let fixture: ComponentFixture<Menuplan>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Menuplan]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Menuplan);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
