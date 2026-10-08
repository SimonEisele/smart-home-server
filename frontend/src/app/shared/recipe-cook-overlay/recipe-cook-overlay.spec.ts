import { TestBed } from '@angular/core/testing';
import { RecipeCookOverlay } from './recipe-cook-overlay';

describe('Cooking quantities', () => {
  it('preserves trailing zeros in whole ingredient quantities', () => {
    const overlay = TestBed.createComponent(RecipeCookOverlay).componentInstance;
    const rows = overlay.scaledIngredients(
      {
        id: 'recipe',
        name: 'Recipe',
        baseServings: 2,
        steps: [],
        ingredients: [{ name: 'Flour', quantityPerPerson: 200, unit: 'g' }],
      },
      1,
      1,
    );
    expect(rows[0].qty).toBe('100');
  });
});

import { ShoppinglistService } from '../../features/shoppinglist/service/shoppinglist.service';
import { RecipeCookService } from '../services/recipe-cook.service';
import { of } from 'rxjs';
import { vi } from 'vitest';

it('exports the opened recipe and selected quantities only once', async () => {
  const addRecipe = vi.fn(() => of(1));
  TestBed.configureTestingModule({
    providers: [{ provide: ShoppinglistService, useValue: { addRecipe } }],
  });
  const fixture = TestBed.createComponent(RecipeCookOverlay);
  await fixture.whenStable();
  const overlay = fixture.componentInstance;
  const slot = {
    date: '2026-10-05',
    meal: 'dinner' as const,
    weekTag: '2026-W41',
    persons: 2,
    recipe: { id: 'unplanned', name: 'Test', baseServings: 2, ingredients: [], steps: [] },
  };
  TestBed.inject(RecipeCookService).open(slot);
  overlay.localPersons = 3;
  overlay.localUnitsPerPerson = 1.5;
  overlay.addToShoppingList(slot);
  overlay.addToShoppingList(slot);
  expect(addRecipe).toHaveBeenCalledExactlyOnceWith('unplanned', 3, 1.5);
  overlay.adjustPersons(1);
  expect(overlay.ingredientsAdded).toBe(false);
});

import { Subject, throwError } from 'rxjs';
const cookingRecipe = {
  id: 'bread',
  name: 'Brot',
  baseServings: 4,
  unitsPerPerson: 2,
  ingredients: [
    { id: 'amount', name: 'Mehl', quantityPerPerson: 500, unit: 'g' },
    { id: 'zero', name: 'Salz', quantityPerPerson: 0, unit: 'g' },
  ],
  steps: [
    {
      order: 1,
      description: 'Mischen',
      ingredients: [
        { recipeIngredientId: 'amount', name: 'Mehl', quantityPerPerson: 100, unit: 'g' },
      ],
    },
    {
      order: 2,
      description: 'Backen',
      ingredients: [{ recipeIngredientId: 'amount', name: 'Mehl' }],
    },
  ],
};
describe('Shared cooking journey', () => {
  const addRecipe = vi.fn();
  let overlay: RecipeCookOverlay, service: RecipeCookService;
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      providers: [{ provide: ShoppinglistService, useValue: { addRecipe } }],
    });
    overlay = TestBed.createComponent(RecipeCookOverlay).componentInstance;
    overlay.ngOnInit();
    service = TestBed.inject(RecipeCookService);
    service.open({
      date: '',
      meal: 'dinner',
      weekTag: '',
      persons: 1,
      servings: 4,
      source: 'recipe',
      recipe: cookingRecipe,
    });
  });
  it('starts at the recipe batch and preserves zero amounts', () => {
    expect(overlay.totalServings).toBe(4);
    expect(overlay.ingredients[0].qty).toBe('500');
    expect(overlay.ingredients[1].qty).toBe('0');
    overlay.selectedServings = 2;
    expect(overlay.ingredients[0].qty).toBe('250');
  });
  it('scales step overrides and uses the recipe amount when a step has no own amount', () => {
    overlay.selectedServings = 2;
    expect(overlay.stepIngredients[0].qty).toBe('50');
    overlay.nextStep();
    expect(overlay.stepIngredients[0].qty).toBe('250');
  });
  it('keeps step selection and preparation checks when switching tabs', () => {
    overlay.toggleIngredient('amount');
    overlay.nextStep();
    overlay.setTab('steps');
    overlay.setTab('full');
    overlay.setTab('steps');
    expect(overlay.currentStep).toBe(1);
    expect(overlay.checkedIngredients.has('amount')).toBe(true);
  });
  it('counts completed steps instead of pretending that opening a step completes it', () => {
    expect(overlay.progress).toBe(0);
    overlay.completeStep();
    expect(overlay.currentStep).toBe(1);
    expect(overlay.progress).toBe(50);
    overlay.completeStep();
    expect(overlay.progress).toBe(100);
    overlay.toggleComplete();
    expect(overlay.progress).toBe(50);
  });
  it('exports selected pieces directly and prevents a repeated export after changing back', () => {
    addRecipe.mockReturnValue(of(2));
    overlay.addToShoppingList(overlay.slot!);
    expect(addRecipe).toHaveBeenCalledWith('bread', 1, 4);
    overlay.selectedServings = 2;
    overlay.addToShoppingList(overlay.slot!);
    overlay.selectedServings = 4;
    overlay.addToShoppingList(overlay.slot!);
    expect(addRecipe).toHaveBeenCalledTimes(2);
  });
  it('locks close while pending and retains state for retry after failure', () => {
    const result = new Subject<number>();
    addRecipe.mockReturnValue(result);
    overlay.addToShoppingList(overlay.slot!);
    overlay.close();
    expect(overlay.slot).not.toBeNull();
    result.error(new Error('offline'));
    expect(overlay.exportError).toBeTruthy();
    expect(overlay.currentStep).toBe(0);
    addRecipe.mockReturnValue(of(2));
    overlay.addToShoppingList(overlay.slot!);
    expect(overlay.ingredientsAdded).toBe(true);
  });
  it('ignores late export feedback after a different recipe is opened', () => {
    const result = new Subject<number>();
    addRecipe.mockReturnValue(result);
    overlay.addToShoppingList(overlay.slot!);
    service.open({ ...overlay.slot!, recipe: { ...cookingRecipe, id: 'other' } });
    result.next(2);
    expect(overlay.addedMessage).toBe('');
    expect(overlay.ingredientsAdded).toBe(false);
  });
  it('prevents invalid quantities from reaching the shopping endpoint', () => {
    overlay.selectedServings = 0;
    overlay.addToShoppingList(overlay.slot!);
    expect(addRecipe).not.toHaveBeenCalled();
  });
});

