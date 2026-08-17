import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'card',
  standalone: true,
  imports: [ CommonModule ],
  templateUrl: './card.html',
  styleUrl: './card.css',
})
export class Card {
  @Input() title = '';
  @Input() editMode: boolean = false;
  @Input() link?: string;
  @Input() icon?: string;
  @Output() remove = new EventEmitter<void>();

  constructor(private router: Router) {}

  navigate() {
    if (!this.editMode && this.link) {
      this.router.navigate([this.link]);
    }
  }

  onCardClick(event: MouseEvent): void {
    if (this.editMode || !this.link) return;
    const target = event.target as HTMLElement;
    // Don't navigate when clicking interactive elements inside the widget
    if (target.closest('button, input, select, textarea, a, [role="button"], label')) return;
    this.router.navigate([this.link]);
  }
}
