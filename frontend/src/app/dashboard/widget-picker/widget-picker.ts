import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DialogDirective } from '../../shared/directives/dialog.directive';
import { WIDGET_REGISTRY, WidgetDefinition } from '../../widgets/widgets.registry';

/** Dialog listing every widget type; a type may be added more than once. */
@Component({
  selector: 'widget-picker',
  standalone: true,
  imports: [DialogDirective],
  templateUrl: './widget-picker.html',
  styleUrl: './widget-picker.css',
})
export class WidgetPicker {
  @Input() widgets: WidgetDefinition[] = WIDGET_REGISTRY;
  /** Widget types already on the dashboard, with how often they appear. */
  @Input() inUse: Record<string, number> = {};
  @Output() select = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();
}
