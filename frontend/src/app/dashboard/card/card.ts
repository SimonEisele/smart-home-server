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
}
