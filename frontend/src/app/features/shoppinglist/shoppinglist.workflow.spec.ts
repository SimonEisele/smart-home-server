import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Shoppinglist } from './shoppinglist';
import { ShoppinglistService } from './service/shoppinglist.service';
import { RecipesService } from '../recipes/service/recipes.service';
import { ShoppingItem } from './model/shoppinglist.model';

describe('Shopping workflow', () => {
  let page: Shoppinglist;
  const service = {
    deleteItem: vi.fn(),
    clearChecked: vi.fn(),
    updateItem: vi.fn(),
    createItem: vi.fn(),
    getItems: vi.fn(),
    getSuggestions: vi.fn(),
    addRecipe: vi.fn(),
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [Shoppinglist],
      providers: [
        { provide: ShoppinglistService, useValue: service },
        {
          provide: RecipesService,
          useValue: { getIngredients: () => of([]), getRecipes: () => of([]) },
        },
      ],
    }).compileComponents();
    page = TestBed.createComponent(Shoppinglist).componentInstance;
    page.items = [
      { id: 'one', name: 'Pasta', quantity: 200, unit: 'g', checked: false, listType: 'manual' },
      {
        id: 'two',
        name: 'Pasta',
        quantity: 300,
        unit: 'g',
        checked: false,
        listType: 'menuplan',
        weekTag: '2026-W41',
        suggestion: 'Lasagne',
      },
    ];
  });
  it('keeps sources separate but shows combined purchase quantities', () => {
    expect(page.allGroups[0].items.map((i) => i.id)).toEqual(['one', 'two']);
    expect(page.purchaseSummary).toEqual([
      { name: 'Pasta', unit: 'g', quantity: 500, incomplete: false, count: 2 },
    ]);
    expect(page.manualGroups[0].items.length).toBe(1);
  });
  it('never mixes units, retains zero and marks partially unknown sums', () => {
    page.items.push(
      { id: 'three', name: ' PASTA ', unit: 'g', checked: false },
      { id: 'four', name: 'Pasta', quantity: 1, unit: 'kg', checked: false },
      { id: 'five', name: 'Salt', quantity: 0, checked: false },
    );
    expect(page.purchaseSummary.find((i) => i.unit === 'g')).toMatchObject({
      quantity: 500,
      incomplete: true,
      count: 3,
    });
    expect(page.purchaseSummary.find((i) => i.unit === 'kg')?.quantity).toBe(1);
    expect(page.quantityLabel(0, 'g')).toBe('0 g');
    expect(page.quantityLabel(null)).toBe('Nach Bedarf');
  });
  it('filters completed items and weeks consistently, without duplicating completed menu entries', () => {
    page.items[1].checked = true;
    page.activeTab = 'menuplan';
    expect(page.menuplanGroups).toEqual([]);
    expect(page.checkedItems.map((i) => i.id)).toEqual(['two']);
    page.activeTab = 'manual';
    expect(page.checkedItems).toEqual([]);
    page.activeTab = 'all';
    page.search = 'Lasagne';
    expect(page.checkedItems.length).toBe(1);
    expect(page.uncheckedCount).toBe(0);
    page.search = '';
    page.weekFilter = '2026-W41';
    expect(page.checkedItems.length).toBe(1);
    expect(page.uncheckedCount).toBe(0);
  });
  it('clears only currently visible completed items returned by the server', () => {
    page.items = page.items.map((i) => ({ ...i, checked: true }));
    page.activeTab = 'manual';
    service.clearChecked.mockReturnValue(of(['one']));
    page.clearChecked();
    expect(service.clearChecked).toHaveBeenCalledWith(['one']);
    expect(page.items.map((i) => i.id)).toEqual(['two']);
  });
  it('keeps all items if bulk clearing fails', () => {
    page.items = page.items.map((i) => ({ ...i, checked: true }));
    service.clearChecked.mockReturnValue(throwError(() => new Error('offline')));
    page.clearChecked();
    expect(page.items.length).toBe(2);
    expect(page.busy).toBe(false);
    expect(page.error).toContain('nicht gelöscht');
  });
  it('locks repeated toggles and retains state on failure', () => {
    const request = new Subject<ShoppingItem>();
    service.updateItem.mockReturnValue(request);
    page.toggleChecked(page.items[0]);
    page.toggleChecked(page.items[0]);
    expect(service.updateItem).toHaveBeenCalledTimes(1);
    expect(page.items[0].checked).toBe(false);
    request.error(new Error('offline'));
    expect(page.pending.size).toBe(0);
    expect(page.items[0].checked).toBe(false);
  });
  it('edits name and category and sends null to clear a quantity', () => {
    page.startEdit(page.items[0]);
    page.addName = 'Nudeln';
    page.addCategory = 'Getreide & Backwaren';
    page.addQty = null;
    service.updateItem.mockReturnValue(of({ ...page.items[0], name: 'Nudeln', quantity: null }));
    page.saveAdd();
    expect(service.updateItem).toHaveBeenCalledWith(
      'one',
      expect.objectContaining({
        name: 'Nudeln',
        category: 'Getreide & Backwaren',
        quantity: null,
        quantityIncomplete: true,
      }),
    );
    expect(page.items[0].quantity).toBeNull();
  });
  it('keeps input on failed add and rejects invalid quantities', () => {
    page.openAdd();
    page.addName = 'Milk';
    page.addQty = 2;
    service.createItem.mockReturnValue(throwError(() => new Error('offline')));
    page.saveAdd();
    expect(page.showAddForm).toBe(true);
    expect(page.addName).toBe('Milk');
    expect(page.busy).toBe(false);
    page.addQty = -1;
    page.saveAdd();
    expect(service.createItem).toHaveBeenCalledTimes(1);
  });
  it('locks add requests and prevents dismissing unsaved pending input', () => {
    const request = new Subject<ShoppingItem>();
    service.createItem.mockReturnValue(request);
    page.openAdd();
    page.addName = 'Milk';
    page.saveAdd();
    page.saveAdd();
    page.cancelAdd();
    expect(page.showAddForm).toBe(true);
    expect(service.createItem).toHaveBeenCalledTimes(1);
    request.next({ id: 'new', name: 'Milk', checked: false });
    expect(page.showAddForm).toBe(false);
  });
  it('scales piece recipes by desired total with a matching preview', () => {
    page.selectRecipe({
      id: 'recipe',
      name: 'Muffins',
      baseServings: 12,
      unitsPerPerson: 2,
      servingType: 'Stücke',
      ingredients: [
        { name: 'Flour', quantityPerPerson: 240, unit: 'g' },
        { name: 'Salt', quantityPerPerson: 0 },
      ],
      steps: [],
    });
    page.pickerServings = 6;
    expect(page.pickerPreview[0].quantity).toBe(120);
    expect(page.pickerPreview[1].quantity).toBe(0);
    service.addRecipe.mockReturnValue(of(2));
    service.getItems.mockReturnValue(of(page.items));
    page.addRecipeToList();
    expect(service.addRecipe).toHaveBeenCalledWith('recipe', 1, 6);
  });
  it('ignores old suggestions and responses after closing the editor', () => {
    const first = new Subject<Array<Partial<ShoppingItem>>>(),
      second = new Subject<Array<Partial<ShoppingItem>>>();
    service.getSuggestions.mockReturnValueOnce(first).mockReturnValueOnce(second);
    page.openAdd();
    page.addName = 'Pa';
    page.onAddNameInput();
    page.addName = 'Mi';
    page.onAddNameInput();
    first.next([{ name: 'Pasta' }]);
    expect(page.addSuggestions).toEqual([]);
    second.next([{ name: 'Milk' }]);
    expect(page.addSuggestions[0].name).toBe('Milk');
    page.cancelAdd();
    second.next([{ name: 'Late' }]);
    expect(page.addSuggestions).toEqual([]);
  });
  it('reports load errors instead of showing an empty successful list', () => {
    service.getItems.mockReturnValue(throwError(() => new Error('offline')));
    page.reload();
    expect(page.loadFailed).toBe(true);
    expect(page.loading).toBe(false);
    page.openAdd();
    expect(page.showAddForm).toBe(false);
  });
});
