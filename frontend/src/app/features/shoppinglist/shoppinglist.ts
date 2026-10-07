import { DialogDirective } from '../../shared/directives/dialog.directive';
import { RouterLink } from '@angular/router';
import {
  Component,
  ChangeDetectorRef,
  HostListener,
  OnInit,
  DestroyRef,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ShoppingItem } from './model/shoppinglist.model';
import { ShoppinglistService } from './service/shoppinglist.service';
import { RecipesService } from '../recipes/service/recipes.service';
import { Recipe, Ingredient } from '../recipes/model/recipes.model';

type ListTab = 'all' | 'manual' | 'menuplan';
interface ShoppingGroup {
  category: string;
  items: ShoppingItem[];
}
interface MenuplanGroup {
  weekTag: string;
  weekLabel: string;
  groups: ShoppingGroup[];
}
interface PurchaseSummary {
  name: string;
  unit: string;
  quantity: number | null;
  incomplete: boolean;
  count: number;
}
const CATEGORY_ORDER = [
  'Gemüse',
  'Obst',
  'Fleisch & Fisch',
  'Milchprodukte',
  'Getreide & Backwaren',
  'Hülsenfrüchte',
  'Gewürze & Kräuter',
  'Öle & Fette',
  'Saucen & Konserven',
  'Sonstiges',
];
const CAT_MAP: Record<string, string> = Object.fromEntries(
  [
    'gemuese',
    'obst',
    'fleisch',
    'milch',
    'getreide',
    'huelsenfruechte',
    'gewuerze',
    'oele',
    'saucen',
    'sonstiges',
  ].map((key, index) => [key, CATEGORY_ORDER[index]]),
);

@Component({
  selector: 'app-shoppinglist',
  standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule, RouterLink],
  templateUrl: './shoppinglist.html',
  styleUrl: './shoppinglist.css',
})
export class Shoppinglist implements OnInit {
  private destroyRef = inject(DestroyRef);
  items: ShoppingItem[] = [];
  ingredients: Ingredient[] = [];
  recipes: Recipe[] = [];
  categories = CATEGORY_ORDER;
  activeTab: ListTab = 'all';
  search = '';
  weekFilter = '';
  loading = false;
  loadFailed = false;
  error = '';
  busy = false;
  pending = new Set<string>();
  confirmClear = false;
  showAddForm = false;
  addName = '';
  addQty: number | null = null;
  addUnit = '';
  addCategory = '';
  addImageUrl = '';
  addIncomplete = false;
  addSuggestions: Array<Partial<ShoppingItem>> = [];
  showRecipePicker = false;
  recipeSearch = '';
  pickerRecipe: Recipe | null = null;
  // Desired total portions/pieces, not people. API maps this to one batch.
  pickerServings = 2;
  editId: string | null = null;
  private suggestionRevision = 0;

