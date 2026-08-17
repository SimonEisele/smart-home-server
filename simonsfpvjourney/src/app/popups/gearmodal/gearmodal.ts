import { CommonModule } from '@angular/common';
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Drone } from '../../models/video.model';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-gearmodal',
  standalone: true,
  imports: [ CommonModule, TranslateModule ],
  templateUrl: './gearmodal.html',
  styleUrl: './gearmodal.css',
})
export class Gearmodal implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @Input() drone!: Drone;
  @Input() canPrev = false;
  @Input() canNext = false;
  @Output() closed = new EventEmitter<void>();
  @Output() prev = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @ViewChild('contentRoot') contentRoot?: ElementRef<HTMLDivElement>;
  @ViewChild('infoPane') infoPane?: ElementRef<HTMLDivElement>;
  private touchStartX = 0;
  private touchStartY = 0;
  private imageTouchStartX = 0;
  private imageTouchStartY = 0;
  currentImage = '';
  previousImage = '';
  imageUrls: string[] = [];
  private slideTimer?: number;
  animateImage = false;
  private autoAdvanceEnabled = true;
  slideDirection: 'next' | 'prev' = 'next';
  entering = false;

  constructor(private cdr: ChangeDetectorRef) {}

  close() {
    this.closed.emit();
  }

  ngOnInit(): void {
    document.body.style.overflow = 'hidden';
    this.autoAdvanceEnabled = true;
    this.triggerEnterAnimation();
    this.updateImages();
    this.startSlideshow();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['drone']) {
      this.autoAdvanceEnabled = true;
      this.updateImages();
      this.startSlideshow();
    }
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
    this.stopSlideshow();
  }

  ngAfterViewInit(): void {
    this.contentRoot?.nativeElement.focus();
  }

  private updateImages(): void {
    const extras = (this.drone?.images ?? []).map(img => img.image).filter(Boolean);
    this.imageUrls = [this.drone?.image, ...extras].filter(Boolean) as string[];
    this.currentImage = this.imageUrls[0] ?? '';
    this.previousImage = this.currentImage;
  }

  private startSlideshow(): void {
    this.stopSlideshow();
    if (this.imageUrls.length <= 1) return;
    if (typeof window === 'undefined') return;
    if (!this.autoAdvanceEnabled) return;
    this.scheduleNextSlide();
  }

  private stopSlideshow(): void {
    if (this.slideTimer) {
      window.clearTimeout(this.slideTimer);
      this.slideTimer = undefined;
    }
  }

  private scheduleNextSlide(): void {
    this.slideTimer = window.setTimeout(() => {
      this.advanceSlide();
      this.scheduleNextSlide();
    }, 7000);
  }

  private advanceSlide(): void {
    if (this.imageUrls.length <= 1) return;
    const currentIndex = this.imageUrls.indexOf(this.currentImage);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % this.imageUrls.length : 0;
    this.slideDirection = 'next';
    this.previousImage = this.currentImage;
    this.currentImage = this.imageUrls[nextIndex];
    this.triggerImageAnimation();
    this.cdr.detectChanges();
  }

  setImage(index: number): void {
    if (index < 0 || index >= this.imageUrls.length) return;
    const currentIndex = this.imageUrls.indexOf(this.currentImage);
    if (currentIndex >= 0) {
      const forward = (currentIndex + 1) % this.imageUrls.length;
      this.slideDirection = index === forward ? 'next' : 'prev';
    }
    this.previousImage = this.currentImage;
    this.currentImage = this.imageUrls[index];
    this.triggerImageAnimation();
    this.cdr.detectChanges();
    this.autoAdvanceEnabled = false;
    this.stopSlideshow();
  }

  private triggerImageAnimation(): void {
    this.animateImage = false;
    this.cdr.detectChanges();
    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
      this.animateImage = true;
      this.cdr.detectChanges();
      window.setTimeout(() => {
        this.animateImage = false;
        this.cdr.detectChanges();
      }, 1700);
    }, 0);
  }

  private triggerEnterAnimation(): void {
    this.entering = false;
    this.cdr.detectChanges();
    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
      this.entering = true;
      this.cdr.detectChanges();
      window.setTimeout(() => {
        this.entering = false;
        this.cdr.detectChanges();
      }, 220);
    }, 0);
  }

  onImageTouchStart(event: TouchEvent): void {
    if (!event.touches || event.touches.length === 0) return;
    this.imageTouchStartX = event.touches[0].clientX;
    this.imageTouchStartY = event.touches[0].clientY;
  }

  onImageTouchEnd(event: TouchEvent): void {
    if (this.imageUrls.length <= 1) return;
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - this.imageTouchStartX;
    const dy = touch.clientY - this.imageTouchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > 30 && absDx > absDy * 1.2) {
      this.autoAdvanceEnabled = false;
      this.stopSlideshow();
      if (dx < 0) {
        this.slideDirection = 'next';
        this.setImage((this.imageIndex + 1) % this.imageUrls.length);
      }
      if (dx > 0) {
        this.slideDirection = 'prev';
        this.setImage((this.imageIndex - 1 + this.imageUrls.length) % this.imageUrls.length);
      }
    }
  }

  get imageIndex(): number {
    const i = this.imageUrls.indexOf(this.currentImage);
    return i >= 0 ? i : 0;
  }

  onTouchStart(event: TouchEvent): void {
    if (!event.touches || event.touches.length === 0) return;
    this.touchStartX = event.touches[0].clientX;
    this.touchStartY = event.touches[0].clientY;
  }

  onTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx > 40 && absDx > absDy * 1.2) {
      if (dx < 0 && this.canNext) this.onNext();
      if (dx > 0 && this.canPrev) this.onPrev();
    }
  }

  onPrev(): void {
    this.prev.emit();
  }

  onNext(): void {
    this.next.emit();
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
        this.onPrev();
      }
    } else if (event.key === 'ArrowRight') {
      if (this.canNext) {
        event.preventDefault();
        event.stopPropagation();
        this.onNext();
      }
    }
  }
}