describe('Separate cooking step popup', () => {
  let overlay: RecipeCookOverlay;
  beforeEach(() => {
    overlay = TestBed.createComponent(RecipeCookOverlay).componentInstance;
    overlay.ngOnInit();
    TestBed.inject(RecipeCookService).open({date:'',meal:'dinner',weekTag:'',persons:1,source:'recipe',servings:4,recipe:{...cookingRecipe, sideNotes:[{label:'Ofentemperatur',value:'180 °C Ober-/Unterhitze'}],instructions:'Ofen vorheizen.'}});
  });
  it('returns from the step popup without closing the recipe or losing preparation and progress', () => {
    overlay.toggleIngredient('amount'); overlay.setTab('steps'); overlay.completeStep();
    overlay.onKey(new KeyboardEvent('keydown',{key:'Escape'}));
    expect(overlay.activeTab).toBe('full'); expect(overlay.slot).not.toBeNull();
    expect(overlay.currentStep).toBe(1); expect(overlay.completedCount).toBe(1); expect(overlay.checkedIngredients.has('amount')).toBe(true);
    overlay.setTab('steps'); expect(overlay.currentStep).toBe(1);
  });
  it('closes only the focused step popup when its backdrop is clicked', () => {
    overlay.setTab('steps');
    const element=document.createElement('div');
    overlay.onStepBackdropClick({target:element,currentTarget:element} as unknown as MouseEvent);
    expect(overlay.activeTab).toBe('full'); expect(overlay.slot).not.toBeNull();
  });
  it('does not open a focused popup for invalid amounts or an empty section', () => {
    overlay.selectedServings=0; overlay.setTab('steps'); expect(overlay.activeTab).toBe('full');
    overlay.selectedServings=4; overlay.setSection(999); overlay.setTab('steps'); expect(overlay.activeTab).toBe('full');
  });
  it('shows notes in both dialogs and keeps exactly one modal active', async () => {
    const fixture=TestBed.createComponent(RecipeCookOverlay);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[role=dialog]').length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('180 °C Ober-/Unterhitze');
    fixture.componentInstance.setTab('steps'); fixture.detectChanges();
    const dialog=fixture.nativeElement.querySelector('[role=dialog]');
    expect(fixture.nativeElement.querySelectorAll('[role=dialog]').length).toBe(1);
    expect(dialog.getAttribute('aria-label')).toBe('Kochschritte');
    expect(dialog.textContent).toContain('180 °C Ober-/Unterhitze');
    expect(dialog.textContent).toContain('Alle Zutaten und Zubereitungshinweise');
    fixture.componentInstance.setTab('full'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=dialog]').getAttribute('aria-label')).toBe('Kochen');
  });
});
