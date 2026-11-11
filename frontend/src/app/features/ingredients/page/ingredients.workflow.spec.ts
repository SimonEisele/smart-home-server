import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { IngredientsPage } from './ingredients.page';
import { RecipesService } from '../../recipes/service/recipes.service';
import { Ingredient } from '../model/ingredient.model';
const flour: Ingredient = {
  id: 1,
  name: 'Mehl',
  category: 'getreide',
  subcategory: 'Backzutaten',
  defaultUnit: 'g',
  usageCount: 2,
};
const archived: Ingredient = {
  id: 2,
  name: 'Milch',
  category: 'milch',
  subcategory: '',
  defaultUnit: 'ml',
  archived: true,
  usageCount: 0,
};
describe('Ingredient management workflow', () => {
  const service = {
    getIngredients: vi.fn(),
    createIngredient: vi.fn(),
    updateIngredient: vi.fn(),
    deleteIngredient: vi.fn(),
    getUnlinkedIngredients: vi.fn(),
    mergeIngredient: vi.fn(),
  };
  let page: IngredientsPage;
  beforeEach(() => {
    vi.resetAllMocks();
    service.getIngredients.mockReturnValue(of([flour, archived]));
    service.getUnlinkedIngredients.mockReturnValue(
      of([{ name: 'Bärlauch', suggestedUnit: 'Bund', recipes: ['Pesto'], usageCount: 1 }]),
    );
    TestBed.configureTestingModule({
      imports: [IngredientsPage],
      providers: [{ provide: RecipesService, useValue: service }],
    });
    page = TestBed.createComponent(IngredientsPage).componentInstance;
    page.ngOnInit();
  });
  it('combines name, category, unit and archive filters', () => {
    expect(page.filtered).toEqual([flour]);
    page.search = 'backzutaten';
    expect(page.filtered).toEqual([flour]);
    page.search = '';
    page.status = 'archived';
    expect(page.filtered).toEqual([archived]);
    page.category = 'getreide';
    expect(page.filtered).toEqual([]);
    page.resetFilters();
    expect(page.filtered).toEqual([flour]);
  });
  it('shows loading errors and allows another attempt', () => {
    service.getIngredients.mockReturnValue(throwError(() => new Error('offline')));
    page.load();
    expect(page.loading).toBe(false);
    expect(page.loadError).toBeTruthy();
    service.getIngredients.mockReturnValue(of([flour]));
    page.load();
    expect(page.loadError).toBe('');
  });
  it('detects duplicate names including spacing and unicode', () => {
    page.openAdd();
    page.form.name = '  ＭＥＨＬ  ';
    page.save();
    expect(page.duplicate?.id).toBe(1);
    expect(service.createIngredient).not.toHaveBeenCalled();
  });
  it('retains input and shows the server reason when saving fails', () => {
    page.startEdit(flour);
    page.form.name = 'Weizenmehl';
    service.updateIngredient.mockReturnValue(
      throwError(() => ({ error: { error: { code: 'VALIDATION_ERROR', message: 'Name bereits vorhanden.', details: { name: ['Name bereits vorhanden.'] } } } })),
    );
    page.save();
    expect(page.form.name).toBe('Weizenmehl');
    expect(page.modal).toBe('edit');
    expect(page.formError).toContain('bereits');
    expect(page.saving).toBe(false);
  });
  it('prevents multiple saves and dismissal while pending', () => {
    const response = new Subject<Ingredient>();
    service.createIngredient.mockReturnValue(response);
    page.openAdd();
    page.form.name = 'Wasser';
    page.save();
    page.save();
    page.closeModal();
    expect(service.createIngredient).toHaveBeenCalledTimes(1);
    expect(page.modal).toBe('edit');
    response.next({ ...flour, id: 3, name: 'Wasser' });
    response.complete();
    expect(page.modal).toBeNull();
    expect(page.ingredients.length).toBe(3);
  });
  it('archives used entries instead of allowing deletion', () => {
    page.startEdit(flour);
    page.confirmDelete();
    expect(page.modal).toBe('edit');
    service.updateIngredient.mockReturnValue(of({ ...flour, archived: true }));
    page.archive();
    expect(page.filtered.length).toBe(0);
    expect(page.archivedCount).toBe(2);
  });
  it('restores archived entries without modifying recipe quantities', () => {
    page.startEdit(archived);
    service.updateIngredient.mockReturnValue(of({ ...archived, archived: false }));
    page.archive();
    expect(service.updateIngredient).toHaveBeenCalledWith(2, { archived: false });
    expect(page.activeCount).toBe(2);
  });
  it('keeps a failed delete open and retries successfully', () => {
    page.startEdit(archived);
    page.confirmDelete();
    service.deleteIngredient.mockReturnValue(
      throwError(() => ({ error: { error: { code: 'CONFLICT', message: 'Wird inzwischen verwendet.', details: null } } })),
    );
    page.delete();
    expect(page.formError).toContain('verwendet');
    expect(page.ingredients.length).toBe(2);
    service.deleteIngredient.mockReturnValue(of(undefined));
    page.delete();
    expect(page.modal).toBeNull();
    expect(page.ingredients.length).toBe(1);
  });
  it('keeps a legacy custom unit available when editing', () => {
    page.startEdit({ ...flour, defaultUnit: 'Glas' });
    expect(page.formUnits).toContain('Glas');
  });
  it('offers free recipe ingredients for the catalog and drops them once added', () => {
    expect(page.unlinked.length).toBe(1);
    page.addFromUnlinked(page.unlinked[0]);
    expect(page.form).toEqual(expect.objectContaining({ name: 'Bärlauch', defaultUnit: 'Bund' }));
    service.createIngredient.mockReturnValue(
      of({ id: 9, name: 'Bärlauch', category: 'gewuerze', subcategory: '', defaultUnit: 'Bund', usageCount: 1 }),
    );
    page.save();
    expect(page.unlinked).toEqual([]);
  });
  it('merges a duplicate into the chosen ingredient', () => {
    const duplicate: Ingredient = { ...flour, id: 3, name: 'Weissmehl', usageCount: 1 };
    service.getIngredients.mockReturnValue(of([flour, duplicate]));
    page.load();
    page.startEdit(duplicate);
    page.startMerge();
    expect(page.mergeTargets.map((i) => i.id)).toEqual([1]);
    page.mergeTargetId = 1;
    service.mergeIngredient.mockReturnValue(of({ ...flour, usageCount: 3 }));
    page.merge();
    expect(service.mergeIngredient).toHaveBeenCalledWith(3, 1);
    expect(page.ingredients.map((i) => [i.id, i.usageCount])).toEqual([[1, 3]]);
    expect(page.modal).toBeNull();
  });
  it('counts per status and filters ingredients used in recipes', () => {
    service.getIngredients.mockReturnValue(of([flour, archived, { ...flour, id: 5, name: 'Zimt', usageCount: 0 }]));
    page.load();
    expect([page.statusCount('active'), page.statusCount('used'), page.statusCount('archived'), page.statusCount('all')]).toEqual([2, 1, 1, 3]);
    page.status = 'used';
    expect(page.filtered.map(i => i.name)).toEqual(['Mehl']);
    expect(page.filtersActive).toBe(true);
  });
});
