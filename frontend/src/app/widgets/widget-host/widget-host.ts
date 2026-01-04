import { AfterViewInit, Component, Input, OnInit, ViewChild, ViewContainerRef } from '@angular/core';
import { DashboardItem } from '../../dashboard/models/dashboard.models';
import { WIDGET_REGISTRY } from '../widgets.registry';

@Component({
  selector: 'widget-host',
  standalone: true,
  imports: [],
  templateUrl: './widget-host.html',
  styleUrl: './widget-host.css',
})
export class WidgetHost implements AfterViewInit {
  @Input() widget!: DashboardItem;
  @ViewChild('host', { read: ViewContainerRef })host!: ViewContainerRef;

  ngAfterViewInit() {
    const def = WIDGET_REGISTRY.find(
      w => w.type === this.widget.widget_type
    );

    if (!def) {
      return;
    }

    this.host.clear();
    this.host.createComponent(def.component);
  }
}
