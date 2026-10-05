import { DialogDirective } from '../../shared/directives/dialog.directive';
import { RouterLink } from '@angular/router';
import { Component, ChangeDetectorRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShoppingItem } from './model/shoppinglist.model';
import { ShoppinglistService } from './service/shoppinglist.service';
import { RecipesService } from '../recipes/service/recipes.service';
import { Recipe, Ingredient } from '../recipes/model/recipes.model';

type ListTab = 'all' | 'manual' | 'menuplan';

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
  imports: [DialogDirective, CommonModule, FormsModule, RouterLink],
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

  // ── Inline edit ──
  editId: string | null = null;
  editQty: number | null = null;
  editUnit = '';
  editImage = '';

  constructor(
    private service: ShoppinglistService,
    private recipesService: RecipesService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.reload();
    this.recipesService.getIngredients().subscribe(i => { this.ingredients = i; this.cdr.detectChanges(); });
    this.recipesService.getRecipes().subscribe(r => { this.recipes = r; this.cdr.detectChanges(); });
  }

  reload(): void {
    this.service.getItems().subscribe(items => { this.items = items; this.cdr.detectChanges(); });
  }

  // ── Computed ──
  get allGroups(): ShoppingGroup[] {
    return this.buildGroups(this.items.filter(i => !i.checked));
  }

  get manualGroups(): ShoppingGroup[] {
    return this.buildGroups(this.items.filter(i => !i.checked && i.listType !== 'menuplan'));
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
    for (const id of ids) this.service.deleteItem(id).subscribe({ next: () => {
      this.items = this.items.filter(item => item.id !== id); this.cdr.markForCheck();
    }, error: () => { this.cdr.markForCheck(); } });
  }

  // ── Add form ──
  openAdd(): void {
    this.showAddForm = !this.showAddForm;
    if (this.showAddForm) { this.showRecipePicker = false; }
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
    else if (this.showAddForm) this.cancelAdd();
  }

}
