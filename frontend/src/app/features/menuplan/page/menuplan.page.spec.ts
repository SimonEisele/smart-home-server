import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MenuplanPage } from './menuplan.page';

describe('MenuplanPage', () => {
  let component: MenuplanPage;
  let fixture: ComponentFixture<MenuplanPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuplanPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MenuplanPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
