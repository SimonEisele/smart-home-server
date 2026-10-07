import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, inject } from '@angular/core';
import { RecipeCookService } from '../../shared/services/recipe-cook.service';
import { INGREDIENT_UNITS, INGREDIENT_CATEGORIES } from '../ingredients/model/ingredient.model';
import { DialogDirective } from '../../shared/directives/dialog.directive';
import {
  Component,
  HostListener,
  OnInit,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ingredientKey } from '../ingredients/model/ingredient.model';
import {
  Ingredient,
  Recipe,
  RecipeIngredient,
  RecipeSection,
  RecipeSideNote,
  RecipeStep,
} from './model/recipes.model';
import { RecipesService } from './service/recipes.service';

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
  templateUrl: './recipes.html',
  styleUrl: './recipes.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Recipes implements OnInit {
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
  newIngredientPrompt: { name: string; category: string; defaultUnit: string } | null = null;

  readonly INGREDIENT_CATEGORIES = INGREDIENT_CATEGORIES;

  constructor(
    private service: RecipesService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
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
  }

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
  /** Fires on every input event — fills the default unit immediately when a catalog match is typed/selected. */
  onIngredientNameInput(index: number): void {
    const name = this.form.ingredients[index].name?.trim();
    const match = this.ingredientCatalog.find(
      (i) => ingredientKey(i.name) === ingredientKey(name || ''),
    );
    this.form.ingredients[index].ingredientId = match?.id;
    if (!name || this.form.ingredients[index].unit) return;
    if (match) {
      // Mutate in place so item.ing in the template stays valid
      this.form.ingredients[index].unit = match.defaultUnit;
    }
  }

  onIngredientNameChange(index: number): void {
    const oldName = this.ingredientPrevNames[index] ?? '';
    const newName = this.form.ingredients[index].name?.trim() ?? '';
    const identity = this.ingredientCatalog.find(
      (i) => ingredientKey(i.name) === ingredientKey(newName),
    );
    this.form.ingredients[index].ingredientId = identity?.id;
    if (identity) this.form.ingredients[index].name = identity.name;
    // Auto-fill unit on blur too (covers keyboard-only usage)
    if (newName && !this.form.ingredients[index].unit) {
      const match = identity;
      if (match) {
        // Mutate in place — do NOT replace form.ingredients[index] with a new object;
        // that would orphan item.ing in the template and lose any qty the user already typed.
        this.form.ingredients[index].unit = match.defaultUnit;
      }
    }
    this.ingredientPrevNames[index] = identity?.name ?? newName;
    this.form.ingredients = [...this.form.ingredients];
    if (!oldName || oldName === newName) {
      // Still check catalog even if name didn't change (e.g. first blur)
      if (newName && !identity) {
        this.newIngredientPrompt = {
          name: newName,
          category: 'sonstiges',
          defaultUnit: this.form.ingredients[index].unit ?? '',
        };
      } else {
        this.newIngredientPrompt = null;
      }
      this.cdr.detectChanges();
      return;
    }
    this.form.steps = this.form.steps.map((s) => ({
      ...s,
      ingredients: s.ingredients.map((i) =>
        i.recipeIngredientId === this.form.ingredients[index].id
          ? { ...i, name: identity?.name ?? newName, ingredientId: identity?.id }
          : i,
      ),
    }));
    // Show prompt if new name isn't in catalog
    if (newName && !identity) {
      this.newIngredientPrompt = {
        name: newName,
        category: 'sonstiges',
        defaultUnit: this.form.ingredients[index].unit ?? '',
      };
    } else {
      this.newIngredientPrompt = null;
    }
    this.cdr.detectChanges();
  }

  addIngredient(sectionId?: number): void {
    this.form.ingredients = [
      ...this.form.ingredients,
      { id: crypto.randomUUID(), name: '', quantityPerPerson: undefined, unit: '', sectionId },
    ];
    this.ingredientPrevNames = [...this.ingredientPrevNames, ''];
  }

  removeIngredient(index: number): void {
    const removed = this.form.ingredients[index];
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

  addStep(sectionId?: number): void {
    this.form.steps = [
      ...this.form.steps,
      { order: this.form.steps.length + 1, description: '', ingredients: [], sectionId },
    ];
  }

  removeStep(i: number): void {
    this.form.steps = this.form.steps
      .filter((_, idx) => idx !== i)
      .map((s, idx) => ({ ...s, order: idx + 1 }));
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
  confirmNewIngredient(): void {
    if (!this.newIngredientPrompt || this.ingredientSaving) return;
    this.ingredientSaving = true;
    this.formError = '';
    const { name, category, defaultUnit } = this.newIngredientPrompt;
    this.service
      .createIngredient({ name, category, defaultUnit })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.ingredientSaving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (ing) => {
          this.ingredientCatalog = [...this.ingredientCatalog, ing].sort((a, b) =>
            a.name.localeCompare(b.name),
          );
          this.newIngredientPrompt = null;
          this.cdr.detectChanges();
        },
        error: (error) => {
          this.formError = this.errorText(error, 'Die Zutat konnte nicht angelegt werden.');
          this.cdr.markForCheck();
        },
      });
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
    this.showModal = true;
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
        id: i.id ?? crypto.randomUUID(),
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
    this.showModal = true;
  }

  closeModal(): void {
    if (this.saving || this.ingredientSaving) return;
    this.showModal = false;
    this.formError = '';
    this.form = this.emptyForm();
    this.newIngredientPrompt = null;
  }

  onBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.closeModal();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showModal) this.closeModal();
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

  private errorText(error: any, fallback: string): string {
    const collect = (value: any): string[] =>
      typeof value === 'string'
        ? [value]
        : value && typeof value === 'object'
          ? Object.values(value).flatMap(collect)
          : [];
    return collect(error?.error).join(' ') || fallback;
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
