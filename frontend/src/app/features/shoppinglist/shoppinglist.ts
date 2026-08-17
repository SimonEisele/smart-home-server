import { Component, ChangeDetectorRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShoppingItem } from './model/shoppinglist.model';
import { ShoppinglistService } from './service/shoppinglist.service';
import { RecipesService } from '../recipes/service/recipes.service';
import { MenuService } from '../menuplan/service/menuplan.service';
import { Recipe, Ingredient } from '../recipes/model/recipes.model';
import { Menu } from '../menuplan/model/menuplan.model';

type ListTab = 'all' | 'manual' | 'menuplan';
type MealType = 'breakfast' | 'lunch' | 'dinner';

const CATEGORY_ORDER = [
  'Gemüse', 'Obst', 'Fleisch & Fisch', 'Milchprodukte',
  'Getreide & Backwaren', 'Hülsenfrüchte', 'Gewürze & Kräuter',
  'Öle & Fette', 'Saucen & Konserven', 'Sonstiges',
];

interface ShoppingGroup { category: string; items: ShoppingItem[]; }
interface MenuplanGroup { weekTag: string; weekLabel: string; groups: ShoppingGroup[]; }

const CAT_MAP: Record<string, string> = {
  gemuese: 'Gemüse', obst: 'Obst', fleisch: 'Fleisch & Fisch',
  milch: 'Milchprodukte', getreide: 'Getreide & Backwaren',
  huelsenfruechte: 'Hülsenfrüchte', gewuerze: 'Gewürze & Kräuter',
  oele: 'Öle & Fette', saucen: 'Saucen & Konserven', sonstiges: 'Sonstiges',
};

@Component({
  selector: 'app-shoppinglist',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shoppinglist.html',
  styleUrl: './shoppinglist.css',
})
export class Shoppinglist implements OnInit {
  items: ShoppingItem[] = [];
  ingredients: Ingredient[] = [];
  recipes: Recipe[] = [];
  activeTab: ListTab = 'all';

  // ── Add form ──
  showAddForm = false;
  addName = '';
  addQty: number | null = null;
  addUnit = '';
  addCategory = '';
  addImageUrl = '';
  addSuggestions: Array<Partial<ShoppingItem>> = [];

  // ── Recipe picker ──
  showRecipePicker = false;
  recipeSearch = '';
  pickerRecipe: Recipe | null = null;
  pickerPersons = 2;

  // ── Menuplan export ──
  showExportModal = false;
  exportWeekStart = '';
  exportMenus: Menu[] = [];
  exportSelected = new Set<string>();
  exportLoading = false;
  exportDone = '';

  // ── Inline edit ──
  editId: string | null = null;
  editQty: number | null = null;
  editUnit = '';
  editImage = '';

  readonly DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  readonly MEALS: MealType[] = ['breakfast', 'lunch', 'dinner'];
  readonly MEAL_LABELS: Record<MealType, string> = { breakfast: 'Morgen', lunch: 'Mittag', dinner: 'Abend' };

  constructor(
    private service: ShoppinglistService,
    private recipesService: RecipesService,
    private menuService: MenuService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.reload();
    this.recipesService.getIngredients().subscribe(i => { this.ingredients = i; this.cdr.detectChanges(); });
    this.recipesService.getRecipes().subscribe(r => { this.recipes = r; this.cdr.detectChanges(); });
    this.exportWeekStart = this.getMonday(new Date());
  }

  reload(): void {
    this.service.getItems().subscribe(items => { this.items = items; this.cdr.detectChanges(); });
  }

  // ── Computed ──
  get allGroups(): ShoppingGroup[] {
    return this.buildGroups(this.consolidateItems(this.items.filter(i => !i.checked)));
  }

  get manualGroups(): ShoppingGroup[] {
    return this.buildGroups(this.consolidateItems(this.items.filter(i => !i.checked && i.listType !== 'menuplan')));
  }

  get menuplanGroups(): MenuplanGroup[] {
    const mp = this.items.filter(i => i.listType === 'menuplan');
    const byWeek = new Map<string, ShoppingItem[]>();
    for (const item of mp) {
      const tag = item.weekTag || 'Sonstiges';
      if (!byWeek.has(tag)) byWeek.set(tag, []);
      byWeek.get(tag)!.push(item);
    }
    return [...byWeek.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([t, its]) => ({ weekTag: t, weekLabel: this.weekTagLabel(t), groups: this.buildGroups(its) }));
  }

  get checkedItems(): ShoppingItem[] { return this.items.filter(i => i.checked); }
  get uncheckedCount(): number { return this.items.filter(i => !i.checked).length; }

  get filteredPickerRecipes(): Recipe[] {
    const q = this.recipeSearch.toLowerCase();
    return q ? this.recipes.filter(r => r.name.toLowerCase().includes(q)) : this.recipes;
  }

