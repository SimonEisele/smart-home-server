import { Component, HostListener, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuService } from '../service/menuplan.service';
import { Menu } from '../model/menuplan.model';
import { RecipesService } from '../../recipes/service/recipes.service';
import { Recipe } from '../../recipes/model/recipes.model';
import { ShoppinglistService } from '../../shoppinglist/service/shoppinglist.service';

export type MealType = 'breakfast' | 'lunch' | 'dinner';
export type PickerMode = MealType | 'extra';

interface DayEntry { date: Date; dateStr: string; isToday: boolean; }

@Component({
  selector: 'app-menuplan-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './menuplan.page.html',
  styleUrl: './menuplan.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuplanPage implements OnInit {
  weekStart!: Date;
  days: DayEntry[] = [];
  recipes: Recipe[] = [];
  menus: Record<string, Menu> = {};

  activePicker: { dateStr: string; meal: PickerMode } | null = null;
  pickerTab: 'recipe' | 'leftovers' = 'recipe';
  pickerSearch = '';
  leftoverDays: DayEntry[] = [];
  leftoverMenus: Record<string, Menu> = {};

  showExportModal = false;
  exportWeekStart = '';
  exportMenus: Menu[] = [];
  exportSelected = new Set<string>();
  exportLoading = false;
  exportDone = '';

  readonly DEFAULT_PERSONS = 2;
  readonly DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  readonly MEAL_LABELS: Record<string, string> = { breakfast: 'Morgen', lunch: 'Mittag', dinner: 'Abend', extra: 'Extra' };
  readonly MEALS: MealType[] = ['breakfast', 'lunch', 'dinner'];
  readonly RECIPE_CATEGORY_LABELS: Record<string, string> = {
    mahlzeit: 'Mahlzeit', dessert: 'Dessert', backen: 'Backen',
    snack: 'Snack', beilage: 'Beilage', sonstiges: 'Sonstiges',
  };

  constructor(
    private menuService: MenuService,
    private recipesService: RecipesService,
    private shoppingService: ShoppinglistService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.initWeek(new Date());
    this.exportWeekStart = this.toIsoDate(this.weekStart);
    this.recipesService.getRecipes().subscribe(r => { this.recipes = r; this.cdr.detectChanges(); });
    this.loadWeek();
    this.loadLeftoverRange();
  }

  initWeek(date: Date): void {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1) - day);
    this.weekStart = d;
    const todayStr = this.toIsoDate(new Date());
    this.days = Array.from({ length: 7 }, (_, i) => {
      const di = new Date(d);
      di.setDate(d.getDate() + i);
      const dateStr = this.toIsoDate(di);
      return { date: di, dateStr, isToday: dateStr === todayStr };
    });
  }

  prevWeek(): void { const d = new Date(this.weekStart); d.setDate(d.getDate() - 7); this.initWeek(d); this.loadWeek(); }
  nextWeek(): void { const d = new Date(this.weekStart); d.setDate(d.getDate() + 7); this.initWeek(d); this.loadWeek(); }

  get weekRange(): string {
    if (!this.days.length) return '';
    const a = this.days[0].date, b = this.days[6].date;
    const fmt = (dt: Date) => `${dt.getDate()}.${dt.getMonth() + 1}.`;
    return `${fmt(a)} – ${fmt(b)}${b.getFullYear()}`;
  }

  getMealRecipe(dateStr: string, meal: MealType): Recipe | null {
    const m = this.menus[dateStr];
    if (!m) return null;
    if (meal === 'breakfast') return m.breakfastRecipe ?? null;
    if (meal === 'lunch') return m.lunchRecipe ?? null;
    return m.dinnerRecipe ?? null;
  }

  getMealPersons(dateStr: string, meal: MealType): number {
    const m = this.menus[dateStr];
    if (!m) return 0;
    const recipe = this.getMealRecipe(dateStr, meal);
    if (meal === 'breakfast') return m.breakfastPersons ?? (recipe ? this.DEFAULT_PERSONS : 0);
    if (meal === 'lunch') return m.lunchPersons ?? (recipe ? this.DEFAULT_PERSONS : 0);
    return m.dinnerPersons ?? (recipe ? this.DEFAULT_PERSONS : 0);
  }

  getMealLeftoverPersons(dateStr: string, meal: MealType): number {
    const ref = `${dateStr}:${meal}`;
    let total = 0;
    for (const m of Object.values(this.menus)) {
      for (const cm of this.MEALS) {
        const cmRef = cm === 'breakfast' ? m.breakfastLeftoversRef
                    : cm === 'lunch' ? m.lunchLeftoversRef
                    : m.dinnerLeftoversRef;
        if (cmRef === ref) total += this.getStoredMealPersons(m, cm);
      }
    }
    return total;
  }

  getMealEffectivePersons(dateStr: string, meal: MealType): number {
    return this.getMealPersons(dateStr, meal) + this.getMealLeftoverPersons(dateStr, meal);
  }

  getMealLeftoversRef(dateStr: string, meal: MealType): string | null {
    const m = this.menus[dateStr];
    if (!m) return null;
    if (meal === 'breakfast') return m.breakfastLeftoversRef ?? null;
    if (meal === 'lunch') return m.lunchLeftoversRef ?? null;
    return m.dinnerLeftoversRef ?? null;
  }

  formatLeftoversRef(ref: string): string {
    const [dateStr, meal] = ref.split(':');
    const allDays = [...this.days, ...this.leftoverDays];
    const seen = new Set<string>();
    const uniqueDays = allDays.filter(d => { if (seen.has(d.dateStr)) return false; seen.add(d.dateStr); return true; });
    const entry = uniqueDays.find(d => d.dateStr === dateStr);
    const dayName = entry
      ? `${this.DAY_NAMES[entry.date.getDay()]}. ${entry.date.getDate()}.${entry.date.getMonth() + 1}.`
      : dateStr;
    return `Reste: ${dayName} ${this.MEAL_LABELS[meal as MealType] ?? meal}`;
  }

  openPicker(dateStr: string, meal: PickerMode): void {
    this.activePicker = { dateStr, meal };
    this.pickerTab = 'recipe';
    this.pickerSearch = '';
  }

  closePicker(): void { this.activePicker = null; }

  onPickerBackdropClick(e: MouseEvent): void { if (e.target === e.currentTarget) this.closePicker(); }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.activePicker) this.closePicker();
    else if (this.showExportModal) this.closeExportModal();
  }

  get pickerDayLabel(): string {
    if (!this.activePicker) return '';
    const entry = this.days.find(d => d.dateStr === this.activePicker!.dateStr);
    if (!entry) return '';
    return `${this.DAY_NAMES[entry.date.getDay()]}., ${entry.date.getDate()}.${entry.date.getMonth() + 1}.`;
  }

  get filteredRecipes(): Recipe[] {
    const q = this.pickerSearch.toLowerCase();
    const isExtra = this.activePicker?.meal === 'extra';
    const byCategory = isExtra
      ? this.recipes.filter(r => r.category && r.category !== 'mahlzeit')
      : this.recipes.filter(r => !r.category || r.category === 'mahlzeit');
    if (!q) return byCategory;
    return byCategory.filter(r => r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q));
  }

  get leftoversOptions(): Array<{ ref: string; label: string; recipeName: string }> {
    if (!this.activePicker) return [];
    const { dateStr: cd, meal: cm } = this.activePicker;
    const result: Array<{ ref: string; label: string; recipeName: string }> = [];
    const seen = new Set<string>();
    const allMenuEntries: Array<[string, Menu]> = [...Object.entries(this.menus), ...Object.entries(this.leftoverMenus)];

    for (const [dateStr, m] of allMenuEntries) {
      const date = new Date(`${dateStr}T12:00:00`);
      for (const meal of this.MEALS) {
        const key = `${dateStr}:${meal}`;
        if (dateStr === cd && meal === cm) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        const recipe = meal === 'breakfast' ? m.breakfastRecipe : meal === 'lunch' ? m.lunchRecipe : m.dinnerRecipe;
        if (!recipe) continue;
        result.push({
          ref: key,
          label: `${this.DAY_NAMES[date.getDay()]}. ${date.getDate()}.${date.getMonth() + 1}. – ${this.MEAL_LABELS[meal]}`,
          recipeName: recipe.name,
        });
      }
    }

    result.sort((a, b) => b.ref.localeCompare(a.ref));
    return result;
  }

  selectRecipe(recipe: Recipe): void {
    if (!this.activePicker) return;
    const { dateStr, meal } = this.activePicker;
    if (meal === 'extra') {
      this.addExtra(dateStr, recipe.id);
    } else {
      this.setLocalMealRecipe(dateStr, meal, recipe);
      this.upsertMenu(dateStr, this.mealPatch(meal, recipe.id, null));
    }
    this.closePicker();
  }

  selectLeftovers(ref: string): void {
    if (!this.activePicker) return;
    const { dateStr, meal } = this.activePicker;
    this.upsertMenu(dateStr, this.mealPatch(meal as MealType, null, ref));
    this.closePicker();
  }

  clearMeal(dateStr: string, meal: MealType, e: MouseEvent): void {
    e.stopPropagation();
    const existing = this.menus[dateStr];
    if (!existing?.id) return;
    this.upsertMenu(dateStr, this.mealPatch(meal, null, null));
  }

  getExtras(dateStr: string): Recipe[] { return this.menus[dateStr]?.extraRecipes ?? []; }

  addExtra(dateStr: string, recipeId: string): void {
    const ids = [...(this.menus[dateStr]?.extraRecipeIds ?? [])].filter(id => id !== recipeId);
    ids.push(recipeId);
    this.upsertMenu(dateStr, { extraRecipeIds: ids });
  }

  removeExtra(dateStr: string, recipeId: string, e: MouseEvent): void {
    e.stopPropagation();
    const ids = (this.menus[dateStr]?.extraRecipeIds ?? []).filter(id => id !== recipeId);
    this.upsertMenu(dateStr, { extraRecipeIds: ids });
  }

  private mealPatch(meal: MealType, recipeId: string | null, ref: string | null): Partial<Menu> {
    if (meal === 'breakfast') return { breakfastRecipeId: recipeId, breakfastLeftoversRef: ref };
    if (meal === 'lunch') return { lunchRecipeId: recipeId, lunchLeftoversRef: ref };
    return { dinnerRecipeId: recipeId, dinnerLeftoversRef: ref };
  }

  get exportDays(): Array<{ date: Date; dateStr: string }> {
    if (!this.exportWeekStart) return [];
    const d = new Date(`${this.exportWeekStart}T12:00:00`);
    return Array.from({ length: 7 }, (_, i) => {
      const di = new Date(d); di.setDate(d.getDate() + i);
      return { date: di, dateStr: this.toIsoDate(di) };
    });
  }

  get exportWeekRange(): string {
    const days = this.exportDays;
    if (!days.length) return '';
    const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
    return `${fmt(days[0].date)} – ${fmt(days[6].date)}${days[6].date.getFullYear()}`;
  }

  openExportModal(): void {
    this.exportWeekStart = this.toIsoDate(this.weekStart);
    this.exportDone = '';
    this.showExportModal = true;
    this.loadExportMenus();
    this.cdr.detectChanges();
  }

  closeExportModal(): void { this.showExportModal = false; this.cdr.detectChanges(); }

  onExportBackdropClick(e: MouseEvent): void { if (e.target === e.currentTarget) this.closeExportModal(); }

  prevExportWeek(): void {
    const d = new Date(`${this.exportWeekStart}T12:00:00`); d.setDate(d.getDate() - 7);
    this.exportWeekStart = this.toIsoDate(d); this.loadExportMenus();
  }

  nextExportWeek(): void {
    const d = new Date(`${this.exportWeekStart}T12:00:00`); d.setDate(d.getDate() + 7);
    this.exportWeekStart = this.toIsoDate(d); this.loadExportMenus();
  }

  loadExportMenus(): void {
    this.exportLoading = true;
    this.exportSelected = new Set();
    this.menuService.getMenus(this.exportWeekStart, 7).subscribe(menus => {
      this.exportMenus = menus;
      this.exportSelected = new Set(
        menus.flatMap(m => this.MEALS
          .filter(meal => !!this.exportMealRecipe(m.date, meal))
          .map(meal => `${m.date}:${meal}`))
      );
      this.exportLoading = false;
      this.cdr.detectChanges();
    });
  }

  exportMealRecipe(dateStr: string, meal: MealType): Recipe | null {
    const m = this.exportMenus.find(m => m.date === dateStr);
    if (!m) return null;
    if (meal === 'breakfast') return m.breakfastRecipe ?? null;
    if (meal === 'lunch') return m.lunchRecipe ?? null;
    return m.dinnerRecipe ?? null;
  }

  exportMealPersons(dateStr: string, meal: MealType): number {
    const m = this.exportMenus.find(m => m.date === dateStr);
    if (!m) return 0;
    const recipe = this.exportMealRecipe(dateStr, meal);
    if (meal === 'breakfast') return m.breakfastPersons ?? (recipe ? this.DEFAULT_PERSONS : 0);
    if (meal === 'lunch') return m.lunchPersons ?? (recipe ? this.DEFAULT_PERSONS : 0);
    return m.dinnerPersons ?? (recipe ? this.DEFAULT_PERSONS : 0);
  }

  exportMealLeftoverPersons(dateStr: string, meal: MealType): number {
    const ref = `${dateStr}:${meal}`;
    let total = 0;
    for (const m of this.exportMenus) {
      for (const cm of this.MEALS) {
        const cmRef = cm === 'breakfast' ? m.breakfastLeftoversRef : cm === 'lunch' ? m.lunchLeftoversRef : m.dinnerLeftoversRef;
        if (cmRef === ref) total += this.getStoredMealPersons(m, cm);
      }
    }
    return total;
  }

  exportMealEffectivePersons(dateStr: string, meal: MealType): number {
    return this.exportMealPersons(dateStr, meal) + this.exportMealLeftoverPersons(dateStr, meal);
  }

  isExportSelected(dateStr: string, meal: MealType): boolean { return this.exportSelected.has(`${dateStr}:${meal}`); }

  toggleExportMeal(dateStr: string, meal: MealType): void {
    if (!this.exportMealRecipe(dateStr, meal)) return;
    const key = `${dateStr}:${meal}`;
    const selected = new Set(this.exportSelected);
    if (selected.has(key)) selected.delete(key); else selected.add(key);
    this.exportSelected = selected;
  }

  doExport(): void {
    if (!this.exportSelected.size) return;
    const d = new Date(`${this.exportWeekStart}T12:00:00`);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const startOfYear = jan4.getTime() - ((jan4.getDay() + 6) % 7) * 86400000;
    const week = Math.floor((d.getTime() - startOfYear) / (7 * 86400000)) + 1;
    const weekTag = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
    const meals: string[] = [];
    const personCounts: Record<string, number> = {};

    for (const key of this.exportSelected) {
      const [dateStr, meal] = key.split(':');
      const recipe = this.exportMealRecipe(dateStr, meal as MealType);
      if (!recipe) continue;
      meals.push(key);
      personCounts[key] = Math.max(
        this.exportMealEffectivePersons(dateStr, meal as MealType),
        recipe.baseServings ?? this.DEFAULT_PERSONS,
      );
    }

    if (!meals.length) return;
    this.shoppingService.exportMenuplan(meals, weekTag, personCounts).subscribe(count => {
      this.exportDone = `${count} Einträge hinzugefügt.`;
      this.cdr.detectChanges();
      setTimeout(() => { this.exportDone = ''; this.showExportModal = false; this.cdr.detectChanges(); }, 2500);
    });
  }

  private loadWeek(): void {
    const weekStart = this.toIsoDate(this.weekStart);
    this.menuService.getMenus(weekStart, 7).subscribe(list => {
      this.menus = list.reduce((acc, m) => ({ ...acc, [m.date]: m }), {} as Record<string, Menu>);
      this.cdr.detectChanges();
    });
  }

  private loadLeftoverRange(): void {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 6);
    const fromStr = this.toIsoDate(from);
    const todayStr = this.toIsoDate(today);
    this.leftoverDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(from); d.setDate(from.getDate() + i);
      const dateStr = this.toIsoDate(d);
      return { date: d, dateStr, isToday: dateStr === todayStr };
    });
    this.menuService.getMenus(fromStr, 7).subscribe(list => {
      this.leftoverMenus = list.reduce((acc, m) => ({ ...acc, [m.date]: m }), {} as Record<string, Menu>);
      this.cdr.detectChanges();
    });
  }

  private upsertMenu(dateStr: string, patch: Partial<Menu>): void {
    const existing = this.menus[dateStr];
    if (existing?.id) {
      this.menuService.updateMenu(existing.id, patch).subscribe(updated => {
        this.menus = { ...this.menus, [dateStr]: this.mergeMenuResponse(updated, existing, patch) };
        this.cdr.detectChanges();
      });
    } else {
      const payload: Partial<Menu> = {
        date: dateStr,
        breakfastPersons: this.DEFAULT_PERSONS,
        lunchPersons: this.DEFAULT_PERSONS,
        dinnerPersons: this.DEFAULT_PERSONS,
        ...patch,
      };
      this.menuService.createMenu(payload).subscribe(created => {
        this.menus = { ...this.menus, [dateStr]: this.mergeMenuResponse(created, this.menus[dateStr], patch) };
        this.cdr.detectChanges();
      });
    }
  }

  private setLocalMealRecipe(dateStr: string, meal: MealType, recipe: Recipe): void {
    const current = this.menus[dateStr] ?? ({ id: '', date: dateStr } as Menu);
    const updated: Menu = { ...current };
    if (meal === 'breakfast') { updated.breakfastRecipe = recipe; updated.breakfastRecipeId = recipe.id; }
    if (meal === 'lunch') { updated.lunchRecipe = recipe; updated.lunchRecipeId = recipe.id; }
    if (meal === 'dinner') { updated.dinnerRecipe = recipe; updated.dinnerRecipeId = recipe.id; }
    this.menus = { ...this.menus, [dateStr]: updated };
    this.cdr.detectChanges();
  }

  private mergeMenuResponse(updated: Menu, previous: Menu | undefined, patch: Partial<Menu>): Menu {
    const merged: Menu = { ...(previous ?? {} as Menu), ...updated };
    for (const meal of this.MEALS) {
      const recipeKey = `${meal}Recipe` as 'breakfastRecipe' | 'lunchRecipe' | 'dinnerRecipe';
      const idKey = `${meal}RecipeId` as 'breakfastRecipeId' | 'lunchRecipeId' | 'dinnerRecipeId';
      if (patch[idKey] === null) merged[recipeKey] = null;
      else if (!updated[recipeKey] && previous?.[recipeKey] && updated[idKey] === previous[idKey]) merged[recipeKey] = previous[recipeKey];
    }
    return merged;
  }

  private getStoredMealPersons(menu: Menu, meal: MealType): number {
    const hasRecipe = meal === 'breakfast' ? !!menu.breakfastRecipe : meal === 'lunch' ? !!menu.lunchRecipe : !!menu.dinnerRecipe;
    if (meal === 'breakfast') return menu.breakfastPersons ?? (hasRecipe ? this.DEFAULT_PERSONS : 0);
    if (meal === 'lunch') return menu.lunchPersons ?? (hasRecipe ? this.DEFAULT_PERSONS : 0);
    return menu.dinnerPersons ?? (hasRecipe ? this.DEFAULT_PERSONS : 0);
  }

  private toIsoDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
