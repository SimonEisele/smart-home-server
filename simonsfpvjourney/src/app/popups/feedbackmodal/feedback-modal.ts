import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, HostListener, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { FeedbackService, FeedbackPayload } from '../../services/feedback.service';
import { CustomSelect, CustomSelectOption } from '../../components/custom-select/custom-select';
import { PLATFORM_ID, Inject } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-feedback-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, CustomSelect, TranslateModule],
  templateUrl: './feedback-modal.html',
  styleUrl: './feedback-modal.css',
})
export class FeedbackModal implements OnChanges, AfterViewInit {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('contentRoot') contentRoot?: ElementRef<HTMLDivElement>;

  message = '';
  name = '';
  contact = '';
  category = '';
  categoryOptions: CustomSelectOption<string>[] = [];
  submitting = false;
  success = false;
  errorKey = '';
  messageErrorKey = '';

  private wasOpen = false;
  constructor(
    private feedback: FeedbackService,
    private translate: TranslateService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.buildCategoryOptions();
    this.translate.onLangChange.subscribe(() => {
      this.buildCategoryOptions();
    });
  }

  onClose() {
    this.closed.emit();
    this.reset();
    if (isPlatformBrowser(this.platformId)) {
      document.body.style.overflow = '';
    }
  }

  reset() {
    this.message = '';
    this.name = '';
    this.contact = '';
    this.category = '';
    this.submitting = false;
    this.success = false;
    this.errorKey = '';
    this.messageErrorKey = '';
  }

  canSubmit(): boolean {
    return !!this.message.trim() && !this.submitting;
  }

  submit() {
    if (!this.message.trim()) {
      this.messageErrorKey = 'feedback.errorRequired';
      return;
    }
    this.submitting = true;
    const payload: FeedbackPayload = {
      message: this.message.trim(),
      category: this.category || undefined,
      name: this.name || undefined,
      contact: this.contact || undefined,
      page_url: typeof window !== 'undefined' ? window.location.href : undefined,
    };
    this.feedback.submit(payload).subscribe({
      next: () => {
        this.submitting = false;
        // Close modal on success and reset form
        this.onClose();
      },
      error: (e: unknown) => {
        this.errorKey = 'feedback.errorSubmit';
        this.submitting = false;
      },
    });
  }

  onInputMessage() {
    if (this.messageErrorKey && this.message.trim()) {
      this.messageErrorKey = '';
    }
  }

  private buildCategoryOptions(): void {
    this.categoryOptions = [
      { value: '', label: this.translate.instant('feedback.categorySelect') },
      { value: 'bug', label: this.translate.instant('feedback.categoryBug') },
      { value: 'idea', label: this.translate.instant('feedback.categoryIdea') },
      { value: 'improvement', label: this.translate.instant('feedback.categoryImprovement') },
      { value: 'other', label: this.translate.instant('feedback.categoryOther') },
    ];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      const isBrowser = isPlatformBrowser(this.platformId);
      const prev = changes['open'].previousValue as boolean | undefined;
      if (this.open) {
        if (isBrowser) {
          document.body.style.overflow = 'hidden';
        }
        setTimeout(() => this.contentRoot?.nativeElement.focus(), 0);
        this.wasOpen = true;
      } else if (prev) {
        if (isBrowser) {
          document.body.style.overflow = '';
        }
        this.wasOpen = false;
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.open) {
      this.contentRoot?.nativeElement.focus();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.onClose();
    }
  }
}
