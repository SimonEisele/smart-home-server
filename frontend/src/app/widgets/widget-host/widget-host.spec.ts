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
    fixture.componentRef.setInput("widget", { widget_type: "datetime", config: {} });
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
