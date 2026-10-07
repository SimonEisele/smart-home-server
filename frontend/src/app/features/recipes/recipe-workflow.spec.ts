import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { Recipes } from './recipes';
import { RecipesService } from './service/recipes.service';
import { RecipeCookService } from '../../shared/services/recipe-cook.service';
import { Recipe } from './model/recipes.model';
const recipe: Recipe = {
  id: 'r',
  name: 'Brot',
  category: 'backen',
  baseServings: 12,
  servingType: 'Stücke',
  unitsPerPerson: 2,
  ingredients: [{ id: 'a', name: 'Mehl', quantityPerPerson: 500, unit: 'g' }],
  steps: [
    { order: 1, description: 'Mischen', ingredients: [] },
    { order: 2, description: 'Backen', ingredients: [] },
  ],
};
describe('Recipe editing workflow', () => {
  const service = {
    getRecipes: vi.fn(),
    getIngredients: vi.fn(),
    createRecipe: vi.fn(),
    updateRecipe: vi.fn(),
    deleteRecipe: vi.fn(),
    createIngredient: vi.fn(),
  };
  let page: Recipes;
  beforeEach(() => {
    vi.resetAllMocks();
    service.getRecipes.mockReturnValue(of([recipe]));
    service.getIngredients.mockReturnValue(of([]));
    TestBed.configureTestingModule({
      imports: [Recipes],
      providers: [{ provide: RecipesService, useValue: service }],
    });
    page = TestBed.createComponent(Recipes).componentInstance;
    page.ngOnInit();
  });
  it('opens one shared cooking flow with recipe yield instead of inventing diners', () => {
    const open = vi.spyOn(TestBed.inject(RecipeCookService), 'open');
    page.startCooking(recipe);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'recipe', servings: 12, persons: 1 }),
    );
  });
  it('filters ingredients and categories and sorts duration', () => {
    page.search = 'mehl';
    expect(page.filtered).toEqual([recipe]);
    page.categoryFilter = 'dessert';
    expect(page.filtered).toEqual([]);
    page.resetFilters();
    expect(page.filtered.length).toBe(1);
  });
  it('supports the same ingredient in multiple steps and independent step quantities', () => {
    page.openEdit(recipe);
    page.addExistingIngredientToStep(0, page.form.ingredients[0]);
    page.addExistingIngredientToStep(1, page.form.ingredients[0]);
    expect(page.form.steps[0].ingredients[0].recipeIngredientId).toBe('a');
    expect(page.form.steps[1].ingredients.length).toBe(1);
    page.form.steps[0].ingredients[0].quantityPerPerson = 100;
    page.onStepIngredientQtyUnitChange(0, 0);
    expect(page.form.ingredients[0].quantityPerPerson).toBe(500);
    expect(page.form.steps[1].ingredients[0].quantityPerPerson).toBeUndefined();
  });
  it('reorders steps and removes only the selected link', () => {
    page.openEdit(recipe);
    page.addExistingIngredientToStep(0, page.form.ingredients[0]);
    page.addExistingIngredientToStep(1, page.form.ingredients[0]);
    page.moveStep(1, -1);
    expect(page.form.steps[0].description).toBe('Backen');
    expect(page.form.steps.map((s) => s.order)).toEqual([1, 2]);
    page.unlinkStepIngredient(0, 0);
    expect(page.form.ingredients.length).toBe(1);
    expect(page.form.steps[1].ingredients.length).toBe(1);
  });
  it('preserves input on API failure and prevents saving twice while pending', () => {
    page.openEdit(recipe);
    page.form.name = 'Neu';
    const result = new Subject<Recipe>();
    service.updateRecipe.mockReturnValue(result);
    page.save();
    page.save();
    page.closeModal();
    expect(service.updateRecipe).toHaveBeenCalledTimes(1);
    expect(page.showModal).toBe(true);
    result.error({ error: { steps: ['Bitte eine eindeutige Zutat auswählen.'] } });
    expect(page.form.name).toBe('Neu');
    expect(page.formError).toContain('eindeutige');
    expect(page.saving).toBe(false);
  });
  it('does not silently discard an unselected step ingredient', () => {
    page.openEdit(recipe);
    page.addStepIngredient(0);
    page.save();
    expect(page.editorTab).toBe('steps');
    expect(service.updateRecipe).not.toHaveBeenCalled();
  });
  it('reports catalog failure while recipe loading still succeeds', () => {
    service.getIngredients.mockReturnValue(throwError(() => new Error('offline')));
    page.loadData();
    expect(page.catalogError).toBeTruthy();
    expect(page.recipes.length).toBe(1);
  });
});
