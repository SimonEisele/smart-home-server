import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, OnInit, OnDestroy, ViewChild, AfterViewInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Picture } from '../../models/picture.model';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-picturemodal',
  standalone: true,
  imports: [ CommonModule, RouterModule, TranslateModule ],
  templateUrl: './picturemodal.html',
  styleUrl: './picturemodal.css',
})
export class Picturemodal implements OnInit, OnDestroy, AfterViewInit {
  @Input() picture!: Picture;
  @Input() canPrev = true;
  @Input() canNext = true;
  @Output() close = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @ViewChild('contentRoot') contentRoot?: ElementRef<HTMLDivElement>;

  onClose() {
    this.close.emit();
  }

  ngOnInit(): void {
    // Prevent background/body scroll while modal is open
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
  }

  ngOnDestroy(): void {
    // Restore scrolling
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }

  ngAfterViewInit(): void {
    // Focus modal content to capture keyboard input
    this.contentRoot?.nativeElement.focus();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close.emit();
    } else if (event.key === 'ArrowLeft') {
      if (this.canPrev) {
        event.preventDefault();
        event.stopPropagation();
        this.prev.emit();
      }
    } else if (event.key === 'ArrowRight') {
      if (this.canNext) {
        event.preventDefault();
        event.stopPropagation();
        this.next.emit();
      }
    }
  }

  private touchStartX = 0;
  private touchStartY = 0;

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    if (event.touches && event.touches.length > 0) {
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
    }
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent) {
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    // Prefer horizontal swipe; ignore mostly vertical gestures
    if (absDx > 40 && absDy < 80) {
      if (dx < 0 && this.canNext) {
        this.next.emit();
      } else if (dx > 0 && this.canPrev) {
        this.prev.emit();
      }
    }
  }
}
