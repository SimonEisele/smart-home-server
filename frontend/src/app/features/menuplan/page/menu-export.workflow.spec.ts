import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { localIsoDate } from '../../../shared/date-utils';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { MenuplanPage } from './menuplan.page';
import { MenuService } from '../service/menuplan.service';
import { RecipesService } from '../../recipes/service/recipes.service';
import { ShoppinglistService, MenuExportPlan } from '../../shoppinglist/service/shoppinglist.service';
import { Recipe } from '../../recipes/model/recipes.model';
import { Menu } from '../model/menuplan.model';

const recipe:Recipe={id:'r',name:'Pasta',baseServings:4,ingredients:[],steps:[]};
const extra:Recipe={...recipe,id:'e',name:'Cookies',category:'backen',baseServings:12};
const plan:MenuExportPlan={data:[{name:'Pasta',quantity:200,unit:'g',category:'Getreide',sources:['Pasta'],quantityIncomplete:false}],count:1,meals:[],warnings:[],weekTag:'2026-W41',blocked:false,previewToken:'verified'};
describe('Menu export workflow',()=>{
  const menus={getMenus:vi.fn(),createMenu:vi.fn(),updateMenu:vi.fn()};
  const shopping={previewMenuplan:vi.fn(),applyMenuplan:vi.fn()};let page:MenuplanPage;
  beforeEach(()=>{
    vi.resetAllMocks();TestBed.configureTestingModule({imports:[MenuplanPage],providers:[{provide:MenuService,useValue:menus},{provide:ShoppinglistService,useValue:shopping},{provide:RecipesService,useValue:{getRecipes:()=>of([recipe,extra])}}]});
    page=TestBed.createComponent(MenuplanPage).componentInstance;page.initWeek(new Date('2026-10-05T12:00:00'));page.exportWeekStart='2026-10-05';
    menus.getMenus.mockReturnValue(of([{id:'m',date:'2026-10-05',dinnerRecipe:recipe,dinnerPersons:2,extraRecipes:[extra]}]));shopping.previewMenuplan.mockReturnValue(of(plan));
  });
  it('selects attended cooking meals and extras, requesting a server preview without browser totals',()=>{
    page.openExportModal();expect(page.exportSelected.has('2026-10-05:dinner')).toBe(true);expect(page.exportSelected.has('2026-10-05:extra:e')).toBe(true);
    expect(page.extraServings['2026-10-05:extra:e']).toBe(12);
    expect(shopping.previewMenuplan.mock.calls[0][0]).toMatchObject({weekStart:'2026-10-05',strict:true,resetExisting:true});expect(shopping.previewMenuplan.mock.calls[0][0].personCounts).toBeUndefined();
  });
  it('excludes meals with zero attendance and includes following-week leftover diners',()=>{
    menus.getMenus.mockReturnValue(of([{id:'m',date:'2026-10-11',dinnerRecipe:recipe,dinnerPersons:0},{id:'next',date:'2026-10-12',lunchPersons:2,lunchLeftoversRef:'2026-10-11:dinner'}]));page.openExportModal();
    expect(page.exportSelected.has('2026-10-11:dinner')).toBe(true);expect(page.exportMealEffectivePersons('2026-10-11','dinner')).toBe(2);
    expect(page.exportSelected.has('2026-10-05:dinner')).toBe(false);
  });
  it('keeps selection on preview failure and permits retry',()=>{
    shopping.previewMenuplan.mockReturnValue(throwError(()=>new Error('offline')));page.openExportModal();expect(page.exportSelected.size).toBe(2);expect(page.previewLoading).toBe(false);expect(page.exportError).toBeTruthy();
    shopping.previewMenuplan.mockReturnValue(of(plan));page.refreshPreview();expect(page.preview?.previewToken).toBe('verified');
  });
  it('ignores a late response for a previous selection',()=>{
    const old=new Subject<MenuExportPlan>(),latest=new Subject<MenuExportPlan>();shopping.previewMenuplan.mockReturnValueOnce(old).mockReturnValueOnce(latest);
    page.openExportModal();page.toggleExportKey('2026-10-05:extra:e');latest.next({...plan,count:2});old.next({...plan,count:99});expect(page.preview?.count).toBe(2);
  });
  it('sends the verified token once, locks the dialog, and reports completion',()=>{
    page.openExportModal();const response=new Subject<number>();shopping.applyMenuplan.mockReturnValue(response);page.doExport();page.doExport();page.closeExportModal();expect(page.showExportModal).toBe(true);expect(shopping.applyMenuplan).toHaveBeenCalledTimes(1);expect(shopping.applyMenuplan.mock.calls[0][0].previewToken).toBe('verified');
    response.next(3);response.complete();expect(page.exportApplied).toBe(true);expect(page.exportDone).toContain('3 Zutatenpositionen');page.doExport();expect(shopping.applyMenuplan).toHaveBeenCalledTimes(1);
  });
  it('requires a new preview after rejected export and retains selections',()=>{
    page.openExportModal();shopping.applyMenuplan.mockReturnValue(throwError(()=>new Error('changed')));page.doExport();expect(page.preview).toBeNull();expect(page.exportSelected.size).toBe(2);expect(page.exporting).toBe(false);expect(page.exportError).toBeTruthy();
  });
  it('does not export a blocked preview',()=>{
    shopping.previewMenuplan.mockReturnValue(of({...plan,blocked:true}));page.openExportModal();page.doExport();expect(shopping.applyMenuplan).not.toHaveBeenCalled();
  });
  it('preserves explicit extra quantities when previewing again',()=>{
    page.openExportModal();page.setExtraServings('2026-10-05:extra:e',6);expect(shopping.previewMenuplan.mock.calls.at(-1)?.[0].extraServings).toEqual({'2026-10-05:extra:e':6});
  });
  it('resets the loading state after a failed week request',()=>{
    menus.getMenus.mockReturnValue(throwError(()=>new Error('offline')));page.loadWeek();expect(page.loading).toBe(false);expect(page.loadError).toBeTruthy();
  });
  it('offers only earlier cooked meals within seven days as leftovers',()=>{
    page.activePicker={dateStr:'2026-10-08',meal:'lunch'};page.menus={'2026-10-08':{id:'today',date:'2026-10-08',breakfastRecipe:recipe,dinnerRecipe:recipe},'2026-10-09':{id:'future',date:'2026-10-09',lunchRecipe:recipe},'2026-09-30':{id:'old',date:'2026-09-30',lunchRecipe:recipe}};
    expect(page.leftoversOptions.map(o=>o.ref)).toEqual(['2026-10-08:breakfast']);
  });
});

it('opens the same preview directly from the shopping-list entry point',()=>{
  const today=localIsoDate(new Date());
  TestBed.configureTestingModule({imports:[MenuplanPage],providers:[
    {provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap({export:'true'})}}},
    {provide:MenuService,useValue:{getMenus:()=>of([{id:'m',date:today,dinnerRecipe:recipe,dinnerPersons:2}])}},
    {provide:RecipesService,useValue:{getRecipes:()=>of([recipe])}},
    {provide:ShoppinglistService,useValue:{previewMenuplan:()=>of(plan)}}
  ]});
  const page=TestBed.createComponent(MenuplanPage).componentInstance;page.ngOnInit();
  expect(page.showExportModal).toBe(true);expect(page.preview?.previewToken).toBe('verified');
});
