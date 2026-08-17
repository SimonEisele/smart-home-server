import {
  Component, HostListener, OnInit, DoCheck,
  ChangeDetectorRef, ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Ingredient, Recipe, RecipeIngredient, RecipeSection, RecipeSideNote, RecipeStep } from './model/recipes.model';
import { RecipesService } from './service/recipes.service';
import { CookMode } from './cook-mode/cook-mode';

type RecipeForm = Partial<Recipe> & {
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  sections: RecipeSection[];
  sideNotes: RecipeSideNote[];
};

type GroupedIng  = Array<{ section: RecipeSection | null; items: Array<{ ing: RecipeIngredient; idx: number }> }>;
type GroupedStep = Array<{ section: RecipeSection | null; items: Array<{ step: RecipeStep; idx: number }> }>;

@Component({
  selector: 'app-recipes',
  standalone: true,
  imports: [CommonModule, FormsModule, CookMode],
  templateUrl: './recipes.html',
  styleUrl: './recipes.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Recipes implements OnInit, DoCheck {
  recipes: Recipe[] = [];
  ingredientCatalog: Ingredient[] = [];
  search = '';
  showModal = false;
  modalMode: 'add' | 'edit' = 'add';
  form: RecipeForm = this.emptyForm();
  cookingRecipe: Recipe | null = null;
  ingredientPrevNames: string[] = [];
  newIngredientPrompt: { name: string; category: string; defaultUnit: string } | null = null;

  readonly INGREDIENT_CATEGORIES = [
    { value: 'gemuese', label: 'Gemüse' },
    { value: 'obst', label: 'Obst' },
    { value: 'fleisch', label: 'Fleisch & Fisch' },
    { value: 'milch', label: 'Milchprodukte' },
    { value: 'getreide', label: 'Getreide & Backwaren' },
    { value: 'huelsenfruechte', label: 'Hülsenfrüchte' },
    { value: 'gewuerze', label: 'Gewürze & Kräuter' },
    { value: 'oele', label: 'Öle & Fette' },
    { value: 'saucen', label: 'Saucen & Konserven' },
    { value: 'sonstiges', label: 'Sonstiges' },
  ];

  // ── Cached computed arrays (rebuilt in ngDoCheck only when references change) ──
  groupedIngredients: GroupedIng = [];
  groupedSteps: GroupedStep = [];
  unlinkedSuggestions: RecipeIngredient[][] = [];
  stepIngredientOptionsArr: string[] = [];

  private _prevIng: RecipeIngredient[] | null = null;
  private _prevSteps: RecipeStep[] | null = null;
  private _prevSections: RecipeSection[] | null = null;
  private _prevCatalog: Ingredient[] | null = null;

  constructor(private service: RecipesService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void { this.loadData(); }

  /** Fast reference-check cache refresh — O(1) when nothing changed. */
  ngDoCheck(): void {
    const ingChanged     = this._prevIng      !== this.form.ingredients;
    const stepsChanged   = this._prevSteps    !== this.form.steps;
    const sectionsChanged = this._prevSections !== this.form.sections;
    const catalogChanged  = this._prevCatalog  !== this.ingredientCatalog;

    if (ingChanged || sectionsChanged) {
      this._prevIng = this.form.ingredients;
      this._prevSections = this.form.sections;
      this.groupedIngredients = this.buildGroupedIngredients();
      this.stepIngredientOptionsArr = this.buildStepIngredientOptions();
    }
    if (stepsChanged || sectionsChanged) {
      this._prevSteps = this.form.steps;
      this._prevSections = this.form.sections;
      this.groupedSteps = this.buildGroupedSteps();
    }
    if (ingChanged || stepsChanged) {
      this.unlinkedSuggestions = this.buildUnlinkedSuggestions();
    }
    if (catalogChanged) {
      this._prevCatalog = this.ingredientCatalog;
      this.stepIngredientOptionsArr = this.buildStepIngredientOptions();
    }
  }

  private loadData(): void {
    this.service.getRecipes().subscribe(r => { this.recipes = r; this.cdr.detectChanges(); });
    this.service.getIngredients().subscribe(i => { this.ingredientCatalog = i; this.cdr.detectChanges(); });
  }

  // ── Cache builders ──────────────────────────────────────────────────────
  private buildGroupedIngredients(): GroupedIng {
    const all = this.form.ingredients.map((ing, idx) => ({ ing, idx }));
    if (!this.form.sections.length) return [{ section: null, items: all }];
    return [
      { section: null, items: all.filter(({ ing }) => !ing.sectionId) },
      ...this.form.sections.map(section => ({
        section, items: all.filter(({ ing }) => ing.sectionId === section.id),
      })),
    ];
  }

  private buildGroupedSteps(): GroupedStep {
    const all = this.form.steps.map((step, idx) => ({ step, idx }));
    if (!this.form.sections.length) return [{ section: null, items: all }];
    return [
      { section: null, items: all.filter(({ step }) => !step.sectionId) },
      ...this.form.sections.map(section => ({
        section, items: all.filter(({ step }) => step.sectionId === section.id),
      })),
    ];
  }

  private buildUnlinkedSuggestions(): RecipeIngredient[][] {
    const allLinked = new Set(
      this.form.steps.flatMap(s => s.ingredients.map(i => i.name).filter(Boolean))
    );
    return this.form.steps.map(step => {
      const sectionId = step.sectionId;
      return this.form.ingredients.filter(i => {
        if (!i.name || allLinked.has(i.name)) return false;
        if (sectionId) return !i.sectionId || i.sectionId === sectionId;
        return true;
      });
    });
  }

  private buildStepIngredientOptions(): string[] {
    const recipeNames = this.form.ingredients.map(i => i.name).filter(n => !!n);
    const recipeSet = new Set(recipeNames);
    const catalogExtra = this.ingredientCatalog.map(i => i.name).filter(n => !recipeSet.has(n));
    return [...recipeNames, ...catalogExtra];
  }

  // ── TrackBy functions ───────────────────────────────────────────────────
  trackBySection(_i: number, g: { section: RecipeSection | null }) {
    return g.section?.id ?? 'unsectioned';
  }
  trackByIngIdx(_i: number, item: { idx: number }) { return item.idx; }
  trackByStepIdx(_i: number, item: { idx: number }) { return item.idx; }
  trackByRecipe(_i: number, r: Recipe) { return r.id; }

  get filtered(): Recipe[] {
    const q = this.search.toLowerCase();
    if (!q) return this.recipes;
    return this.recipes.filter(r =>
      r.name.toLowerCase().includes(q) || (r.description ?? '').toLowerCase().includes(q)
    );
  }

  formatDuration(mins?: number): string {
    if (!mins) return '';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}min` : `${h}h`;
  }

  // ── Section handlers ─────────────────────────────────────────────────────
  addSection(): void {
    this.form.sections = [...this.form.sections, { id: Date.now(), title: '' }];
  }

  removeSection(id: number): void {
    this.form.sections = this.form.sections.filter(s => s.id !== id);
    this.form.ingredients = this.form.ingredients.map(i => i.sectionId === id ? { ...i, sectionId: undefined } : i);
    this.form.steps = this.form.steps.map(s => s.sectionId === id ? { ...s, sectionId: undefined } : s);
  }

  // ── Side note handlers ──────────────────────────────────────────────────
  addSideNote(): void { this.form.sideNotes = [...this.form.sideNotes, { label: '', value: '' }]; }
  removeSideNote(i: number): void { this.form.sideNotes = this.form.sideNotes.filter((_, idx) => idx !== i); }

  // ── Recipe ingredient handlers ──────────────────────────────────────────
  /** Fires on every input event — fills the default unit immediately when a catalog match is typed/selected. */
  onIngredientNameInput(index: number): void {
    const name = this.form.ingredients[index].name?.trim();
    if (!name || this.form.ingredients[index].unit) return;
    const match = this.ingredientCatalog.find(i => i.name === name);
    if (match) {
      // Mutate in place so item.ing in the template stays valid
      this.form.ingredients[index].unit = match.defaultUnit;
    }
  }

  onIngredientNameChange(index: number): void {
    const oldName = this.ingredientPrevNames[index] ?? '';
    const newName = this.form.ingredients[index].name?.trim() ?? '';
    // Auto-fill unit on blur too (covers keyboard-only usage)
    if (newName && !this.form.ingredients[index].unit) {
      const match = this.ingredientCatalog.find(i => i.name === newName);
      if (match) {
        // Mutate in place — do NOT replace form.ingredients[index] with a new object;
        // that would orphan item.ing in the template and lose any qty the user already typed.
        this.form.ingredients[index].unit = match.defaultUnit;
      }
    }
    this.ingredientPrevNames[index] = newName;
    if (!oldName || oldName === newName) {
      // Still check catalog even if name didn't change (e.g. first blur)
      if (newName && !this.ingredientCatalog.find(i => i.name === newName)) {
        this.newIngredientPrompt = { name: newName, category: 'sonstiges', defaultUnit: this.form.ingredients[index].unit ?? '' };
      } else {
        this.newIngredientPrompt = null;
      }
      this.cdr.detectChanges();
      return;
    }
    this.form.steps = this.form.steps.map(s => ({
      ...s,
      ingredients: s.ingredients.map(i => i.name === oldName ? { ...i, name: newName } : i),
    }));
    // Show prompt if new name isn't in catalog
    if (newName && !this.ingredientCatalog.find(i => i.name === newName)) {
      this.newIngredientPrompt = { name: newName, category: 'sonstiges', defaultUnit: this.form.ingredients[index].unit ?? '' };
    } else {
      this.newIngredientPrompt = null;
    }
    this.cdr.detectChanges();
  }

  addIngredient(sectionId?: number): void {
    this.form.ingredients = [...this.form.ingredients, { name: '', quantityPerPerson: undefined, unit: '', sectionId }];
    this.ingredientPrevNames = [...this.ingredientPrevNames, ''];
  }

  removeIngredient(i: number): void {
    const removedName = this.form.ingredients[i].name?.trim();
    this.form.ingredients = this.form.ingredients.filter((_, idx) => idx !== i);
    this.ingredientPrevNames = this.ingredientPrevNames.filter((_, idx) => idx !== i);
    if (removedName) {
      this.form.steps = this.form.steps.map(s => ({
        ...s, ingredients: s.ingredients.filter(si => si.name !== removedName),
      }));
    }
  }

  onRecipeIngredientQtyUnitChange(index: number): void {
    const ing = this.form.ingredients[index];
    const name = ing.name?.trim();
    if (!name) return;
    const qty = ing.quantityPerPerson;
    const unit = ing.unit ?? '';
    this.form.steps = this.form.steps.map(s => ({
      ...s, ingredients: s.ingredients.map(si => si.name === name ? { ...si, quantityPerPerson: qty, unit } : si),
    }));
  }

  // ── Step handlers ───────────────────────────────────────────────────────
  addStep(sectionId?: number): void {
    this.form.steps = [...this.form.steps, { order: this.form.steps.length + 1, description: '', ingredients: [], sectionId }];
  }

  removeStep(i: number): void {
    this.form.steps = this.form.steps
      .filter((_, idx) => idx !== i)
      .map((s, idx) => ({ ...s, order: idx + 1 }));
  }

  addStepIngredient(stepIdx: number): void {
    this.form.steps = this.form.steps.map((s, i) =>
      i === stepIdx ? { ...s, ingredients: [...s.ingredients, { name: '', quantityPerPerson: undefined, unit: '' }] } : s
    );
  }

  unlinkStepIngredient(stepIdx: number, ingIdx: number): void {
    this.form.steps = this.form.steps.map((s, si) =>
      si === stepIdx ? { ...s, ingredients: s.ingredients.filter((_, ii) => ii !== ingIdx) } : s
    );
  }

  removeStepIngredient(stepIdx: number, ingIdx: number): void {
    const name = this.form.steps[stepIdx].ingredients[ingIdx].name?.trim();
    if (name) {
      const ri = this.form.ingredients.findIndex(i => i.name === name);
      if (ri >= 0) {
        this.form.ingredients = this.form.ingredients.filter((_, i) => i !== ri);
        this.ingredientPrevNames = this.ingredientPrevNames.filter((_, i) => i !== ri);
      }
      this.form.steps = this.form.steps.map(s => ({
        ...s, ingredients: s.ingredients.filter(i => i.name !== name),
      }));
    } else {
      this.form.steps = this.form.steps.map((s, si) =>
        si === stepIdx ? { ...s, ingredients: s.ingredients.filter((_, ii) => ii !== ingIdx) } : s
      );
    }
  }

  onStepIngredientChange(stepIdx: number, ingIdx: number): void {
    const name = this.form.steps[stepIdx].ingredients[ingIdx].name?.trim();
    if (!name) return;
    const recipeIng = this.form.ingredients.find(i => i.name === name);
    const catalogIng = this.ingredientCatalog.find(i => i.name === name);
    if (recipeIng) {
      this.form.steps = this.form.steps.map((s, si) =>
        si === stepIdx
          ? { ...s, ingredients: s.ingredients.map((ing, ii) =>
              ii === ingIdx ? { ...ing, quantityPerPerson: recipeIng.quantityPerPerson, unit: recipeIng.unit ?? '' } : ing) }
          : s
      );
    } else {
      const autoUnit = catalogIng?.defaultUnit || '';
      const currentIng = this.form.steps[stepIdx].ingredients[ingIdx];
      const qty = currentIng.quantityPerPerson;
      const unit = currentIng.unit || autoUnit;
      if (autoUnit && !currentIng.unit) {
        this.form.steps = this.form.steps.map((s, si) =>
          si === stepIdx
            ? { ...s, ingredients: s.ingredients.map((ing, ii) => ii === ingIdx ? { ...ing, unit: autoUnit } : ing) }
            : s
        );
      }
      this.form.ingredients = [...this.form.ingredients, { name, quantityPerPerson: qty, unit }];
      this.ingredientPrevNames = [...this.ingredientPrevNames, name];
    }
  }

  onStepIngredientQtyUnitChange(stepIdx: number, ingIdx: number): void {
    const ing = this.form.steps[stepIdx].ingredients[ingIdx];
    const name = ing.name?.trim();
    if (!name) return;
    const qty = ing.quantityPerPerson;
    const unit = ing.unit ?? '';
    this.form.ingredients = this.form.ingredients.map(ri =>
      ri.name === name ? { ...ri, quantityPerPerson: qty, unit } : ri
    );
    this.form.steps = this.form.steps.map((s, si) => ({
      ...s, ingredients: s.ingredients.map((stepIng, ii) =>
        stepIng.name === name && !(si === stepIdx && ii === ingIdx)
          ? { ...stepIng, quantityPerPerson: qty, unit } : stepIng
      ),
    }));
  }

  addExistingIngredientToStep(stepIdx: number, ing: RecipeIngredient): void {
    if (this.form.steps[stepIdx].ingredients.find(i => i.name === ing.name)) return;
    this.form.steps = this.form.steps.map((s, si) =>
      si === stepIdx
        ? { ...s, ingredients: [...s.ingredients, { name: ing.name, quantityPerPerson: ing.quantityPerPerson, unit: ing.unit ?? '' }] }
        : s
    );
  }

  confirmNewIngredient(): void {
    if (!this.newIngredientPrompt) return;
    const { name, category, defaultUnit } = this.newIngredientPrompt;
    this.service.createIngredient({ name, category, defaultUnit }).subscribe({
      next: ing => {
        this.ingredientCatalog = [...this.ingredientCatalog, ing].sort((a, b) => a.name.localeCompare(b.name));
        this.newIngredientPrompt = null;
        this.cdr.detectChanges();
      }
    });
  }

  dismissNewIngredient(): void {
    this.newIngredientPrompt = null;
  }

  // ── Modal ───────────────────────────────────────────────────────────────
  openAdd(): void {
    this.form = this.emptyForm();
    this.ingredientPrevNames = [];
    this.modalMode = 'add';
    this.showModal = true;
  }

  openEdit(recipe: Recipe): void {
    this.form = {
      ...recipe,
      sections: (recipe.sections ?? []).map(s => ({ ...s })),
      sideNotes: (recipe.sideNotes ?? []).map(n => ({ ...n })),
      ingredients: (recipe.ingredients ?? []).map(i => ({ ...i })),
      steps: (recipe.steps ?? []).map(s => ({
        order: s.order,
        description: s.description,
        sectionId: s.sectionId,
        ingredients: s.ingredients?.length
          ? s.ingredients.map(i => ({ ...i }))
          : ((s as any).ingredientName
              ? [{ name: (s as any).ingredientName, quantityPerPerson: (s as any).quantityPerPerson, unit: (s as any).unit ?? '' }]
              : []),
      })),
    };
    this.ingredientPrevNames = this.form.ingredients.map(i => i.name ?? '');
    this.modalMode = 'edit';
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.form = this.emptyForm();
    this.newIngredientPrompt = null;
  }

  onBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.closeModal();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.showModal) this.closeModal(); }

  startCooking(recipe: Recipe, e: MouseEvent): void {
    e.stopPropagation();
    this.cookingRecipe = recipe;
  }

  save(): void {
    if (!this.form.name?.trim()) return;
    this.syncStepIngredientsToRecipe();
    const payload: Partial<Recipe> = {
      ...this.form,
      name: this.form.name.trim(),
      sections: this.form.sections.filter(s => s.title.trim()),
      ingredients: this.form.ingredients.filter(i => i.name.trim()),
      steps: this.form.steps
        .filter(s => s.description.trim())
        .map((s, idx) => ({
          order: idx + 1, description: s.description, sectionId: s.sectionId,
          ingredients: s.ingredients.filter(i => i.name?.trim()),
        })),
    };
    const mode = this.modalMode;
    const id = (this.form as any).id as string;
    this.closeModal();
    if (mode === 'add') {
      this.service.createRecipe(payload).subscribe({ next: () => this.loadData(), error: () => this.loadData() });
    } else {
      this.service.updateRecipe(id, payload).subscribe({ next: () => this.loadData(), error: () => this.loadData() });
    }
  }

  delete(): void {
    const id = (this.form as any).id as string;
    if (!id) return;
    this.closeModal();
    this.service.deleteRecipe(id).subscribe({ next: () => this.loadData(), error: () => this.loadData() });
  }

  private syncStepIngredientsToRecipe(): void {
    const existing = new Set(this.form.ingredients.map(i => i.name));
    const toAdd: RecipeIngredient[] = [];
    for (const step of this.form.steps) {
      for (const ing of step.ingredients) {
        const name = ing.name?.trim();
        if (name && !existing.has(name)) {
          existing.add(name);
          const unit = ing.unit || this.ingredientCatalog.find(c => c.name === name)?.defaultUnit || '';
          toAdd.push({ name, unit });
        }
      }
    }
    if (toAdd.length) this.form.ingredients = [...this.form.ingredients, ...toAdd];
  }

  private emptyForm(): RecipeForm {
    return { name: '', description: '', instructions: '', durationMinutes: undefined, baseServings: 4, servingType: 'Portionen', unitsPerPerson: 1, category: 'mahlzeit', sideNotes: [], ingredients: [], steps: [], sections: [] };
  }
}
