import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ShoppinglistPage } from './shoppinglist.page';

describe('ShoppinglistPage', () => {
  let component: ShoppinglistPage;
  let fixture: ComponentFixture<ShoppinglistPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppinglistPage]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ShoppinglistPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
