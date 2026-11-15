import { filtersChanged, loadFilters, saveFilters } from '../../../shared/utils/filter-memory';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, inject } from '@angular/core';
import { RecipeCookService } from '../../../shared/services/recipe-cook.service';
import { INGREDIENT_UNITS, INGREDIENT_CATEGORIES } from '../../ingredients/model/ingredient.model';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import {
  Component,
  HostListener,
  OnInit,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ingredientKey } from '../../ingredients/model/ingredient.model';
import {
  Ingredient,
  Recipe,
  RecipeIngredient,
  RecipeSection,
  RecipeSideNote,
  RecipeStep,
} from '../model/recipes.model';
import { RecipesService } from '../service/recipes.service';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { uuid } from '../../../shared/utils/uuid';
import { parseIngredientList, parseStepList } from '../utils/recipe-import';

type RecipeForm = Partial<Recipe> & {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  sections: RecipeSection[];
  sideNotes: RecipeSideNote[];
};

@Component({
  selector: 'app-recipes',
  standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule],
  templateUrl: './recipes.page.html',
  styleUrls: ['./recipes.page.css', './recipes.editor.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipesPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly cookService = inject(RecipeCookService);
  readonly ingredientUnits = INGREDIENT_UNITS;
  readonly recipeCategories = [
    { value: 'mahlzeit', label: 'Mahlzeit' },
    { value: 'dessert', label: 'Dessert' },
    { value: 'backen', label: 'Backen' },
    { value: 'snack', label: 'Snack' },
    { value: 'beilage', label: 'Beilage' },
    { value: 'sonstiges', label: 'Sonstiges' },
  ];
  private static readonly DEFAULT_FILTERS = { search: '', categoryFilter: '', sort: 'name' };
  categoryFilter = '';
  sort = 'name';
  editorTab: 'details' | 'ingredients' | 'steps' = 'details';
  showDeleteConfirm = false;
  catalogError = '';
  ingredientSaving = false;
  recipes: Recipe[] = [];
  ingredientCatalog: Ingredient[] = [];
  search = '';
  showModal = false;
  saving = false;
  formError = '';
  loading = false;
  loadError = '';
  modalMode: 'add' | 'edit' = 'add';
  form: RecipeForm = this.emptyForm();
  ingredientPrevNames: string[] = [];
  /** Catalog choice for a typed name; `archived` is set when it exists but is archived. */
  newIngredientPrompt: {
    rowId?: string; name: string; category: string; defaultUnit: string; archived?: Ingredient; error?: string;
  } | null = null;
  /** Short confirmation after an ingredient was linked to the catalog. */
  catalogNotice = '';
  /** Rows whose unit was filled from the catalog (and may be replaced when the name changes). */
  private autoUnitIds = new Set<string>();
  /** "Zutat hinzufügen" field per step: a recipe ingredient or a new one, with an optional amount. */
  stepDrafts: Array<{ name: string; quantity?: number | null; unit: string }> = [];
  /** Archived entries: not offered, but recognised so the prompt does not claim they are missing. */
  archivedCatalog: Ingredient[] = [];
  /** Serialized form at the time the editor opened; used to warn before discarding edits. */
  private snapshot = '';
  showDiscardConfirm = false;
  importMode: 'ingredients' | 'steps' | null = null;
  importText = '';

  readonly INGREDIENT_CATEGORIES = INGREDIENT_CATEGORIES;

  constructor(
    private service: RecipesService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    Object.assign(this, loadFilters('recipes', RecipesPage.DEFAULT_FILTERS));
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.loadError = '';
    this.service
      .getRecipes()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (recipes) => {
          this.recipes = recipes;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadError = 'Rezepte konnten nicht geladen werden.';
          this.cdr.markForCheck();
        },
      });
    this.catalogError = '';
    this.service
      .getIngredients()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (i) => {
          this.ingredientCatalog = i.filter((ingredient) => !ingredient.archived);
          this.archivedCatalog = i.filter((ingredient) => ingredient.archived);
          this.cdr.markForCheck();
        },
        error: () => {
          this.catalogError =
            'Der Zutatenkatalog ist momentan nicht verfügbar. Freie Zutaten können weiterhin erfasst werden.';
          this.cdr.markForCheck();
        },
      });
  }

  trackByRecipe(_i: number, r: Recipe) {
    return r.id;
  }

  get filtered(): Recipe[] {
    const q = ingredientKey(this.search);
    const matches = this.recipes.filter(
      (r) =>
        (!this.categoryFilter || r.category === this.categoryFilter) &&
        (!q ||
          ingredientKey(
            `${r.name} ${r.description ?? ''} ${r.ingredients.map((i) => i.name).join(' ')}`,
          ).includes(q)),
    );
    return matches.sort((a, b) =>
      this.sort === 'duration'
        ? (a.durationMinutes ?? Infinity) - (b.durationMinutes ?? Infinity) ||
          a.name.localeCompare(b.name, 'de')
        : this.sort === 'recent'
          ? (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
          : a.name.localeCompare(b.name, 'de'),
    );
  }
  categoryLabel(value?: string): string {
    return this.recipeCategories.find((c) => c.value === value)?.label ?? 'Sonstiges';
  }
  resetFilters(): void {
    this.search = '';
    this.categoryFilter = '';
    this.sort = 'name';
    this.persistFilters();
  }

  persistFilters(): void {
    saveFilters('recipes', { search: this.search, categoryFilter: this.categoryFilter, sort: this.sort });
  }

  get filtersActive(): boolean {
    return filtersChanged({ search: this.search, categoryFilter: this.categoryFilter, sort: this.sort },
      RecipesPage.DEFAULT_FILTERS);
  }

  /** Categories that have recipes (plus the selected one), each with its count under the current search. */
  get categoryOptions(): Array<{ value: string; label: string; count: number }> {
    const q = ingredientKey(this.search);
    const found = this.recipes.filter(r => !q || ingredientKey(
      `${r.name} ${r.description ?? ''} ${r.ingredients.map(i => i.name).join(' ')}`).includes(q));
    return this.recipeCategories
      .map(c => ({ ...c, count: found.filter(r => (r.category ?? 'sonstiges') === c.value).length }))
      .filter(c => c.count > 0 || c.value === this.categoryFilter);
  }

  get searchCount(): number { return this.categoryOptions.reduce((n, c) => n + c.count, 0); }

  formatDuration(mins?: number): string {
    if (mins == null) return '';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}min` : `${h}h`;
  }

  // ── Section handlers ─────────────────────────────────────────────────────
  addSection(): void {
    this.form.sections = [
      ...this.form.sections,
      { id: Math.max(0, ...this.form.sections.map((s) => s.id)) + 1, title: '' },
    ];
  }

  removeSection(id: number): void {
    this.form.sections = this.form.sections.filter((s) => s.id !== id);
    this.form.ingredients = this.form.ingredients.map((i) =>
      i.sectionId === id ? { ...i, sectionId: undefined } : i,
    );
    this.form.steps = this.form.steps.map((s) =>
      s.sectionId === id ? { ...s, sectionId: undefined } : s,
    );
  }

  // ── Side note handlers ──────────────────────────────────────────────────
  addSideNote(): void {
    this.form.sideNotes = [...this.form.sideNotes, { label: '', value: '' }];
  }
  removeSideNote(i: number): void {
    this.form.sideNotes = this.form.sideNotes.filter((_, idx) => idx !== i);
  }

  // ── Recipe ingredient handlers ──────────────────────────────────────────
  private catalogMatch(name: string | undefined): Ingredient | undefined {
    const key = ingredientKey(name ?? '');
    return key ? this.ingredientCatalog.find((i) => ingredientKey(i.name) === key) : undefined;
  }

  /** Links a row to the catalog entry with the same name and fills its unit (only while it is empty or auto-filled). */
  private applyCatalog(row: RecipeIngredient, match: Ingredient | undefined): void {
    row.ingredientId = match?.id;
    const auto = !!row.id && this.autoUnitIds.has(row.id);
    if (match && (!row.unit || auto)) {
      row.unit = match.defaultUnit ?? '';
      if (row.id && row.unit) this.autoUnitIds.add(row.id);
    } else if (!match && auto) {
      // "Zucker" filled g; typing on to "Zuckerwatte" must not keep it.
      row.unit = '';
      this.autoUnitIds.delete(row.id!);
    }
  }

  /** While typing: link and fill the unit as soon as the name is exactly a catalog entry. */
  onIngredientNameInput(index: number): void {
    const row = this.form.ingredients[index];
    this.applyCatalog(row, this.catalogMatch(row.name));
    if (this.newIngredientPrompt?.rowId === row.id) this.newIngredientPrompt = null;
  }

  /** Leaving the name field: use the catalog spelling, rename the step links and offer to add new names. */
  onIngredientNameChange(index: number): void {
    const row = this.form.ingredients[index];
    const name = (row.name ?? '').trim().replace(/\s+/g, ' ');
    const identity = this.catalogMatch(name);
    row.name = identity?.name ?? name;
    this.applyCatalog(row, identity);
    this.ingredientPrevNames[index] = row.name;
    this.form.ingredients = [...this.form.ingredients];
    this.form.steps = this.form.steps.map((s) => ({
      ...s,
      ingredients: s.ingredients.map((i) =>
        i.recipeIngredientId === row.id ? { ...i, name: row.name, ingredientId: identity?.id } : i,
      ),
    }));
    // New names only get a badge; the catalog panel opens when it is tapped (no interruption while typing a list).
    if (identity && this.newIngredientPrompt?.rowId === row.id) this.newIngredientPrompt = null;
    this.cdr.detectChanges();
  }

  /**
   * A catalog entry the typed name probably means: the part before a comma or bracket, or a simple
   * singular/plural form ("Eier" → "Ei", "Zwiebeln, gehackt" → "Zwiebel"). Same rules as the assistant.
   */
  catalogSuggestion(name: string | undefined): Ingredient | undefined {
    const endings = ['n', 'en', 'e', 's', 'er', 'nen'];
    const variants = (key: string) => {
      const found = new Set([key]);
      for (const end of endings) {
        found.add(key + end);
        if (key.endsWith(end) && key.length - end.length >= 3) found.add(key.slice(0, -end.length));
      }
      return found;
    };
    for (const candidate of [name ?? '', (name ?? '').split(/[,(;]/)[0]]) {
      const key = ingredientKey(candidate);
      if (!key) continue;
      const wanted = variants(key);
      const hits = this.ingredientCatalog.filter((i) => [...variants(ingredientKey(i.name))].some((v) => wanted.has(v)));
      if (hits.length === 1) return hits[0];
      const exact = hits.find((i) => ingredientKey(i.name) === key);
      if (exact) return exact;
    }
    return undefined;
  }

  /** Takes the suggested catalog entry for a row (e.g. "Eier" → "Ei"). */
  useSuggestion(index: number): void {
    const row = this.form.ingredients[index];
    const match = this.catalogSuggestion(row.name);
    if (!match) return;
    row.name = match.name;
    this.onIngredientNameChange(index);
    this.newIngredientPrompt = null;
  }

  /** A unit typed by hand is never replaced by the catalog default. */
  autoUnitClear(row: RecipeIngredient): void {
    if (row.id) this.autoUnitIds.delete(row.id);
  }

  focusLastIngredient(): void {
    this.focusField(`Zutat ${this.form.ingredients.length} Name`);
  }

  /** Catalog state of a row, shown as a small badge. */
  catalogState(row: RecipeIngredient): 'linked' | 'archived' | 'similar' | 'new' | 'empty' {
    if (!row.name?.trim()) return 'empty';
    if (this.catalogMatch(row.name)) return 'linked';
    if (this.archivedCatalog.some((i) => ingredientKey(i.name) === ingredientKey(row.name))) return 'archived';
    return this.catalogSuggestion(row.name) ? 'similar' : 'new';
  }

  /** Opens (or closes) the "add to catalog" panel below a row. */
  toggleCatalogPrompt(index: number): void {
    const row = this.form.ingredients[index];
    this.newIngredientPrompt = this.newIngredientPrompt?.rowId === row.id ? null : this.catalogPrompt(row.name.trim(), index);
  }

  /** Step numbers that use a recipe ingredient. */
  stepsUsing(row: RecipeIngredient): number[] {
    return this.form.steps.flatMap((step, i) =>
      step.ingredients.some((link) => link.recipeIngredientId === row.id) ? [i + 1] : []);
  }

  addIngredient(sectionId?: number): void {
    this.form.ingredients = [
      ...this.form.ingredients,
      { id: uuid(), name: '', quantityPerPerson: undefined, unit: '', sectionId },
    ];
    this.ingredientPrevNames = [...this.ingredientPrevNames, ''];
  }

  removeIngredient(index: number): void {
    const removed = this.form.ingredients[index];
    if (this.newIngredientPrompt?.rowId === removed.id) this.newIngredientPrompt = null;
    this.form.ingredients = this.form.ingredients.filter((_, i) => i !== index);
    this.ingredientPrevNames = this.ingredientPrevNames.filter((_, i) => i !== index);
    this.form.steps = this.form.steps.map((step) => ({
      ...step,
      ingredients: step.ingredients.filter((link) => link.recipeIngredientId !== removed.id),
    }));
  }

  onRecipeIngredientQtyUnitChange(_index: number): void {
    // Step-specific amounts stay independent from the recipe total.
    this.form.ingredients = [...this.form.ingredients];
  }

  moveIngredient(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.form.ingredients.length) return;
    const ingredients = [...this.form.ingredients];
    const names = [...this.ingredientPrevNames];
    [ingredients[index], ingredients[target]] = [ingredients[target], ingredients[index]];
    [names[index], names[target]] = [names[target], names[index]];
    this.form.ingredients = ingredients;
    this.ingredientPrevNames = names;
  }

  /** Enter in an ingredient row starts the next row, so a list can be typed without the mouse. */
  onIngredientEnter(index: number, event: Event): void {
    event.preventDefault();
    const next = index + 1;
    if (next >= this.form.ingredients.length || this.form.ingredients[next].name.trim()) {
      const ingredients = [...this.form.ingredients];
      ingredients.splice(next, 0, {
        id: uuid(),
        name: '',
        quantityPerPerson: undefined,
        unit: '',
        sectionId: this.form.ingredients[index]?.sectionId,
      });
      this.form.ingredients = ingredients;
      const names = [...this.ingredientPrevNames];
      names.splice(next, 0, '');
      this.ingredientPrevNames = names;
    }
    this.focusField(`Zutat ${next + 1} Name`);
  }

  openImport(mode: 'ingredients' | 'steps'): void {
    this.importMode = this.importMode === mode ? null : mode;
    this.importText = '';
  }

  get importPreviewCount(): number {
    if (!this.importMode) return 0;
    return this.importMode === 'ingredients'
      ? parseIngredientList(this.importText).length
      : parseStepList(this.importText).length;
  }

  /** Adds pasted lines like "200 g Mehl" or numbered steps to the form. */
  applyImport(): void {
    if (this.importMode === 'ingredients') {
      const rows = parseIngredientList(this.importText).map((item) => {
        const match = this.ingredientCatalog.find(
          (i) => ingredientKey(i.name) === ingredientKey(item.name),
        );
        return {
          id: uuid(),
          name: match?.name ?? item.name,
          ingredientId: match?.id,
          quantityPerPerson: item.quantity ?? undefined,
          // "Salz" without an amount stays without a unit instead of getting "TL".
          unit: item.unit || (item.quantity != null ? match?.defaultUnit : '') || '',
        } as RecipeIngredient;
      });
      const kept = this.form.ingredients.filter((i) => i.name.trim());
      this.form.ingredients = [...kept, ...rows];
      this.ingredientPrevNames = this.form.ingredients.map((i) => i.name);
    } else if (this.importMode === 'steps') {
      const kept = this.form.steps.filter((s) => s.description.trim());
      const added = parseStepList(this.importText).map((description) => ({
        order: 0,
        description,
        ingredients: [],
      }));
      this.form.steps = [...kept, ...added].map((step, i) => ({ ...step, order: i + 1 }));
    }
    this.importMode = null;
    this.importText = '';
  }

  get unlinkedIngredientNames(): string[] {
    const known = new Set(this.ingredientCatalog.map((i) => ingredientKey(i.name)));
    return [
      ...new Set(
        this.form.ingredients
          .map((i) => i.name.trim())
          .filter((name) => name && !known.has(ingredientKey(name))),
      ),
    ];
  }

  addStep(sectionId?: number): void {
    this.form.steps = [
      ...this.form.steps,
      { order: this.form.steps.length + 1, description: '', ingredients: [], sectionId },
    ];
    this.focusField(`Schritt ${this.form.steps.length} Beschreibung`);
  }

  removeStep(i: number): void {
    this.form.steps = this.form.steps
      .filter((_, idx) => idx !== i)
      .map((s, idx) => ({ ...s, order: idx + 1 }));
    this.stepDrafts = this.stepDrafts.filter((_, idx) => idx !== i);
  }

  draft(stepIdx: number): { name: string; quantity?: number | null; unit: string } {
    return (this.stepDrafts[stepIdx] ??= { name: '', quantity: undefined, unit: '' });
  }

  /** Recipe ingredients with a name that this step does not use yet (offered as one-tap chips). */
  availableForStep(step: RecipeStep): RecipeIngredient[] {
    return this.form.ingredients.filter(
      (row) => row.name.trim() && !step.ingredients.some((link) => link.recipeIngredientId === row.id),
    );
  }

  /** Names for the step field: the recipe's ingredients first, then the catalog. */
  get stepIngredientOptions(): string[] {
    const seen = new Set<string>();
    return [...this.form.ingredients.map((i) => i.name), ...this.ingredientCatalog.map((i) => i.name)].filter((name) => {
      const key = ingredientKey(name ?? '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Adds an ingredient to a step by name. An ingredient the recipe already has is linked (a typed amount
   * becomes the amount for this step); a new one is added to the ingredient list with that amount.
   */
  addStepIngredientByName(stepIdx: number): void {
    const draft = this.draft(stepIdx);
    const name = draft.name.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const step = this.form.steps[stepIdx];
    const quantity = draft.quantity != null && Number.isFinite(draft.quantity) && draft.quantity >= 0 ? draft.quantity : undefined;
    let row = this.form.ingredients.find((i) => ingredientKey(i.name) === ingredientKey(name));
    let created = false;
    if (!row) {
      const match = this.catalogMatch(name);
      row = {
        id: uuid(),
        name: match?.name ?? name,
        ingredientId: match?.id,
        quantityPerPerson: quantity,
        unit: draft.unit.trim() || match?.defaultUnit || '',
        sectionId: step.sectionId,
      };
      this.form.ingredients = [...this.form.ingredients.filter((i) => i.name.trim() || i.quantityPerPerson != null), row];
      this.ingredientPrevNames = this.form.ingredients.map((i) => i.name);
      created = true;
    }
    if (!step.ingredients.some((link) => link.recipeIngredientId === row!.id)) {
      this.form.steps = this.form.steps.map((s, i) => i === stepIdx ? {
        ...s,
        ingredients: [...s.ingredients, {
          recipeIngredientId: row!.id, name: row!.name, ingredientId: row!.ingredientId,
          // A new row already holds the amount; an existing one keeps its total and this step gets its share.
          quantityPerPerson: created ? undefined : quantity,
          unit: created || quantity == null ? '' : draft.unit.trim(),
        }],
      } : s);
    }
    this.stepDrafts[stepIdx] = { name: '', quantity: undefined, unit: '' };
    this.focusField(`Schritt ${stepIdx + 1} Zutat hinzufügen`);
  }

  addStepIngredient(stepIdx: number): void {
    this.form.steps = this.form.steps.map((s, i) =>
      i === stepIdx
        ? {
            ...s,
            ingredients: [...s.ingredients, { name: '', quantityPerPerson: undefined, unit: '' }],
          }
        : s,
    );
  }

  unlinkStepIngredient(stepIdx: number, ingIdx: number): void {
    this.form.steps = this.form.steps.map((s, si) =>
      si === stepIdx ? { ...s, ingredients: s.ingredients.filter((_, ii) => ii !== ingIdx) } : s,
    );
  }

  onStepIngredientQtyUnitChange(_stepIdx: number, _ingIdx: number): void {
    this.form.steps = [...this.form.steps];
  }

  moveStep(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.form.steps.length) return;
    const steps = [...this.form.steps];
    [steps[index], steps[target]] = [steps[target], steps[index]];
    this.form.steps = steps.map((step, i) => ({ ...step, order: i + 1 }));
    const drafts = [...this.stepDrafts];
    [drafts[index], drafts[target]] = [drafts[target], drafts[index]];
    this.stepDrafts = drafts;
  }
  linkStepIngredient(stepIdx: number, linkIdx: number): void {
    const link = this.form.steps[stepIdx].ingredients[linkIdx];
    const amount = this.form.ingredients.find((i) => i.id === link.recipeIngredientId);
    if (amount) {
      link.name = amount.name;
      link.ingredientId = amount.ingredientId;
      link.quantityPerPerson = undefined;
      link.unit = '';
    }
    this.form.steps = [...this.form.steps];
  }
  stepAmountLabel(link: RecipeStep['ingredients'][number]): string {
    const amount = this.form.ingredients.find((i) => i.id === link.recipeIngredientId);
    return amount ? `${amount.quantityPerPerson ?? 'nach Bedarf'} ${amount.unit ?? ''}` : '';
  }
  ingredientOptionLabel(ing: RecipeIngredient): string {
    const section = this.form.sections.find((s) => s.id === ing.sectionId)?.title;
    return `${ing.name}${section ? ' · ' + section : ''}`;
  }
  addExistingIngredientToStep(stepIndex: number, ingredient: RecipeIngredient): void {
    if (
      this.form.steps[stepIndex].ingredients.some(
        (link) => link.recipeIngredientId === ingredient.id,
      )
    )
      return;
    this.form.steps = this.form.steps.map((step, index) =>
      index === stepIndex
        ? {
            ...step,
            ingredients: [
              ...step.ingredients,
              {
                recipeIngredientId: ingredient.id,
                name: ingredient.name,
                ingredientId: ingredient.ingredientId,
                unit: '',
              },
            ],
          }
        : step,
    );
  }
  ingredientLinked(step: RecipeStep, index: number, ingredient: RecipeIngredient): boolean {
    return step.ingredients.some((link, i) => i !== index && link.recipeIngredientId === ingredient.id);
  }
  stepUnit(link: RecipeStep['ingredients'][number]): string {
    return this.form.ingredients.find((i) => i.id === link.recipeIngredientId)?.unit ?? '';
  }
  private catalogPrompt(name: string, index: number): NonNullable<typeof this.newIngredientPrompt> {
    const archived = this.archivedCatalog.find((i) => ingredientKey(i.name) === ingredientKey(name));
    return {
      rowId: this.form.ingredients[index].id,
      name,
      category: archived?.category ?? 'sonstiges',
      defaultUnit: this.form.ingredients[index].unit ?? '',
      archived,
    };
  }

  /** Adds the typed ingredient to the catalog (or re-activates an archived entry) and links the rows. */
  confirmNewIngredient(): void {
    if (!this.newIngredientPrompt || this.ingredientSaving) return;
    this.ingredientSaving = true;
    this.formError = '';
    this.catalogNotice = '';
    this.newIngredientPrompt = { ...this.newIngredientPrompt, error: undefined };
    const { name, category, defaultUnit, archived } = this.newIngredientPrompt;
    const request = archived
      ? this.service.updateIngredient(archived.id, { archived: false })
      : this.service.createIngredient({ name, category, defaultUnit });
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.ingredientSaving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (ing) => {
          this.ingredientCatalog = [...this.ingredientCatalog.filter((i) => i.id !== ing.id), ing].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
          this.archivedCatalog = this.archivedCatalog.filter((i) => i.id !== ing.id);
          this.linkRows(ing);
          this.newIngredientPrompt = null;
          this.cdr.detectChanges();
        },
        error: (error) => {
          // Usually the entry exists after all (added elsewhere, archived, other spelling): reload and use it.
          this.resolveExisting(name, this.errorText(error, 'Die Zutat konnte nicht angelegt werden.'));
        },
      });
  }

  /** After a refused "anlegen": find the existing catalog entry and link it, or show why it failed. */
  private resolveExisting(name: string, message: string): void {
    this.service.getIngredients().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (all) => {
        this.ingredientCatalog = all.filter((i) => !i.archived);
        this.archivedCatalog = all.filter((i) => i.archived);
        const quoted = /„(.+?)“/.exec(message)?.[1];
        const key = ingredientKey(quoted ?? name);
        const active = this.ingredientCatalog.find((i) => ingredientKey(i.name) === key)
          ?? this.ingredientCatalog.find((i) => ingredientKey(i.name) === ingredientKey(name));
        const archived = this.archivedCatalog.find((i) => ingredientKey(i.name) === key);
        if (active) {
          const rowName = this.newIngredientPrompt?.name ?? name;
          for (const row of this.form.ingredients) if (ingredientKey(row.name) === ingredientKey(rowName)) row.name = active.name;
          this.linkRows(active);
          this.newIngredientPrompt = null;
          this.catalogNotice = `„${active.name}“ war schon im Katalog und ist jetzt verknüpft.`;
        } else if (archived && this.newIngredientPrompt) {
          this.newIngredientPrompt = { ...this.newIngredientPrompt, archived };
        } else if (this.newIngredientPrompt) {
          this.newIngredientPrompt = { ...this.newIngredientPrompt, error: message };
        }
        this.cdr.markForCheck();
      },
      error: () => {
        if (this.newIngredientPrompt) this.newIngredientPrompt = { ...this.newIngredientPrompt, error: message };
        this.cdr.markForCheck();
      },
    });
  }

  /** Rows (and step links) typed with this name now point at the catalog entry. */
  private linkRows(ing: Ingredient): void {
    const key = ingredientKey(ing.name);
    const ids = new Set<number | string | undefined>();
    for (const row of this.form.ingredients) {
      if (ingredientKey(row.name ?? '') !== key) continue;
      row.ingredientId = ing.id;
      row.name = ing.name;
      if (!row.unit && ing.defaultUnit) row.unit = ing.defaultUnit;
      ids.add(row.id);
    }
    this.form.ingredients = [...this.form.ingredients];
    this.form.steps = this.form.steps.map((s) => ({
      ...s,
      ingredients: s.ingredients.map((i) => (ids.has(i.recipeIngredientId) ? { ...i, name: ing.name, ingredientId: ing.id } : i)),
    }));
  }

  dismissNewIngredient(): void {
    this.newIngredientPrompt = null;
  }

  // ── Modal ───────────────────────────────────────────────────────────────
  openAdd(): void {
    this.form = this.emptyForm();
    this.editorTab = 'details';
    this.formError = '';
    this.showDeleteConfirm = false;
    this.ingredientPrevNames = [];
    this.modalMode = 'add';
    this.resetEditorState();
    this.showModal = true;
  }

  /** Starts a new recipe prefilled with a copy of the one being edited. */
  duplicate(): void {
    if (this.saving || this.modalMode !== 'edit') return;
    const ids = new Map(this.form.ingredients.map((i) => [i.id, uuid()]));
    const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = this.form as RecipeForm & { id?: string };
    this.form = {
      ...copy,
      name: `${this.form.name} (Kopie)`.slice(0, 200),
      sections: this.form.sections.map((s) => ({ ...s })),
      sideNotes: this.form.sideNotes.map((n) => ({ ...n })),
      ingredients: this.form.ingredients.map((i) => ({ ...i, id: ids.get(i.id) })),
      steps: this.form.steps.map((s) => ({
        ...s,
        ingredients: s.ingredients.map((link) => ({
          ...link,
          recipeIngredientId: ids.get(link.recipeIngredientId) ?? link.recipeIngredientId,
        })),
      })),
    };
    this.modalMode = 'add';
    this.editorTab = 'details';
    this.formError = '';
    this.showDeleteConfirm = false;
    this.showDiscardConfirm = false;
    // The copy only exists in the form, so closing it should ask first.
    this.snapshot = '';
    this.focusField('Rezeptname');
  }

  openEdit(recipe: Recipe): void {
    this.editorTab = 'details';
    this.formError = '';
    this.showDeleteConfirm = false;
    this.form = {
      ...recipe,
      sections: (recipe.sections ?? []).map((s) => ({ ...s })),
      sideNotes: (recipe.sideNotes ?? []).map((n) => ({ ...n })),
      ingredients: (recipe.ingredients ?? []).map((i) => ({
        ...i,
        id: i.id ?? uuid(),
      })),
      steps: (recipe.steps ?? []).map((s) => ({
        order: s.order,
        description: s.description,
        sectionId: s.sectionId,
        ingredients: s.ingredients?.length
          ? s.ingredients.map((i) => ({ ...i }))
          : (s as any).ingredientName
            ? [
                {
                  name: (s as any).ingredientName,
                  quantityPerPerson: (s as any).quantityPerPerson,
                  unit: (s as any).unit ?? '',
                },
              ]
            : [],
      })),
    };
    for (const step of this.form.steps)
      for (const link of step.ingredients) {
        const matches = this.form.ingredients.filter(
          (i) => ingredientKey(i.name) === ingredientKey(link.name),
        );
        const amount = matches.find((i) => i.sectionId === step.sectionId) ?? matches[0];
        link.recipeIngredientId ??= amount?.id;
      }
    this.ingredientPrevNames = this.form.ingredients.map((i) => i.name ?? '');
    this.modalMode = 'edit';
    this.resetEditorState();
    this.showModal = true;
  }

  get isDirty(): boolean {
    return this.serializeForm() !== this.snapshot;
  }

  /** Closes the editor, but asks first when there are unsaved changes. */
  requestClose(): void {
    if (this.saving || this.ingredientSaving) return;
    if (this.showDeleteConfirm) {
      this.showDeleteConfirm = false;
      return;
    }
    if (this.importMode) {
      this.importMode = null;
      return;
    }
    if (this.isDirty && !this.showDiscardConfirm) {
      this.showDiscardConfirm = true;
      return;
    }
    this.closeModal();
  }

  closeModal(): void {
    if (this.saving || this.ingredientSaving) return;
    this.showModal = false;
    this.showDiscardConfirm = false;
    this.formError = '';
    this.form = this.emptyForm();
    this.newIngredientPrompt = null;
    this.importMode = null;
  }

  onBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.requestClose();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showModal) this.requestClose();
  }

  startCooking(recipe: Recipe, e?: MouseEvent): void {
    e?.stopPropagation();
    this.cookService.open({
      date: '',
      meal: 'dinner',
      weekTag: '',
      persons: 1,
      servings: recipe.baseServings ?? 4,
      source: 'recipe',
      recipe,
    });
  }

  save(): void {
    if (this.saving || this.ingredientSaving) return;
    if (!this.form.name?.trim()) {
      this.formError = 'Bitte einen Namen angeben.';
      return;
    }
    if (!Number.isInteger(this.form.baseServings) || this.form.baseServings! < 1) {
      this.formError = 'Bitte mindestens eine Basisportion angeben.';
      return;
    }
    if (!Number.isFinite(this.form.unitsPerPerson) || this.form.unitsPerPerson! <= 0) {
      this.formError = 'Bitte eine positive Menge pro Person angeben.';
      this.editorTab = 'details';
      return;
    }
    if (
      this.form.ingredients.some(
        (i) =>
          i.quantityPerPerson != null &&
          (!Number.isFinite(i.quantityPerPerson) || i.quantityPerPerson < 0),
      )
    ) {
      this.formError = 'Zutatenmengen müssen nicht negative Zahlen sein.';
      this.editorTab = 'ingredients';
      return;
    }
    if (this.form.steps.some((s) => !s.description.trim())) {
      this.formError = 'Bitte jeden Kochschritt beschreiben oder leere Schritte entfernen.';
      this.editorTab = 'steps';
      return;
    }
    if (this.form.sections.some((s) => !s.title.trim())) {
      this.formError = 'Bitte jeden Abschnitt benennen oder leere Abschnitte entfernen.';
      this.editorTab = 'details';
      return;
    }
    if (this.form.steps.some((s) => s.ingredients.some((i) => !i.recipeIngredientId))) {
      this.formError = 'Bitte jede Schrittzutat auswählen oder die leere Verknüpfung entfernen.';
      this.editorTab = 'steps';
      return;
    }
    const payload: Partial<Recipe> = {
      ...this.form,
      name: this.form.name.trim(),
      sections: this.form.sections.filter((s) => s.title.trim()),
      sideNotes: this.form.sideNotes.filter((n) => n.label.trim() && n.value.trim()),
      ingredients: this.form.ingredients.filter((i) => i.name.trim()),
      steps: this.form.steps
        .filter((s) => s.description.trim())
        .map((s, idx) => ({
          order: idx + 1,
          description: s.description,
          sectionId: s.sectionId,
          ingredients: s.ingredients.filter((i) => i.recipeIngredientId),
        })),
    };
    const mode = this.modalMode;
    const id = (this.form as any).id as string;
    this.saving = true;
    this.formError = '';
    const request =
      mode === 'add' ? this.service.createRecipe(payload) : this.service.updateRecipe(id, payload);
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (recipe) => {
          this.recipes =
            mode === 'add'
              ? [...this.recipes, recipe]
              : this.recipes.map((r) => (r.id === recipe.id ? recipe : r));
          this.saving = false;
          this.closeModal();
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.formError = this.errorText(
            error,
            'Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.',
          );
          this.cdr.markForCheck();
        },
      });
  }

  delete(): void {
    const id = (this.form as any).id as string;
    if (!id || this.saving) return;
    this.saving = true;
    this.formError = '';
    this.service
      .deleteRecipe(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.recipes = this.recipes.filter((r) => r.id !== id);
          this.saving = false;
          this.closeModal();
          this.cdr.markForCheck();
        },
        error: () => {
          this.formError = 'Löschen fehlgeschlagen. Bitte erneut versuchen.';
          this.cdr.markForCheck();
        },
      });
  }

  private resetEditorState(): void {
    this.showDiscardConfirm = false;
    this.stepDrafts = [];
    this.autoUnitIds = new Set();
    this.catalogNotice = '';
    this.importMode = null;
    this.importText = '';
    this.newIngredientPrompt = null;
    this.snapshot = this.serializeForm();
  }

  private serializeForm(): string {
    return JSON.stringify(this.form);
  }

  private focusField(label: string): void {
    this.cdr.detectChanges();
    setTimeout(() =>
      document.querySelector<HTMLElement>(`.recipe-editor [aria-label="${label}"]`)?.focus(),
    );
  }

  private errorText(error: unknown, fallback: string): string {
    return apiErrorMessage(error, fallback);
  }

  private emptyForm(): RecipeForm {
    return {
      name: '',
      description: '',
      instructions: '',
      durationMinutes: undefined,
      baseServings: 4,
      servingType: 'Portionen',
      unitsPerPerson: 1,
      category: 'mahlzeit',
      sideNotes: [],
      ingredients: [],
      steps: [],
      sections: [],
    };
  }
}
