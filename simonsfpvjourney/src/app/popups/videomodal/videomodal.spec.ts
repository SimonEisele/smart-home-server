import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Videomodal } from './videomodal';

describe('Videomodal', () => {
  let component: Videomodal;
  let fixture: ComponentFixture<Videomodal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Videomodal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Videomodal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
