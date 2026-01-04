import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Shoppinglist } from './shoppinglist';

describe('Shoppinglist', () => {
  let component: Shoppinglist;
  let fixture: ComponentFixture<Shoppinglist>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Shoppinglist]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Shoppinglist);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