  constructor(
    private service: ShoppinglistService,
    private recipesService: RecipesService,
    private cdr: ChangeDetectorRef,
  ) {}
  ngOnInit(): void {
    this.reload();
    this.recipesService
      .getIngredients()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (i) => {
          this.ingredients = i.filter((i) => !i.archived);
          this.cdr.markForCheck();
        },
        error: () => {
          this.error =
            'Zutatenkatalog nicht verfügbar. Freie Artikel können weiterhin hinzugefügt werden.';
          this.cdr.markForCheck();
        },
      });
    this.recipesService
      .getRecipes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.recipes = r;
          this.cdr.markForCheck();
        },
        error: () => {
          this.error = 'Rezepte konnten nicht geladen werden. Bitte die Seite erneut laden.';
          this.cdr.markForCheck();
        },
      });
  }
  reload(): void {
    if (this.loading) return;
    this.loading = true;
    this.loadFailed = false;
    this.error = '';
    this.service
      .getItems()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items = items;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.loadFailed = true;
          this.fail('Die Einkaufsliste konnte nicht geladen werden.');
        },
      });
  }
  private fail(message: string): void {
    this.error = message;
    this.busy = false;
    this.cdr.markForCheck();
  }
  private get filteredItems(): ShoppingItem[] {
    const q = this.search.trim().toLocaleLowerCase('de');
    return this.items.filter(
      (i) =>
        (this.activeTab === 'all' ||
          (this.activeTab === 'menuplan'
            ? i.listType === 'menuplan'
            : i.listType !== 'menuplan')) &&
        (!this.weekFilter || i.weekTag === this.weekFilter) &&
        (!q ||
          `${i.name} ${i.category ?? ''} ${i.suggestion ?? ''}`
            .toLocaleLowerCase('de')
            .includes(q)),
    );
  }
  get allGroups(): ShoppingGroup[] {
    return this.buildGroups(this.filteredItems.filter((i) => !i.checked));
  }
  get manualGroups(): ShoppingGroup[] {
    return this.buildGroups(
      this.filteredItems.filter((i) => !i.checked && i.listType !== 'menuplan'),
    );
  }
  get menuplanGroups(): MenuplanGroup[] {
    const weeks = new Map<string, ShoppingItem[]>();
    for (const item of this.filteredItems.filter((i) => !i.checked && i.listType === 'menuplan')) {
      const tag = item.weekTag || 'Ohne Woche';
      weeks.set(tag, [...(weeks.get(tag) ?? []), item]);
    }
    return [...weeks]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([weekTag, items]) => ({
        weekTag,
        weekLabel: this.weekTagLabel(weekTag),
        groups: this.buildGroups(items),
      }));
  }
  get weeks(): string[] {
    return [
      ...new Set(
        this.items
          .filter((i) => i.listType === 'menuplan')
          .map((i) => i.weekTag || '')
          .filter(Boolean),
      ),
    ]
      .sort()
      .reverse();
  }
  get checkedItems(): ShoppingItem[] {
    return this.filteredItems.filter((i) => i.checked);
  }
  get uncheckedCount(): number {
    return this.filteredItems.filter((i) => !i.checked).length;
  }
  get completedCount(): number {
    return this.checkedItems.length;
  }
  get progress(): number {
    const total = this.uncheckedCount + this.completedCount;
    return total ? Math.round((this.completedCount / total) * 100) : 0;
  }
  get purchaseSummary(): PurchaseSummary[] {
    const totals = new Map<string, PurchaseSummary>();
    for (const item of this.filteredItems.filter((i) => !i.checked)) {
      const unit = (item.unit ?? '').trim(),
        key = `${item.name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de')}\u0000${unit}`;
      const found = totals.get(key);
      if (found) {
        found.count++;
        found.incomplete ||= item.quantity == null || !!item.quantityIncomplete;
        if (item.quantity != null) found.quantity = (found.quantity ?? 0) + item.quantity;
      } else
        totals.set(key, {
          name: item.name,
          unit,
          quantity: item.quantity ?? null,
          incomplete: item.quantity == null || !!item.quantityIncomplete,
          count: 1,
        });
    }
    return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }
  get filteredPickerRecipes(): Recipe[] {
    const q = this.recipeSearch.trim().toLowerCase();
    return this.recipes.filter((r) => !q || r.name.toLowerCase().includes(q));
  }
  get validPickerQuantity(): boolean {
    return Number.isFinite(this.pickerServings) && this.pickerServings > 0;
  }
  get pickerPreview(): Array<{ name: string; quantity: number | null; unit: string }> {
    const recipe = this.pickerRecipe;
    if (!recipe || !this.validPickerQuantity) return [];
    const scale = this.pickerServings / (recipe.baseServings || 1);
    return recipe.ingredients.map((i) => ({
      name: i.name,
      quantity: i.quantityPerPerson == null ? null : i.quantityPerPerson * scale,
      unit: i.unit ?? '',
    }));
  }
  private buildGroups(items: ShoppingItem[]): ShoppingGroup[] {
    const groups = new Map<string, ShoppingItem[]>();
    for (const i of items) {
      const cat = i.category?.trim() || 'Sonstiges';
      groups.set(cat, [...(groups.get(cat) ?? []), i]);
    }
    return [...groups]
      .sort(([a], [b]) => {
        const ai = CATEGORY_ORDER.indexOf(a),
          bi = CATEGORY_ORDER.indexOf(b);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b, 'de');
      })
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.name.localeCompare(b.name, 'de')),
      }));
  }
  weekTagLabel(tag: string): string {
    const m = tag.match(/^(\d{4})-W(\d{2})$/);
    return m ? `KW ${Number(m[2])} · ${m[1]}` : tag;
  }
  quantityLabel(quantity: number | null | undefined, unit = ''): string {
    return quantity == null
      ? 'Nach Bedarf'
      : `${new Intl.NumberFormat('de-CH', { maximumFractionDigits: 3 }).format(quantity)}${unit ? ' ' + unit : ''}`;
  }
  sourceLabel(item: ShoppingItem): string {
    return item.listType === 'menuplan'
      ? `Menüplan · ${this.weekTagLabel(item.weekTag || 'Ohne Woche')}`
      : item.suggestion
        ? 'Rezept'
        : 'Manuell';
  }
  private validQuantity(value: number | null): boolean {
    return value === null || (Number.isFinite(value) && value >= 0);
  }
  toggleChecked(item: ShoppingItem): void {
    if (this.pending.has(item.id) || this.busy) return;
    this.pending.add(item.id);
    this.error = '';
    this.service
      .updateItem(item.id, { checked: !item.checked })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (u) => {
          this.items = this.items.map((i) => (i.id === u.id ? u : i));
          this.pending.delete(item.id);
          this.cdr.markForCheck();
        },
        error: () => {
          this.pending.delete(item.id);
          this.fail('Abhaken fehlgeschlagen. Bitte erneut versuchen.');
        },
      });
  }
  remove(item: ShoppingItem): void {
    if (this.pending.has(item.id) || this.busy) return;
    this.pending.add(item.id);
    this.error = '';
    this.service
      .deleteItem(item.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.items = this.items.filter((i) => i.id !== item.id);
          this.pending.delete(item.id);
          this.cdr.markForCheck();
        },
        error: () => {
          this.pending.delete(item.id);
          this.fail('Der Artikel konnte nicht entfernt werden.');
        },
      });
  }
  clearChecked(): void {
    if (this.busy || this.pending.size || !this.checkedItems.length) return;
    this.busy = true;
    this.error = '';
    this.service
      .clearChecked(this.checkedItems.map((i) => i.id))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ids) => {
          this.items = this.items.filter((i) => !ids.includes(i.id));
          this.busy = false;
          this.confirmClear = false;
          this.cdr.markForCheck();
        },
        error: () =>
          this.fail(
            'Die abgehakten Artikel konnten nicht gelöscht werden. Es wurde nichts ausgeblendet.',
          ),
      });
  }
  openAdd(): void {
    if (this.busy || this.loadFailed || this.loading) return;
    this.addName = '';
    this.addQty = null;
    this.addUnit = '';
    this.addCategory = '';
    this.addImageUrl = '';
    this.addIncomplete = false;
    this.addSuggestions = [];
    this.suggestionRevision++;
    this.showAddForm = true;
    this.showRecipePicker = false;
    this.editId = null;
    this.error = '';
  }
  cancelAdd(): void {
    if (this.busy) return;
    this.showAddForm = false;
    this.editId = null;
    this.addSuggestions = [];
    this.suggestionRevision++;
  }
  onAddNameInput(): void {
    const revision = ++this.suggestionRevision,
      q = this.addName.trim();
    this.addSuggestions = [];
    if (q.length < 2) return;
    this.service
      .getSuggestions(q)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          if (revision === this.suggestionRevision && this.showAddForm) {
            this.addSuggestions = s.slice(0, 6);
            this.cdr.markForCheck();
          }
        },
        error: () => {},
      });
  }
  applySuggestion(s: Partial<ShoppingItem>): void {
    this.addName = s.name ?? this.addName;
    this.addUnit = s.unit ?? this.addUnit;
    this.addCategory = s.category ?? this.addCategory;
    this.addImageUrl = s.imageUrl ?? this.addImageUrl;
    this.addSuggestions = [];
    this.suggestionRevision++;
  }
  applyCatalog(): void {
    const entry = this.ingredients.find(
      (i) => i.name.toLowerCase() === this.addName.trim().toLowerCase(),
    );
    if (entry) {
      if (!this.addUnit) this.addUnit = entry.defaultUnit || '';
      if (!this.addCategory) this.addCategory = CAT_MAP[entry.category] || entry.category;
    }
  }
  saveAdd(): void {
    if (this.busy || !this.addName.trim()) return;
    if (!this.validQuantity(this.addQty)) {
      this.fail('Bitte eine Menge ab 0 eingeben oder das Feld leer lassen.');
      return;
    }
    this.applyCatalog();
    this.busy = true;
    this.error = '';
    const data = {
      name: this.addName.trim(),
      quantity: this.addQty,
      unit: this.addUnit.trim(),
      category: this.addCategory.trim() || 'Sonstiges',
      imageUrl: this.addImageUrl.trim(),
      quantityIncomplete: this.addQty == null || this.addIncomplete,
    };
    const request = this.editId
      ? this.service.updateItem(this.editId, data)
      : this.service.createItem({ ...data, listType: 'manual', checked: false });
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (item) => {
        this.items = this.editId
          ? this.items.map((i) => (i.id === item.id ? item : i))
          : [item, ...this.items];
        this.busy = false;
        this.showAddForm = false;
        this.editId = null;
        this.addName = '';
        this.addQty = null;
        this.addUnit = '';
        this.addCategory = '';
        this.addImageUrl = '';
        this.addIncomplete = false;
        this.addSuggestions = [];
        this.suggestionRevision++;
        this.cdr.markForCheck();
      },
      error: () =>
        this.fail(
          'Speichern fehlgeschlagen. Bitte Eingaben und Bild-URL prüfen und erneut versuchen.',
        ),
    });
  }
  openRecipePicker(): void {
    if (this.busy || this.loading || this.loadFailed) return;
    this.showRecipePicker = true;
    this.showAddForm = false;
    this.editId = null;
    this.pickerRecipe = null;
    this.recipeSearch = '';
    this.error = '';
  }
  closeRecipePicker(): void {
    if (!this.busy) this.showRecipePicker = false;
  }
  selectRecipe(recipe: Recipe): void {
    if (this.busy) return;
    this.pickerRecipe = recipe;
    this.pickerServings = recipe.baseServings ?? 4;
  }
  addRecipeToList(): void {
    if (this.busy || !this.pickerRecipe) return;
    if (!Number.isFinite(this.pickerServings) || this.pickerServings <= 0) {
      this.fail('Bitte eine positive Gesamtmenge angeben.');
      return;
    }
    this.busy = true;
    this.error = '';
    this.service
      .addRecipe(this.pickerRecipe.id, 1, this.pickerServings)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy = false;
          this.showRecipePicker = false;
          this.reload();
        },
        error: () => this.fail('Rezept konnte nicht übernommen werden. Bitte erneut versuchen.'),
      });
  }
  startEdit(item: ShoppingItem): void {
    if (this.busy || this.pending.has(item.id)) return;
    this.openAdd();
    this.editId = item.id;
    this.addName = item.name;
    this.addQty = item.quantity ?? null;
    this.addUnit = item.unit ?? '';
    this.addCategory = item.category ?? '';
    this.addImageUrl = item.imageUrl ?? '';
    this.addIncomplete = !!item.quantityIncomplete;
  }
  @HostListener('document:keydown.escape') onEscape(): void {
    if (this.busy) return;
    this.confirmClear = false;
    this.cancelAdd();
    this.closeRecipePicker();
  }
}
