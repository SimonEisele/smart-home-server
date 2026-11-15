import { AfterViewInit, Directive, ElementRef, EventEmitter, HostListener, OnDestroy, Output, inject } from '@angular/core';
import { FocusTrap, FocusTrapFactory } from '@angular/cdk/a11y';

/** One keyboard and focus contract for every dialog, including popovers. */
@Directive({ selector: '[appDialog]', standalone: true, host: { role: 'dialog', 'aria-modal': 'true', tabindex: '-1' } })
export class DialogDirective implements AfterViewInit, OnDestroy {
  @Output() dialogDismiss = new EventEmitter<void>();
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly factory = inject(FocusTrapFactory);
  private trap?: FocusTrap;
  private previousFocus = document.activeElement as HTMLElement | null;
  private counted = false;
  private static count = 0;
  private static nextId = 0;
  private static previousOverflow = '';

  ngAfterViewInit(): void {
    this.counted = true;
    if (DialogDirective.count++ === 0) {
      DialogDirective.previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    for (const label of this.element.nativeElement.querySelectorAll('label:not([for])')) {
      if (label.querySelector('input,select,textarea')) continue;
      const sibling = label.nextElementSibling;
      const control = sibling?.matches('input,select,textarea') ? sibling : sibling?.querySelector('input,select,textarea');
      if (control) {
        if (!control.id) control.id = `dialog-field-${++DialogDirective.nextId}`;
        label.setAttribute('for', control.id);
      }
    }
    this.trap = this.factory.create(this.element.nativeElement);
    // Prefer the editable field to avoid putting initial focus on a destructive action.
    // Fields marked data-no-autofocus are skipped (e.g. optional ones that would pop up the phone keyboard).
    const skip = ':not([disabled]):not([data-no-autofocus])';
    const field = this.element.nativeElement.querySelector<HTMLElement>(
      `input:not([type=checkbox]):not([type=radio])${skip},textarea${skip},select${skip}`);
    (field ?? this.element.nativeElement).focus();
  }

  @HostListener('keydown.escape', ['$event'])
  dismiss(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.dialogDismiss.emit();
  }

  ngOnDestroy(): void {
    this.trap?.destroy();
    // A dialog removed before it was ever shown never locked the page.
    if (this.counted && --DialogDirective.count === 0) document.body.style.overflow = DialogDirective.previousOverflow;
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
  }
}
