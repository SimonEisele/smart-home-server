import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, OnInit, OnDestroy, ViewChild, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { SafePipe } from '../../pipes/safe.pipe';
import { CapitalizePipe } from '../../pipes/capitalize.pipe';
import { Video } from '../../models/video.model';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-videomodal',
  standalone: true,
  imports: [ CommonModule, SafePipe, CapitalizePipe, TranslateModule],
  templateUrl: './videomodal.html',
  styleUrl: './videomodal.css',
})
export class Videomodal implements OnInit, OnDestroy, AfterViewInit, OnChanges {
  @Input() video!: Video;
  @Input() canPrev = true;
  @Input() canNext = true;
  @Output() closed = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @ViewChild('contentRoot') contentRoot?: ElementRef<HTMLDivElement>;
  @ViewChild('infoPane') infoPane?: ElementRef<HTMLDivElement>;
  @ViewChild('bodyRef') bodyRef?: ElementRef<HTMLDivElement>;
  private readonly embedOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  get youtubeUrl() {
        if (!this.video) return '';
        const params = new URLSearchParams({
          rel: '0',
          modestbranding: '1',
          playsinline: '1',
          fs: '1',
          vq: 'hd1080',
        });

        if (this.embedOrigin) {
          params.set('origin', this.embedOrigin);
        }

        return `https://www.youtube-nocookie.com/embed/${this.video.youtube_id}?${params.toString()}`;
  }

  get tagList(): string {
    return this.video?.tags?.map(t => t.name).join(', ') || '';
  }

  close() {
    this.closed.emit();
  }

  ngOnInit(): void {
    // Prevent background/body scroll while modal is open
          document.body.style.overflow = 'hidden';
      }

  ngOnDestroy(): void {
    // Restore scrolling
          document.body.style.overflow = '';
      }

  ngAfterViewInit(): void {
    // Focus modal content to capture keyboard input
    this.contentRoot?.nativeElement.focus();
    this.queueScrollReset();
      }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['video'] && !changes['video'].firstChange) {
      // When switching to a new video, reset scroll positions to top
      this.queueScrollReset();
          }
  }

  private scrollResetPending = false;
  private queueScrollReset() {
    this.scrollResetPending = true;
    // Use rAF to wait for DOM/layout update, then reset
    setTimeout(() => {
      requestAnimationFrame(() => {
        if (!this.scrollResetPending) return;
        this.scrollResetPending = false;
        try {
          const infoEl = this.infoPane && this.infoPane.nativeElement;
          if (infoEl) {
            infoEl.scrollTop = 0;
            // Fallback for browsers that prefer scrollTo API
            if (infoEl.scrollTop !== 0 && infoEl.scrollTo) {
              infoEl.scrollTo({ top: 0, behavior: 'auto' });
            }
          }
        } catch {}
        try {
          const bodyEl = this.bodyRef && this.bodyRef.nativeElement;
          if (bodyEl) {
            bodyEl.scrollTop = 0;
            if (bodyEl.scrollTop !== 0 && bodyEl.scrollTo) {
              bodyEl.scrollTo({ top: 0, behavior: 'auto' });
            }
          }
        } catch {}
      });
    }, 0);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit();
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
    if (absDx > 40 && absDy < 80) {
      if (dx < 0 && this.canNext) {
        this.next.emit();
      } else if (dx > 0 && this.canPrev) {
        this.prev.emit();
      }
    }
  }
}
