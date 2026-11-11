import { filtersChanged, loadFilters, saveFilters } from '../../../shared/utils/filter-memory';
import { Component, OnInit, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { RecipesService } from '../../recipes/service/recipes.service';
import {
  Ingredient,
  INGREDIENT_CATEGORIES,
  INGREDIENT_UNITS,
  ingredientKey,
  UnlinkedIngredient,
} from '../model/ingredient.model';
import { apiErrorMessage } from '../../../shared/utils/api-error';

type StatusFilter = 'active' | 'used' | 'archived' | 'all';
const DEFAULT_FILTERS = { search: '', category: '', status: 'active' as StatusFilter };
interface IngredientForm {
  name: string;
  category: string;
  subcategory: string;
  defaultUnit: string;
}
@Component({
  selector: 'app-ingredients-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogDirective],
  templateUrl: './ingredients.page.html',
  styleUrl: './ingredients.page.css',
})
export class IngredientsPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  readonly categories = INGREDIENT_CATEGORIES;
  readonly units = INGREDIENT_UNITS;
  ingredients: Ingredient[] = [];
  search = '';
  category = '';
  status: StatusFilter = 'active';
  loading = false;
  loadError = '';
  message = '';
  modal: 'edit' | 'delete' | 'merge' | null = null;
  unlinked: UnlinkedIngredient[] = [];
  showAllUnlinked = false;
  mergeTargetId: number | null = null;
  selected: Ingredient | null = null;
  form: IngredientForm = this.emptyForm();
  saving = false;
  formError = '';
  constructor(
    private service: RecipesService,
    private cdr: ChangeDetectorRef,
  ) {}
  ngOnInit(): void {
    Object.assign(this, loadFilters('ingredients', DEFAULT_FILTERS));
    this.load();
  }
  load(): void {
    if (this.loading) return;
    this.loading = true;
    this.loadError = '';
    this.service
      .getIngredients()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (list) => {
          this.ingredients = list;
          this.cdr.markForCheck();
        },
        error: () => {
          this.loadError = 'Die Zutaten konnten nicht geladen werden. Bitte erneut versuchen.';
          this.cdr.markForCheck();
        },
      });
    this.loadUnlinked();
  }

  /** Free-text recipe ingredients; optional, so a failure only hides the hint. */
  loadUnlinked(): void {
    this.service
      .getUnlinkedIngredients()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.unlinked = list;
          this.cdr.markForCheck();
        },
        error: () => {
          this.unlinked = [];
          this.cdr.markForCheck();
        },
      });
  }

  get visibleUnlinked(): UnlinkedIngredient[] {
    return this.showAllUnlinked ? this.unlinked : this.unlinked.slice(0, 6);
  }

  /** Opens the new-ingredient form prefilled from a free recipe ingredient. */
  addFromUnlinked(item: UnlinkedIngredient): void {
    this.openAdd();
    this.form.name = item.name;
    this.form.defaultUnit = item.suggestedUnit;
  }

  get mergeTargets(): Ingredient[] {
    return this.ingredients
      .filter((i) => i.id !== this.selected?.id && !i.archived)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  get mergeTarget(): Ingredient | undefined {
    return this.ingredients.find((i) => i.id === this.mergeTargetId);
  }

  startMerge(): void {
    if (this.saving || !this.selected) return;
    this.mergeTargetId = null;
    this.formError = '';
    this.modal = 'merge';
  }

  merge(): void {
    if (this.saving || !this.selected || !this.mergeTarget) return;
    const source = this.selected;
    const target = this.mergeTarget;
    this.saving = true;
    this.formError = '';
    this.service
      .mergeIngredient(source.id, target.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (merged) => {
          this.ingredients = this.ingredients.filter((i) => i.id !== source.id);
          this.upsert(merged);
          this.modal = null;
          this.message = `„${source.name}“ wurde mit „${merged.name}“ zusammengeführt.`;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.formError = this.errorText(error, 'Zusammenführen fehlgeschlagen. Bitte erneut versuchen.');
          this.cdr.markForCheck();
        },
      });
  }
  private matches(i: Ingredient, status: StatusFilter): boolean {
    const q = ingredientKey(this.search);
    const statusOk =
      status === 'all' ||
      (status === 'archived' ? !!i.archived : !i.archived && (status === 'active' || (i.usageCount ?? 0) > 0));
    return (
      statusOk &&
      (!this.category || i.category === this.category) &&
      (!q ||
        ingredientKey(`${i.name} ${i.subcategory} ${this.catLabel(i.category)} ${i.defaultUnit}`).includes(q))
    );
  }
  get filtered(): Ingredient[] {
    return this.ingredients
      .filter((i) => this.matches(i, this.status))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }
  /** Count per status chip within the current search and category. */
  statusCount(status: StatusFilter): number {
    return this.ingredients.filter((i) => this.matches(i, status)).length;
  }
  persistFilters(): void {
    saveFilters('ingredients', { search: this.search, category: this.category, status: this.status });
  }
  get filtersActive(): boolean {
    return filtersChanged({ search: this.search, category: this.category, status: this.status }, DEFAULT_FILTERS);
  }
  get activeCount(): number {
    return this.ingredients.filter((i) => !i.archived).length;
  }
  get archivedCount(): number {
    return this.ingredients.filter((i) => i.archived).length;
  }
  get usedCount(): number {
    return this.ingredients.filter((i) => (i.usageCount ?? 0) > 0).length;
  }
  get duplicate(): Ingredient | undefined {
    const key = ingredientKey(this.form.name);
    return key
      ? this.ingredients.find((i) => i.id !== this.selected?.id && ingredientKey(i.name) === key)
      : undefined;
  }
  get formUnits(): string[] {
    return this.units.includes(this.form.defaultUnit)
      ? this.units
      : [...this.units, this.form.defaultUnit];
  }
  catLabel(value: string): string {
    return this.categories.find((c) => c.value === value)?.label ?? value;
  }
  trackId(_index: number, ingredient: Ingredient): number {
    return ingredient.id;
  }
  resetFilters(): void {
    this.search = '';
    this.category = '';
    this.status = 'active';
    this.persistFilters();
  }
  openAdd(): void {
    if (this.saving) return;
    this.selected = null;
    this.form = this.emptyForm();
    this.formError = '';
    this.modal = 'edit';
    this.message = '';
  }
  startEdit(ingredient: Ingredient): void {
    if (this.saving) return;
    this.selected = ingredient;
    this.form = {
      name: ingredient.name,
      category: ingredient.category,
      subcategory: ingredient.subcategory,
      defaultUnit: ingredient.defaultUnit,
    };
    this.formError = '';
    this.modal = 'edit';
    this.message = '';
  }
  closeModal(): void {
    if (!this.saving) {
      this.modal = null;
      this.formError = '';
    }
  }
  save(): void {
    if (this.saving || !this.form.name.trim()) return;
    if (this.duplicate) {
      this.formError = 'Diese Zutat gibt es bereits. Bitte den vorhandenen Eintrag bearbeiten.';
      return;
    }
    const payload = {
      ...this.form,
      name: this.form.name.trim().replace(/\s+/g, ' '),
      subcategory: this.form.subcategory.trim(),
    };
    this.saving = true;
    this.formError = '';
    const request = this.selected
      ? this.service.updateIngredient(this.selected.id, payload)
      : this.service.createIngredient(payload);
    request
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (ingredient) => {
          const created = !this.selected;
          this.upsert(ingredient);
          this.modal = null;
          this.message = `${ingredient.name} wurde gespeichert.`;
          // New catalog entries link matching free recipe ingredients on the server.
          if (created) this.unlinked = this.unlinked.filter((u) => ingredientKey(u.name) !== ingredientKey(ingredient.name));
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.formError = this.errorText(
            error,
            'Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten.',
          );
          this.cdr.markForCheck();
        },
      });
  }
  archive(): void {
    if (this.saving || !this.selected) return;
    const selected = this.selected;
    this.saving = true;
    this.formError = '';
    this.service
      .updateIngredient(selected.id, { archived: !selected.archived })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (ingredient) => {
          this.upsert(ingredient);
          this.modal = null;
          this.message = `${ingredient.name} wurde ${ingredient.archived ? 'archiviert' : 'wieder aktiviert'}.`;
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.formError = this.errorText(
            error,
            'Änderung fehlgeschlagen. Bitte erneut versuchen.',
          );
          this.cdr.markForCheck();
        },
      });
  }
  confirmDelete(): void {
    if (this.saving || !this.selected || (this.selected.usageCount ?? 0) > 0) return;
    this.modal = 'delete';
    this.formError = '';
  }
  delete(): void {
    if (this.saving || !this.selected) return;
    const id = this.selected.id;
    this.saving = true;
    this.formError = '';
    this.service
      .deleteIngredient(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.ingredients = this.ingredients.filter((i) => i.id !== id);
          this.modal = null;
          this.message = 'Die Zutat wurde gelöscht.';
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.formError = this.errorText(error, 'Löschen fehlgeschlagen. Bitte erneut versuchen.');
          this.cdr.markForCheck();
        },
      });
  }
  private upsert(ingredient: Ingredient): void {
    this.ingredients = [...this.ingredients.filter((i) => i.id !== ingredient.id), ingredient];
  }
  private errorText(error: unknown, fallback: string): string {
    return apiErrorMessage(error, fallback);
  }
  private emptyForm(): IngredientForm {
    return { name: '', category: 'sonstiges', subcategory: '', defaultUnit: '' };
  }
}
