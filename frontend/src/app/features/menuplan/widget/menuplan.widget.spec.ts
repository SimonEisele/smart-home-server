import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MenuplanWidget } from './menuplan.widget';

describe('MenuplanWidget', () => {
  let component: MenuplanWidget;
  let fixture: ComponentFixture<MenuplanWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuplanWidget]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MenuplanWidget);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
