import { AfterViewInit, Directive, ElementRef, Input, OnDestroy, inject } from '@angular/core';

/** Dashboard previews show complete entries; the full page remains available via the card header. */
@Directive({ selector: '[fitWidgetContent]', standalone: true })
export class FitWidgetContentDirective implements AfterViewInit, OnDestroy {
  @Input() fitWidgetContent = '';
  @Input() fitWidgetGroups = '';
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private resize?: ResizeObserver;
  private changes?: MutationObserver;
  private frame = 0;
  private hidden = new Map<HTMLElement, string>();

  ngAfterViewInit(): void {
    this.resize = new ResizeObserver(() => this.schedule());
    this.resize.observe(this.element.nativeElement);
    this.changes = new MutationObserver(() => this.schedule());
    this.changes.observe(this.element.nativeElement, { childList: true, subtree: true, characterData: true });
    this.schedule();
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.fit());
  }

  fit(): void {
    for (const [entry, display] of this.hidden) entry.style.display = display;
    this.hidden.clear();
    const root = this.element.nativeElement;
    if (!root.clientHeight || !this.fitWidgetContent) return;
    const box = root.getBoundingClientRect();
    const bottom = box.top + root.clientHeight - (parseFloat(getComputedStyle(root).paddingBottom) || 0);
    // Measure all entries before hiding any, so later entries do not jump into an earlier gap.
    const entries = Array.from(root.querySelectorAll<HTMLElement>(this.fitWidgetContent));
    const overflow = entries.filter(entry => {
      const rect = entry.getBoundingClientRect();
      return rect.height > 0 && (rect.bottom > bottom + .5 || rect.top < box.top - .5 || entry.scrollWidth > entry.clientWidth + 1 || Array.from(entry.querySelectorAll<HTMLElement>('*')).some(child => child.clientWidth > 0 && child.scrollWidth > child.clientWidth + 1));
    });
    for (const entry of overflow) this.hide(entry);
    if (this.fitWidgetGroups) {
      for (const group of root.querySelectorAll<HTMLElement>(this.fitWidgetGroups)) {
        const children = entries.filter(entry => group.contains(entry));
        if (children.length && children.every(entry => this.hidden.has(entry))) this.hide(group);
      }
    }
  }

  private hide(entry: HTMLElement): void {
    this.hidden.set(entry, entry.style.display);
    entry.style.display = 'none';
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
    this.resize?.disconnect();
    this.changes?.disconnect();
  }
}