  get exportDays(): Array<{ date: Date; dateStr: string }> {
    if (!this.exportWeekStart) return [];
    const d = new Date(this.exportWeekStart);
    return Array.from({ length: 7 }, (_, i) => {
      const di = new Date(d); di.setDate(d.getDate() + i);
      return { date: di, dateStr: this.toIso(di) };
    });
  }

  get exportWeekRange(): string {
    const days = this.exportDays;
    if (!days.length) return '';
    const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
    return `${fmt(days[0].date)} – ${fmt(days[6].date)}${days[6].date.getFullYear()}`;
  }

  private buildGroups(items: ShoppingItem[]): ShoppingGroup[] {
    const map = new Map<string, ShoppingItem[]>();
    for (const item of items) {
      const c = item.category?.trim() || 'Sonstiges';
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(item);
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        const ai = CATEGORY_ORDER.indexOf(a), bi = CATEGORY_ORDER.indexOf(b);
        if (ai < 0 && bi < 0) return a.localeCompare(b);
        if (ai < 0) return 1; if (bi < 0) return -1;
        return ai - bi;
      })
      .map(([category, its]) => ({ category, items: its }));
  }

  /** Merge items with same name+unit, summing quantities. The first item's id/properties are kept for display. */
  private consolidateItems(items: ShoppingItem[]): ShoppingItem[] {
    const map = new Map<string, ShoppingItem>();
    for (const item of items) {
      const key = `${item.name.toLowerCase().trim()}::${(item.unit || '').toLowerCase().trim()}`;
      if (map.has(key)) {
        const existing = map.get(key)!;
        if (existing.quantity != null && item.quantity != null) {
          map.set(key, { ...existing, quantity: Math.round((existing.quantity + item.quantity) * 100) / 100 });
        }
      } else {
        map.set(key, item);
      }
    }
    return [...map.values()];
  }

  private weekTagLabel(tag: string): string {
    const m = tag.match(/^(\d{4})-W(\d{2})$/);
    return m ? `KW ${m[2]}, ${m[1]}` : tag;
  }

  // ── Item actions ──
  toggleChecked(item: ShoppingItem): void {
    this.service.updateItem(item.id, { checked: !item.checked })
      .subscribe(u => { this.items = this.items.map(i => i.id === u.id ? u : i); this.cdr.detectChanges(); });
  }

  remove(item: ShoppingItem): void {
    this.service.deleteItem(item.id).subscribe(() => { this.items = this.items.filter(i => i.id !== item.id); this.cdr.detectChanges(); });
  }

  clearChecked(): void {
    const ids = this.checkedItems.map(i => i.id);
    for (const id of ids) this.service.deleteItem(id).subscribe();
    this.items = this.items.filter(i => !i.checked);
  }

  // ── Add form ──
  openAdd(): void {
    this.showAddForm = !this.showAddForm;
    if (this.showAddForm) { this.showRecipePicker = false; this.showExportModal = false; }
    else this.addSuggestions = [];
  }

  cancelAdd(): void { this.showAddForm = false; this.addSuggestions = []; }

  onAddNameInput(): void {
    const q = this.addName.trim();
    if (q.length < 2) { this.addSuggestions = []; return; }
    const catMatch = this.ingredients.find(i => i.name.toLowerCase() === q.toLowerCase());
    if (catMatch) {
      if (!this.addUnit) this.addUnit = catMatch.defaultUnit || '';
      if (!this.addCategory) this.addCategory = CAT_MAP[catMatch.category] || catMatch.category;
    }
    this.service.getSuggestions(q).subscribe(s => { this.addSuggestions = s.slice(0, 6); });
  }

  applySuggestion(s: Partial<ShoppingItem>): void {
    this.addName = s.name ?? this.addName;
    this.addUnit = s.unit ?? this.addUnit;
    this.addCategory = s.category ?? this.addCategory;
    this.addImageUrl = s.imageUrl ?? this.addImageUrl;
    this.addSuggestions = [];
  }

  saveAdd(): void {
    if (!this.addName.trim()) return;
    this.service.createItem({
      name: this.addName.trim(),
      quantity: this.addQty ?? undefined,
      unit: this.addUnit.trim(),
      category: this.addCategory.trim() || 'Sonstiges',
      imageUrl: this.addImageUrl.trim(),
      listType: 'manual',
      checked: false,
    }).subscribe(item => {
      this.items = [item, ...this.items];
      this.addName = ''; this.addQty = null; this.addUnit = '';
      this.addCategory = ''; this.addImageUrl = ''; this.addSuggestions = [];
      this.showAddForm = false;
      this.cdr.detectChanges();
    });
  }

  // ── Recipe picker ──
  openRecipePicker(): void {
    this.showRecipePicker = true;
    this.showAddForm = false;
    this.showExportModal = false;
    this.pickerRecipe = null;
    this.recipeSearch = '';
    this.pickerPersons = 2;
  }

  closeRecipePicker(): void { this.showRecipePicker = false; }

  selectRecipe(r: Recipe): void {
    this.pickerRecipe = r;
    this.pickerPersons = r.baseServings ?? 2;
  }

  addRecipeToList(): void {
    if (!this.pickerRecipe) return;
    this.service.addRecipe(this.pickerRecipe.id, this.pickerPersons)
      .subscribe(() => { this.reload(); this.showRecipePicker = false; this.cdr.detectChanges(); });
  }

  // ── Menuplan export ──
  openExportModal(): void {
    this.showExportModal = true;
    this.showAddForm = false;
    this.showRecipePicker = false;
    this.exportDone = '';
    this.loadExportMenus();
  }

  closeExportModal(): void { this.showExportModal = false; }

  prevExportWeek(): void {
    const d = new Date(this.exportWeekStart);
    d.setDate(d.getDate() - 7);
    this.exportWeekStart = this.toIso(d);
    this.loadExportMenus();
  }

  nextExportWeek(): void {
    const d = new Date(this.exportWeekStart);
    d.setDate(d.getDate() + 7);
    this.exportWeekStart = this.toIso(d);
    this.loadExportMenus();
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

  toggleMeal(dateStr: string, meal: MealType): void {
    const key = `${dateStr}:${meal}`;
    const s = new Set(this.exportSelected);
    if (s.has(key)) s.delete(key); else s.add(key);
    this.exportSelected = s;
  }

  isMealSelected(dateStr: string, meal: MealType): boolean {
    return this.exportSelected.has(`${dateStr}:${meal}`);
  }

  mealRecipe(dateStr: string, meal: MealType): Recipe | null {
    const m = this.exportMenus.find(m => m.date === dateStr);
    if (!m) return null;
    if (meal === 'breakfast') return m.breakfastRecipe ?? null;
    if (meal === 'lunch') return m.lunchRecipe ?? null;
    return m.dinnerRecipe ?? null;
  }

  mealPersons(dateStr: string, meal: MealType): number {
    const m = this.exportMenus.find(m => m.date === dateStr);
    if (!m) return 0;
    if (meal === 'breakfast') return m.breakfastPersons ?? 0;
    if (meal === 'lunch') return m.lunchPersons ?? 0;
    return m.dinnerPersons ?? 0;
  }

  /** How many people will eat this meal's leftovers (from other meals referencing it) */
  mealLeftoverPersons(dateStr: string, meal: MealType): number {
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

  mealEffectivePersons(dateStr: string, meal: MealType): number {
    return this.mealPersons(dateStr, meal) + this.mealLeftoverPersons(dateStr, meal);
  }

  doExport(): void {
    if (!this.exportSelected.size) return;
    const d = new Date(this.exportWeekStart);
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const startOfYear = jan4.getTime() - ((jan4.getDay() + 6) % 7) * 86400000;
    const week = Math.floor((d.getTime() - startOfYear) / (7 * 86400000)) + 1;
    const weekTag = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
    const meals: string[] = [];
    const personCounts: Record<string, number> = {};
    for (const key of this.exportSelected) {
      const [dateStr, meal] = key.split(':');
      const effective = this.mealEffectivePersons(dateStr, meal as MealType);
      if (effective <= 0) continue;
      meals.push(key);
      personCounts[key] = effective;
    }
    if (!meals.length) return;
    this.service.exportMenuplan(meals, weekTag, personCounts).subscribe(count => {
      this.exportDone = `${count} Einträge hinzugefügt.`;
      this.reload();
      this.cdr.detectChanges();
      setTimeout(() => { this.exportDone = ''; this.showExportModal = false; this.cdr.detectChanges(); }, 2500);
    });
  }

  // ── Inline edit ──
  startEdit(item: ShoppingItem): void {
    if (this.editId === item.id) { this.editId = null; return; }
    this.editId = item.id;
    this.editQty = item.quantity ?? null;
    this.editUnit = item.unit ?? '';
    this.editImage = item.imageUrl ?? '';
  }

  saveEdit(): void {
    if (!this.editId) return;
    this.service.updateItem(this.editId, {
      quantity: this.editQty ?? undefined,
      unit: this.editUnit,
      imageUrl: this.editImage,
    }).subscribe(u => {
      this.items = this.items.map(i => i.id === u.id ? u : i);
      this.editId = null;
      this.cdr.detectChanges();
    });
  }

  cancelEdit(): void { this.editId = null; }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.editId) this.cancelEdit();
    else if (this.showRecipePicker) this.closeRecipePicker();
    else if (this.showExportModal) this.closeExportModal();
    else if (this.showAddForm) this.cancelAdd();
  }

  private getMonday(d: Date): string {
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    return this.toIso(mon);
  }

  private toIso(d: Date): string { return d.toISOString().split('T')[0]; }
}

