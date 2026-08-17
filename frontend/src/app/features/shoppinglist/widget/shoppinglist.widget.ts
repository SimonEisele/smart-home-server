import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
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
  items: ShoppingItem[] = [];
  newItemName = '';
  adding = false;

  constructor(private svc: ShoppinglistService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.svc.getItems().subscribe(items => {
      this.items = items.sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        return (a.category ?? '').localeCompare(b.category ?? '');
      });
      this.cdr.detectChanges();
    });
  }

  get unchecked(): ShoppingItem[] { return this.items.filter(i => !i.checked); }
  get checked(): ShoppingItem[]   { return this.items.filter(i => i.checked); }

  toggle(item: ShoppingItem): void {
    const newVal = !item.checked;
    this.items = this.items.map(i => i.id === item.id ? { ...i, checked: newVal } : i);
    this.cdr.detectChanges();
    this.svc.updateItem(item.id, { checked: newVal }).subscribe({
      error: () => {
        this.items = this.items.map(i => i.id === item.id ? { ...i, checked: !newVal } : i);
        this.cdr.detectChanges();
      }
    });
  }

  addItem(): void {
    const name = this.newItemName.trim();
    if (!name) return;
    this.adding = true;
    this.svc.createItem({ name }).subscribe(item => {
      this.items = [item, ...this.items];
      this.newItemName = '';
      this.adding = false;
      this.cdr.detectChanges();
    });
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') this.addItem();
  }

  quantityLabel(item: ShoppingItem): string {
    if (!item.quantity) return '';
    return item.unit ? `${item.quantity} ${item.unit}` : `${item.quantity}`;
  }
}
