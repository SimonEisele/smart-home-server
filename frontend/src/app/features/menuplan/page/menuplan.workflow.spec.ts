import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { MenuplanPage } from './menuplan.page';
import { MenuService } from '../service/menuplan.service';
import { Menu } from '../model/menuplan.model';
import { Recipe } from '../../recipes/model/recipes.model';

it('keeps meal selection open on failure and prevents duplicate requests while saving', () => {
  const createMenu = vi.fn();
  TestBed.configureTestingModule({ providers:[{ provide:MenuService, useValue:{ createMenu } }] });
  const page = TestBed.createComponent(MenuplanPage).componentInstance;
  const recipe:Recipe = { id:'r',name:'Recipe',ingredients:[],steps:[] };
  page.openPicker('2026-10-05','dinner'); createMenu.mockReturnValue(throwError(() => new Error('offline')));
  page.selectRecipe(recipe); expect(page.activePicker).not.toBeNull(); expect(page.menuError).toBeTruthy();
  const response = new Subject<Menu>(); createMenu.mockReturnValue(response);page.selectRecipe(recipe);page.selectRecipe(recipe);
  expect(createMenu).toHaveBeenCalledTimes(2);
  response.next({id:'m',date:'2026-10-05',dinnerRecipe:recipe});response.complete();
  expect(page.activePicker).toBeNull();expect(page.menus['2026-10-05'].dinnerRecipe?.id).toBe('r');
});
