import { Component, EventEmitter, Input, Output } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'card',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './card.html',
  styleUrl: './card.css',
})
export class Card {
  @Input() title = '';
  @Input() editMode = false;
  /** Page the header links to outside edit mode. */
  @Input() route?: string;
  @Input() icon?: string;
  /** Size shown in edit mode, e.g. "4 × 8". */
  @Input() size = '';
  /** Shows the drag grip; the mobile list reorders with buttons instead. */
  @Input() draggable = true;
  @Output() remove = new EventEmitter<void>();
  @Output() rename = new EventEmitter<string>();

  commitTitle(input: HTMLInputElement): void {
    const value = input.value.trim();
    if (!value) {
      input.value = this.title;
      return;
    }
    if (value !== this.title) this.rename.emit(value);
  }

  cancelTitle(input: HTMLInputElement): void {
    input.value = this.title;
    input.blur();
  }
}
