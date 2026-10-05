import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Shoppinglist } from './shoppinglist';
import { ShoppinglistService } from './service/shoppinglist.service';

describe('Shopping entries reflect their actual records', () => {
  let page: Shoppinglist;
  const service = { deleteItem:vi.fn() };
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({ imports:[Shoppinglist], providers:[{ provide:ShoppinglistService, useValue:service }] }).compileComponents();
    page = TestBed.createComponent(Shoppinglist).componentInstance;
    page.items = [{ id:'one', name:'Pasta', quantity:200, unit:'g', checked:false, listType:'manual' },{ id:'two', name:'Pasta', quantity:300, unit:'g', checked:false, listType:'menuplan' }];
  });
  it('keeps duplicate sources separately editable and checkable', () => {
    expect(page.allGroups[0].items.map(item => item.id)).toEqual(['one','two']);
    expect(page.manualGroups[0].items.length).toBe(1);
  });
  it('keeps entries visible if clearing completed entries fails', () => {
    page.items = page.items.map(item => ({ ...item, checked:true }));
    service.deleteItem.mockImplementation((id:string) => id==='one' ? of(undefined) : throwError(() => new Error('offline')));
    // The global interceptor reports HTTP errors; this unit test isolates the list update.
    page.clearChecked();
    expect(page.items.map(item => item.id)).toEqual(['two']);
  });
});
