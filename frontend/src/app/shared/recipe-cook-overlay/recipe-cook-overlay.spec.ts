import { TestBed } from '@angular/core/testing';
import { RecipeCookOverlay } from './recipe-cook-overlay';

describe('Cooking quantities', () => {
  it('preserves trailing zeros in whole ingredient quantities', () => {
    const overlay = TestBed.createComponent(RecipeCookOverlay).componentInstance;
    const rows = overlay.scaledIngredients({ id: 'recipe', name: 'Recipe', baseServings: 2, steps: [],
      ingredients: [{ name: 'Flour', quantityPerPerson: 200, unit: 'g' }] }, 1, 1);
    expect(rows[0].qty).toBe('100');
  });
});

import { ShoppinglistService } from '../../features/shoppinglist/service/shoppinglist.service';
import { RecipeCookService } from '../services/recipe-cook.service';
import { of } from 'rxjs';
import { vi } from 'vitest';

it('exports the opened recipe and selected quantities only once', async () => {
  const addRecipe = vi.fn(() => of(1));
  TestBed.configureTestingModule({ providers:[{ provide:ShoppinglistService, useValue:{ addRecipe } }] });
  const fixture = TestBed.createComponent(RecipeCookOverlay); await fixture.whenStable();
  const overlay = fixture.componentInstance;
  const slot = { date:'2026-10-05',meal:'dinner' as const,weekTag:'2026-W41',persons:2,recipe:{ id:'unplanned',name:'Test',baseServings:2,ingredients:[],steps:[] } };
  TestBed.inject(RecipeCookService).open(slot);
  overlay.localPersons = 3; overlay.localUnitsPerPerson = 1.5;
  overlay.addToShoppingList(slot); overlay.addToShoppingList(slot);
  expect(addRecipe).toHaveBeenCalledExactlyOnceWith('unplanned',3,1.5);
  overlay.adjustPersons(1); expect(overlay.ingredientsAdded).toBe(false);
});
