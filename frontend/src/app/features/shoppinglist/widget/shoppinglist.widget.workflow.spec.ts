import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ShoppinglistWidget } from './shoppinglist.widget';
import { ShoppinglistService } from '../service/shoppinglist.service';
import { ShoppingItem } from '../model/shoppinglist.model';

describe('Shopping dashboard actions', () => {
  const service = { createItem: vi.fn(), updateItem: vi.fn(), getItems: vi.fn() };
  let widget: ShoppinglistWidget;
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [ShoppinglistWidget],
      providers: [{ provide: ShoppinglistService, useValue: service }],
    });
    widget = TestBed.createComponent(ShoppinglistWidget).componentInstance;
    widget.items = [{ id: 'one', name: 'Milk', checked: false }];
  });
  it('keeps failed additions editable and releases the add lock', () => {
    widget.newItemName = 'Bread';
    service.createItem.mockReturnValue(throwError(() => new Error('offline')));
    widget.addItem();
    expect(widget.adding).toBe(false);
    expect(widget.newItemName).toBe('Bread');
    expect(widget.items.length).toBe(1);
    expect(widget.error).toContain('fehlgeschlagen');
  });
  it('sends only one add request while pending', () => {
    const request = new Subject<ShoppingItem>();
    service.createItem.mockReturnValue(request);
    widget.newItemName = 'Bread';
    widget.addItem();
    widget.addItem();
    expect(service.createItem).toHaveBeenCalledTimes(1);
    request.next({ id: 'two', name: 'Bread', checked: false });
    expect(widget.items.length).toBe(2);
    expect(widget.newItemName).toBe('');
  });
  it('never loses current state on a failed or double toggle', () => {
    const request = new Subject<ShoppingItem>();
    service.updateItem.mockReturnValue(request);
    widget.toggle(widget.items[0]);
    widget.toggle(widget.items[0]);
    expect(service.updateItem).toHaveBeenCalledTimes(1);
    expect(widget.items[0].checked).toBe(false);
    request.error(new Error('offline'));
    expect(widget.pending.size).toBe(0);
    expect(widget.items[0].checked).toBe(false);
  });
  it('distinguishes zero, unknown and partial quantities', () => {
    expect(
      widget.quantityLabel({ id: 'one', name: 'Salt', checked: false, quantity: 0, unit: 'g' }),
    ).toBe('0 g');
    expect(widget.quantityLabel(widget.items[0])).toBe('Nach Bedarf');
    expect(
      widget.quantityLabel({
        id: 'one',
        name: 'Salt',
        checked: false,
        quantity: 2,
        unit: 'g',
        quantityIncomplete: true,
      }),
    ).toBe('2 g + nach Bedarf');
  });
});
