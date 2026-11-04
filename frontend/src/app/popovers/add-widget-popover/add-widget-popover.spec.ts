import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddWidget } from './add-widget-popover';

describe('AddWidget', () => {
  let component: AddWidget;
  let fixture: ComponentFixture<AddWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddWidget]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddWidget);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
