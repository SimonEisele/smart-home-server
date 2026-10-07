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
} from '../model/ingredient.model';

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
  status: 'active' | 'archived' | 'all' = 'active';
  loading = false;
  loadError = '';
  message = '';
  modal: 'edit' | 'delete' | null = null;
  selected: Ingredient | null = null;
  form: IngredientForm = this.emptyForm();
  saving = false;
  formError = '';
  constructor(
    private service: RecipesService,
    private cdr: ChangeDetectorRef,
  ) {}
  ngOnInit(): void {
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
  }
  get filtered(): Ingredient[] {
    const q = ingredientKey(this.search);
    return this.ingredients
      .filter(
        (i) =>
          (this.status === 'all' || (this.status === 'archived') === !!i.archived) &&
          (!this.category || i.category === this.category) &&
          (!q ||
            ingredientKey(
              `${i.name} ${i.subcategory} ${this.catLabel(i.category)} ${i.defaultUnit}`,
            ).includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
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
          this.upsert(ingredient);
          this.modal = null;
          this.message = `${ingredient.name} wurde gespeichert.`;
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
  private errorText(error: any, fallback: string): string {
    const details = error?.error;
    if (!details || typeof details !== 'object') return fallback;
    return (
      Object.values(details)
        .flat()
        .filter((v) => typeof v === 'string')
        .join(' ') || fallback
    );
  }
  private emptyForm(): IngredientForm {
    return { name: '', category: 'sonstiges', subcategory: '', defaultUnit: '' };
  }
}
