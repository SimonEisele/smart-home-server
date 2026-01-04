import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WidgetHost } from './widget-host';

describe('WidgetHost', () => {
  let component: WidgetHost;
  let fixture: ComponentFixture<WidgetHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WidgetHost]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WidgetHost);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
