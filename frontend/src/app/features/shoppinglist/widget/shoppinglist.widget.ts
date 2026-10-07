import { ChangeDetectorRef, Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShoppingItem } from '../model/shoppinglist.model';
import { ShoppinglistService } from '../service/shoppinglist.service';

@Component({
  selector: 'shoppinglist-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shoppinglist.widget.html',
  styleUrl: './shoppinglist.widget.css',
})
export class ShoppinglistWidget implements OnInit {
  private destroyRef = inject(DestroyRef);
  pending = new Set<string>();
  error = '';
  items: ShoppingItem[] = [];
  newItemName = '';
  adding = false;

  constructor(
    private svc: ShoppinglistService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.error = '';
    this.svc
      .getItems()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items = items.sort((a, b) => {
            if (a.checked !== b.checked) return a.checked ? 1 : -1;
            return (a.category ?? '').localeCompare(b.category ?? '');
          });
          this.cdr.detectChanges();
        },
        error: () => {
          this.error = 'Einkaufsliste konnte nicht geladen werden.';
          this.cdr.markForCheck();
        },
      });
  }

  get unchecked(): ShoppingItem[] {
    return this.items.filter((i) => !i.checked);
  }
  get checked(): ShoppingItem[] {
    return this.items.filter((i) => i.checked);
  }

  toggle(item: ShoppingItem): void {
    if (this.pending.has(item.id)) return;
    this.pending.add(item.id);
    this.error = '';
    this.svc
      .updateItem(item.id, { checked: !item.checked })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.items = this.items.map((i) => (i.id === updated.id ? updated : i));
          this.pending.delete(item.id);
          this.cdr.markForCheck();
        },
        error: () => {
          this.pending.delete(item.id);
          this.error = 'Abhaken fehlgeschlagen. Bitte erneut versuchen.';
          this.cdr.markForCheck();
        },
      });
  }

  addItem(): void {
    const name = this.newItemName.trim();
    if (!name || this.adding) return;
    this.adding = true;
    this.error = '';
    this.svc
      .createItem({ name })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (item) => {
          this.items = [item, ...this.items];
          this.newItemName = '';
          this.adding = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.adding = false;
          this.error = 'Hinzufügen fehlgeschlagen. Bitte erneut versuchen.';
          this.cdr.markForCheck();
        },
      });
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') this.addItem();
  }

  quantityLabel(item: ShoppingItem): string {
    if (item.quantity == null) return 'Nach Bedarf';
    return `${new Intl.NumberFormat('de-CH', { maximumFractionDigits: 3 }).format(item.quantity)} ${item.unit || ''}${item.quantityIncomplete ? ' + nach Bedarf' : ''}`.trim();
  }
}
