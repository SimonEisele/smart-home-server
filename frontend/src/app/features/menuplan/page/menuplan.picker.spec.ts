import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { MenuplanPage } from './menuplan.page';
import { MenuService } from '../service/menuplan.service';
import { RecipesService } from '../../recipes/service/recipes.service';
import { ShoppinglistService } from '../../shoppinglist/service/shoppinglist.service';
import { RecipeCookService } from '../../../shared/services/recipe-cook.service';
import { Recipe } from '../../recipes/model/recipes.model';

const curry: Recipe = {
  id: 'c',
  name: 'Curry',
  category: 'mahlzeit',
  baseServings: 4,
  ingredients: [{ id: '1', name: 'Kokosmilch', quantityPerPerson: 400, unit: 'ml' }],
  steps: [],
};
const zopf: Recipe = { id: 'z', name: 'Zopf', category: 'backen', baseServings: 8, ingredients: [], steps: [] };

describe('Menu plan picker and cooking', () => {
  let page: MenuplanPage;
  const getRecipes = vi.fn(() => of([curry, zopf]));

  beforeEach(() => {
    getRecipes.mockClear();
    TestBed.configureTestingModule({
      imports: [MenuplanPage],
      providers: [
        {
          provide: MenuService,
          useValue: {
            getMenus: () =>
              of([{ id: 'm', date: '2026-11-09', dinnerRecipe: curry, dinnerPersons: 3 }]),
          },
        },
        { provide: RecipesService, useValue: { getRecipes } },
        { provide: ShoppinglistService, useValue: {} },
      ],
    });
    page = TestBed.createComponent(MenuplanPage).componentInstance;
    page.initWeek(new Date(2026, 10, 9));
    page.loadWeek();
  });

  it('suggests main dishes first but keeps other categories selectable for breakfast', () => {
    page.openPicker('2026-11-10', 'breakfast');
    expect(page.filteredRecipes.map((r) => r.name)).toEqual(['Curry']);
    expect(page.otherRecipes.map((r) => r.name)).toEqual(['Zopf']);
    page.openPicker('2026-11-10', 'extra');
    expect(page.filteredRecipes.map((r) => r.name)).toEqual(['Zopf']);
  });

  it('finds recipes by ingredient', () => {
    page.openPicker('2026-11-10', 'dinner');
    page.pickerSearch = 'kokos';
    expect(page.filteredRecipes).toEqual([curry]);
    expect(page.otherRecipes).toEqual([]);
  });

  it('opens the cooking view scaled to the planned diners and reuses loaded recipes', () => {
    const open = vi.spyOn(TestBed.inject(RecipeCookService), 'open');
    page.cookMeal('2026-11-09', 'dinner', new MouseEvent('click'));
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ recipe: curry, persons: 3, source: 'menuplan', meal: 'dinner' }),
    );
    page.nextWeek();
    expect(getRecipes).toHaveBeenCalledTimes(1);
  });

  it('switches to "Wer isst mit?" and refreshes the person counts after changes', () => {
    vi.useFakeTimers();
    page.showAttendance();
    expect(page.view).toBe('attendance');
    expect(page.attendanceDays.map(d => d.dateStr)[0]).toBe('2026-11-09');
    const menus = TestBed.inject(MenuService) as unknown as { getMenus: () => unknown };
    const spy = vi.spyOn(menus, 'getMenus').mockReturnValue(
      of([{ id: 'm', date: '2026-11-09', dinnerRecipe: curry, dinnerPersons: 5 }]));
    page.refreshPersons(); page.refreshPersons();
    vi.advanceTimersByTime(700);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(page.getMealPersons('2026-11-09', 'dinner')).toBe(5);
    vi.useRealTimers();
  });
});
