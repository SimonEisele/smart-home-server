import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { RecipesPage } from './recipes.page';
import { RecipesService } from '../service/recipes.service';
import { RecipeCookService } from '../../../shared/services/recipe-cook.service';
import { Recipe } from '../model/recipes.model';
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
    updateIngredient: vi.fn(),
  };
  let page: RecipesPage;
  beforeEach(() => {
    vi.resetAllMocks();
    service.getRecipes.mockReturnValue(of([recipe]));
    service.getIngredients.mockReturnValue(of([]));
    TestBed.configureTestingModule({
      imports: [RecipesPage],
      providers: [{ provide: RecipesService, useValue: service }],
    });
    page = TestBed.createComponent(RecipesPage).componentInstance;
    page.ngOnInit();
  });
  it('opens one shared cooking flow with recipe yield instead of inventing diners', () => {
    const open = vi.spyOn(TestBed.inject(RecipeCookService), 'open');
    page.startCooking(recipe);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'recipe', servings: 12, persons: 1 }),
    );
  });
  it('recognises ss/ß and archived entries and links rows once added to the catalog', () => {
    page.ingredientCatalog = [{ id: 7, name: 'Weißwein', category: 'saucen', defaultUnit: 'dl' } as never];
    page.archivedCatalog = [{ id: 9, name: 'Safran', category: 'gewuerze', defaultUnit: '', archived: true } as never];
    page.openEdit(recipe);
    page.form.ingredients[0].name = 'Weisswein';
    page.onIngredientNameChange(0);
    expect(page.form.ingredients[0]).toMatchObject({ name: 'Weißwein', ingredientId: 7 });
    expect(page.newIngredientPrompt).toBeNull();
    page.form.ingredients[0].name = 'safran';
    page.onIngredientNameChange(0);
    expect(page.newIngredientPrompt?.archived?.id).toBe(9);
    service.updateIngredient.mockReturnValue(of({ id: 9, name: 'Safran', category: 'gewuerze', defaultUnit: '', archived: false }));
    page.confirmNewIngredient();
    expect(service.updateIngredient).toHaveBeenCalledWith(9, { archived: false });
    expect(service.createIngredient).not.toHaveBeenCalled();
    expect(page.form.ingredients[0]).toMatchObject({ name: 'Safran', ingredientId: 9 });
    page.form.ingredients[0].name = 'Zimtstange';
    page.onIngredientNameChange(0);
    service.createIngredient.mockReturnValue(of({ id: 11, name: 'Zimtstange', category: 'gewuerze', defaultUnit: 'Stück' }));
    page.confirmNewIngredient();
    expect(page.form.ingredients[0]).toMatchObject({ name: 'Zimtstange', ingredientId: 11 });
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
    result.error({ error: { error: { code: 'VALIDATION_ERROR', message: 'Bitte eine eindeutige Zutat auswählen.', details: { steps: ['Bitte eine eindeutige Zutat auswählen.'] } } } });
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
  it('asks before discarding unsaved edits and closes untouched editors directly', () => {
    page.openEdit(recipe);
    page.requestClose();
    expect(page.showModal).toBe(false);
    page.openEdit(recipe);
    page.form.name = 'Geändert';
    page.requestClose();
    expect(page.showModal).toBe(true);
    expect(page.showDiscardConfirm).toBe(true);
    page.requestClose();
    expect(page.showModal).toBe(false);
  });
  it('imports a pasted ingredient list and links catalog entries', () => {
    page.ingredientCatalog = [
      { id: 7, name: 'Weizenmehl', category: 'getreide', subcategory: '', defaultUnit: 'g' },
    ];
    page.openAdd();
    page.openImport('ingredients');
    page.importText = '500 weizenmehl\n1/2 TL Salz';
    expect(page.importPreviewCount).toBe(2);
    page.applyImport();
    expect(page.form.ingredients.map((i) => [i.name, i.quantityPerPerson, i.unit, i.ingredientId])).toEqual([
      ['Weizenmehl', 500, 'g', 7],
      ['Salz', 0.5, 'TL', undefined],
    ]);
    page.openImport('steps');
    page.importText = '1. Mischen\n2. Backen';
    page.applyImport();
    expect(page.form.steps.map((s) => [s.order, s.description])).toEqual([
      [1, 'Mischen'],
      [2, 'Backen'],
    ]);
  });
  it('reorders ingredients and duplicates a recipe with fresh amount identities', () => {
    const withLink: Recipe = {
      ...recipe,
      ingredients: [...recipe.ingredients, { id: 'b', name: 'Salz', quantityPerPerson: 10, unit: 'g' }],
      steps: [{ order: 1, description: 'Mischen', ingredients: [{ recipeIngredientId: 'a', name: 'Mehl' }] }],
    };
    page.openEdit(withLink);
    page.moveIngredient(1, -1);
    expect(page.form.ingredients.map((i) => i.name)).toEqual(['Salz', 'Mehl']);
    page.duplicate();
    expect(page.modalMode).toBe('add');
    expect(page.form.name).toBe('Brot (Kopie)');
    expect((page.form as Recipe).id).toBeUndefined();
    const flour = page.form.ingredients.find((i) => i.name === 'Mehl')!;
    expect(flour.id).not.toBe('a');
    expect(page.form.steps[0].ingredients[0].recipeIngredientId).toBe(flour.id);
    expect(page.isDirty).toBe(true);
  });
  it('offers only categories with recipes and counts them under the search', () => {
    page.recipes = [recipe, { ...recipe, id: 's', name: 'Suppe', category: 'mahlzeit', ingredients: [] }];
    expect(page.categoryOptions.map(c => [c.value, c.count])).toEqual([['mahlzeit', 1], ['backen', 1]]);
    page.search = 'mehl';
    expect(page.categoryOptions.map(c => [c.value, c.count])).toEqual([['backen', 1]]);
    expect(page.searchCount).toBe(1);
  });
});
