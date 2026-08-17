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

  // ── Export modal state ──────────────────────────────────────────────
  showExportModal = false;
  exportWeekStart = '';
  exportMenus: Menu[] = [];
  exportSelected = new Set<string>();
  exportLoading = false;
  exportDone = '';

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

  // ── Week navigation ──────────────────────────────────────────────────
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

  // ── Meal accessors ───────────────────────────────────────────────────
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
    if (meal === 'breakfast') return m.breakfastPersons ?? 0;
    if (meal === 'lunch') return m.lunchPersons ?? 0;
    return m.dinnerPersons ?? 0;
  }

  /** How many people will eat THIS meal's leftovers (from other meals in the current week) */
  getMealLeftoverPersons(dateStr: string, meal: MealType): number {
    const ref = `${dateStr}:${meal}`;
    let total = 0;
    for (const m of Object.values(this.menus)) {
      for (const cm of this.MEALS) {
        const cmRef = cm === 'breakfast' ? m.breakfastLeftoversRef
                    : cm === 'lunch'     ? m.lunchLeftoversRef
                    :                     m.dinnerLeftoversRef;
        if (cmRef === ref) {
          total += cm === 'breakfast' ? (m.breakfastPersons ?? 0)
                 : cm === 'lunch'     ? (m.lunchPersons ?? 0)
                 :                     (m.dinnerPersons ?? 0);
        }
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

  private getLeftoverMealRecipe(dateStr: string, meal: MealType): Recipe | null {
    const m = this.leftoverMenus[dateStr];
    if (!m) return null;
    if (meal === 'breakfast') return m.breakfastRecipe ?? null;
    if (meal === 'lunch') return m.lunchRecipe ?? null;
    return m.dinnerRecipe ?? null;
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

  // ── Picker ───────────────────────────────────────────────────────────
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
    return byCategory.filter(r =>
      r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)
    );
  }

  get leftoversOptions(): Array<{ ref: string; label: string; recipeName: string }> {
    if (!this.activePicker) return [];
    const { dateStr: cd, meal: cm } = this.activePicker;
    const result: Array<{ ref: string; label: string; recipeName: string }> = [];
    const seen = new Set<string>();

    // Prefer this.menus (fresh, updated on every upsert) over leftoverMenus (loaded once)
    const allMenuEntries: Array<[string, Menu]> = [
      ...Object.entries(this.menus),
      ...Object.entries(this.leftoverMenus),
    ];

    for (const [dateStr, m] of allMenuEntries) {
      const date = new Date(`${dateStr}T12:00:00`); // noon avoids timezone day-shift
      for (const meal of this.MEALS) {
        const key = `${dateStr}:${meal}`;
        if (dateStr === cd && meal === cm) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        let recipe: Recipe | null = null;
        if (meal === 'breakfast') recipe = m.breakfastRecipe ?? null;
        else if (meal === 'lunch') recipe = m.lunchRecipe ?? null;
        else recipe = m.dinnerRecipe ?? null;
        if (!recipe) continue;
        result.push({
          ref: key,
          label: `${this.DAY_NAMES[date.getDay()]}. ${date.getDate()}.${date.getMonth() + 1}. – ${this.MEAL_LABELS[meal]}`,
          recipeName: recipe.name,
        });
      }
    }

    result.sort((a, b) => b.ref.localeCompare(a.ref)); // newest first
    return result;
  }

  selectRecipe(recipe: Recipe): void {
    if (!this.activePicker) return;
    const { dateStr, meal } = this.activePicker;
    if (meal === 'extra') {
      this.addExtra(dateStr, recipe.id);
    } else {
      this.upsertMenu(dateStr, this.mealPatch(meal as MealType, recipe.id, null));
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

  getExtras(dateStr: string): Recipe[] {
    return this.menus[dateStr]?.extraRecipes ?? [];
  }

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
    if (meal === 'lunch')     return { lunchRecipeId: recipeId,      lunchLeftoversRef: ref };
    return                           { dinnerRecipeId: recipeId,     dinnerLeftoversRef: ref };
  }

  // ── Export modal ─────────────────────────────────────────────────────
  get exportDays(): Array<{ date: Date; dateStr: string }> {
    if (!this.exportWeekStart) return [];
    const d = new Date(this.exportWeekStart);
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

  closeExportModal(): void {
    this.showExportModal = false;
    this.cdr.detectChanges();
  }

  onExportBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.closeExportModal();
  }

  prevExportWeek(): void {
    const d = new Date(this.exportWeekStart); d.setDate(d.getDate() - 7);
    this.exportWeekStart = this.toIsoDate(d); this.loadExportMenus();
  }

  nextExportWeek(): void {
    const d = new Date(this.exportWeekStart); d.setDate(d.getDate() + 7);
    this.exportWeekStart = this.toIsoDate(d); this.loadExportMenus();
  }

  loadExportMenus(): void {
    this.exportLoading = true;
    this.exportSelected = new Set();
    this.menuService.getMenus(this.exportWeekStart, 7).subscribe(menus => {
      this.exportMenus = menus;
      const sel = new Set<string>();
      for (const m of menus) {
        if (m.breakfastRecipe) sel.add(`${m.date}:breakfast`);
        if (m.lunchRecipe)     sel.add(`${m.date}:lunch`);
        if (m.dinnerRecipe)    sel.add(`${m.date}:dinner`);
      }
      this.exportSelected = sel;
      this.exportLoading = false;
      this.cdr.detectChanges();
    });
  }

  exportMealRecipe(dateStr: string, meal: MealType): Recipe | null {
    const m = this.exportMenus.find(m => m.date === dateStr);
    if (!m) return null;
    if (meal === 'breakfast') return m.breakfastRecipe ?? null;
    if (meal === 'lunch')     return m.lunchRecipe ?? null;
    return m.dinnerRecipe ?? null;
  }

  exportMealPersons(dateStr: string, meal: MealType): number {
    const m = this.exportMenus.find(m => m.date === dateStr);
    if (!m) return 0;
    if (meal === 'breakfast') return m.breakfastPersons ?? 0;
    if (meal === 'lunch')     return m.lunchPersons ?? 0;
    return m.dinnerPersons ?? 0;
  }

  /** How many people will eat this meal's LEFTOVERS (from other meals referencing it) */
  exportMealLeftoverPersons(dateStr: string, meal: MealType): number {
    const ref = `${dateStr}:${meal}`;
    let total = 0;
    for (const m of this.exportMenus) {
      for (const cm of this.MEALS) {
        const cmRef = cm === 'breakfast' ? m.breakfastLeftoversRef
                    : cm === 'lunch'     ? m.lunchLeftoversRef
                    :                     m.dinnerLeftoversRef;
        if (cmRef === ref) {
          total += cm === 'breakfast' ? (m.breakfastPersons ?? 0)
                 : cm === 'lunch'     ? (m.lunchPersons ?? 0)
                 :                     (m.dinnerPersons ?? 0);
        }
      }
    }
    return total;
  }

  /** Direct attendance + people who will eat leftovers from this meal */
  exportMealEffectivePersons(dateStr: string, meal: MealType): number {
    return this.exportMealPersons(dateStr, meal) + this.exportMealLeftoverPersons(dateStr, meal);
  }

  isExportSelected(dateStr: string, meal: MealType): boolean {
    return this.exportSelected.has(`${dateStr}:${meal}`);
  }

  toggleExportMeal(dateStr: string, meal: MealType): void {
    const key = `${dateStr}:${meal}`;
    const s = new Set(this.exportSelected);
    if (s.has(key)) s.delete(key); else s.add(key);
    this.exportSelected = s;
  }

  doExport(): void {
    if (!this.exportSelected.size) return;
    const d = new Date(this.exportWeekStart);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const startOfYear = jan4.getTime() - ((jan4.getDay() + 6) % 7) * 86400000;
    const week = Math.floor((d.getTime() - startOfYear) / (7 * 86400000)) + 1;
    const weekTag = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
    // Only export meals with effective persons > 0; use effective count for scaling
    const meals: string[] = [];
    const personCounts: Record<string, number> = {};
    for (const key of this.exportSelected) {
      const [dateStr, meal] = key.split(':');
      const effective = this.exportMealEffectivePersons(dateStr, meal as MealType);
      if (effective <= 0) continue;
      meals.push(key);
      personCounts[key] = effective;
    }
    if (!meals.length) return;
    this.shoppingService.exportMenuplan(meals, weekTag, personCounts).subscribe(count => {
      this.exportDone = `${count} Einträge hinzugefügt.`;
      this.cdr.detectChanges();
      setTimeout(() => { this.exportDone = ''; this.showExportModal = false; this.cdr.detectChanges(); }, 2500);
    });
  }

  // ── Internal ─────────────────────────────────────────────────────────
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
      const d = new Date(from);
      d.setDate(from.getDate() + i);
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
        this.menus = { ...this.menus, [dateStr]: updated };
        this.cdr.detectChanges();
      });
    } else {
      const payload: Partial<Menu> = { date: dateStr, lunchPersons: 2, dinnerPersons: 2, ...patch };
      this.menuService.createMenu(payload).subscribe(created => {
        this.menus = { ...this.menus, [dateStr]: created };
        this.cdr.detectChanges();
      });
    }
  }

  private toIsoDate(d: Date): string { return d.toISOString().split('T')[0]; }


}
