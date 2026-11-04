import { DialogDirective } from '../../shared/directives/dialog.directive';
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { WidgetDefinition } from '../../widgets/widgets.registry';

@Component({
  selector: 'add-widget-popover',
  standalone: true,
  imports: [DialogDirective,  CommonModule ],
  templateUrl: './add-widget-popover.html',
  styleUrl: './add-widget-popover.css',
})
export class AddWidget {
  @Input() widgets: WidgetDefinition[] = [];
  @Input() arrowLeft = 0;

  @Output() select = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();

  onSelect(type: string) {
    this.select.emit(type);
  }

  closePopover() {
    this.close.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.closePopover(); }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // Close the popover when the click is outside its bounds.
    if (!target.closest('add-widget-popover') && !target.closest('.add-widget-fab')) {
      this.closePopover();
    }
  }
}
