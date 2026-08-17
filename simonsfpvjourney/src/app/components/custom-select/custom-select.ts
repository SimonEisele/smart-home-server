import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';

export interface CustomSelectOption<T = any> {
  value: T;
  label: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-custom-select',
  standalone: true,
  imports: [ CommonModule ],
  templateUrl: './custom-select.html',
  styleUrl: './custom-select.css',
})
export class CustomSelect<T = any> {
  @Input() options: CustomSelectOption<T>[] = [];
  @Input() value: T | null = null;
  @Input() placeholder = 'Select';
  @Output() valueChange = new EventEmitter<T | null>();

  open = false;

  constructor(private host: ElementRef<HTMLElement>) {}

  get selectedLabel(): string {
    const match = this.options.find(o => this.isEqual(o.value, this.value));
    return match?.label ?? '';
  }

  toggle(): void {
    this.open = !this.open;
  }

  select(option: CustomSelectOption<T>): void {
    if (option.disabled) return;
    this.valueChange.emit(option.value ?? null);
    this.open = false;
  }

  isSelected(option: CustomSelectOption<T>): boolean {
    return this.isEqual(option.value, this.value);
  }

  private isEqual(a: any, b: any): boolean {
    return a === b;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target) return;
    if (!this.host.nativeElement.contains(target)) {
      this.open = false;
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open) {
      event.preventDefault();
      this.open = false;
    }
  }
}
