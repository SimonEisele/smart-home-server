import { Component, Input, Output, EventEmitter, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { Recipe, RecipeSection, RecipeStep } from '../model/recipes.model';
import { RecipeCookService } from '../../../shared/services/recipe-cook.service';

@Component({
  selector: 'app-cook-mode',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cook-mode.html',
  styleUrl: './cook-mode.css',
})
export class CookMode implements OnInit, OnDestroy {
  private _recipe: Recipe | null = null;
  private cookSubscription?: Subscription;
  private hasOpenedRecipe = false;

  @Input()
  set recipe(r: Recipe | null) {
    this._recipe = r;
    if (r) {
      this.hasOpenedRecipe = true;
      this.cookService.open({
        date: this.todayIso(),
        meal: 'dinner',
        recipe: r,
        persons: r.baseServings ?? 1,
        weekTag: this.currentWeekTag(new Date()),
      });
      this.currentStep = 0;
      this.portions = r.baseServings ?? 4;
      this.selectedSectionId = r.sections?.length ? 'picker' : null;
    }
  }
  get recipe(): Recipe | null { return null; }

  @Output() closed = new EventEmitter<void>();

  portions = 2;
  currentStep = 0;
  selectedSectionId: number | null | 'picker' = null;

  constructor(private cookService: RecipeCookService) {}

  ngOnInit(): void {
    this.cookSubscription = this.cookService.slot$.subscribe(slot => {
      if (!slot && this.hasOpenedRecipe) {
        this.hasOpenedRecipe = false;
        this._recipe = null;
        this.closed.emit();
      }
    });
  }

  ngOnDestroy(): void {
    this.cookSubscription?.unsubscribe();
  }

  get showPicker(): boolean { return this.selectedSectionId === 'picker'; }

  get sideNotes() { return this._recipe?.sideNotes ?? []; }

  get servingLabel(): string {
    return this._recipe?.servingType === 'Stücke' ? 'Stk.' : 'Port.';
  }

  get sections(): RecipeSection[] { return this._recipe?.sections ?? []; }

  get currentSectionTitle(): string {
    if (!this.selectedSectionId || this.selectedSectionId === 'picker') return '';
    return this.sections.find(s => s.id === this.selectedSectionId)?.title ?? '';
  }

  stepsForSection(sectionId: number): RecipeStep[] {
    return [...(this._recipe?.steps ?? [])]
      .sort((a, b) => a.order - b.order)
      .filter(s => s.sectionId === sectionId);
  }

  get steps(): RecipeStep[] {
    const all = [...(this._recipe?.steps ?? [])].sort((a, b) => a.order - b.order);
    if (typeof this.selectedSectionId === 'number') {
      return all.filter(s => s.sectionId === this.selectedSectionId);
    }
    return all;
  }

  get step(): RecipeStep | null { return this.steps[this.currentStep] ?? null; }

  get stepIngredients(): Array<{ name: string; qty: number | null; unit: string }> {
    const s = this.step;
    if (!s) return [];
    if (s.ingredients?.length) {
      return s.ingredients
        .filter(i => i.name)
        .map(i => ({
          name: i.name,
          qty: i.quantityPerPerson ? Math.round(i.quantityPerPerson * this.portions * 100) / 100 : null,
          unit: i.unit ?? '',
        }));
    }
    const oldName = (s as any).ingredientName as string | undefined;
    if (oldName) {
      const oldQty = (s as any).quantityPerPerson as number | undefined;
      return [{ name: oldName, qty: oldQty ? Math.round(oldQty * this.portions * 100) / 100 : null, unit: (s as any).unit ?? '' }];
    }
    return [];
  }

  get progress(): number {
    if (!this.steps.length) return 0;
    return ((this.currentStep + 1) / this.steps.length) * 100;
  }

  selectSection(id: number | null): void { this.selectedSectionId = id; this.currentStep = 0; }
  backToPicker(): void { this.selectedSectionId = 'picker'; this.currentStep = 0; }

  next(): void { if (this.currentStep < this.steps.length - 1) this.currentStep++; }
  prev(): void { if (this.currentStep > 0) this.currentStep--; }
  goToStep(i: number): void { this.currentStep = i; }
  adjustPortions(delta: number): void { this.portions = Math.max(1, this.portions + delta); }
  close(): void { this.cookService.close(); }
  onBackdropClick(e: MouseEvent): void { if (e.target === e.currentTarget) this.close(); }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this._recipe || this.showPicker) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); this.next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); this.prev(); }
    if (e.key === 'Escape') this.close();
  }

  private todayIso(): string {
    return new Date().toISOString().split('T')[0];
  }

  private currentWeekTag(date: Date): string {
    const thu = new Date(date);
    thu.setDate(date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1) + 3);
    const year = thu.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const week = Math.ceil(((thu.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }
}
