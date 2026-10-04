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
