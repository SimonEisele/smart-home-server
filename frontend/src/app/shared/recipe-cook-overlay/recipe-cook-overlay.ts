import { DialogDirective } from '../directives/dialog.directive';
import {
  Component,
  ChangeDetectorRef,
  DestroyRef,
  ElementRef,
  ViewChild,
  HostListener,
  OnInit,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RecipeCookService, CookSlot } from '../services/recipe-cook.service';
import { ShoppinglistService } from '../../features/shoppinglist/service/shoppinglist.service';
import { Recipe, RecipeIngredient, RecipeStep } from '../../features/recipes/model/recipes.model';

@Component({
  selector: 'recipe-cook-overlay',
  standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule],
  templateUrl: './recipe-cook-overlay.html',
  styleUrl: './recipe-cook-overlay.css',
})
export class RecipeCookOverlay implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('cookingBody') body?: ElementRef<HTMLElement>;
  @ViewChild('preparation') preparation?: ElementRef<HTMLElement>;
  private revision = 0;
  private exported = new Set<string>();
  slot: CookSlot | null = null;
  addingToShoppingList = false;
  addedMessage = '';
  exportError = '';
  activeTab: 'full' | 'steps' = 'full';
  currentStep = 0;
  selectedSection: number | null = null;
  localPersons = 1;
  localUnitsPerPerson = 1;
  selectedServings = 4;
  checkedIngredients = new Set<string>();
  completedSteps = new Set<number>();
  readonly MEAL_LABELS: Record<string, string> = {
    breakfast: 'Frühstück',
    lunch: 'Mittagessen',
    dinner: 'Abendessen',
  };
  constructor(
    private cookService: RecipeCookService,
    private shoppingService: ShoppinglistService,
    private cdr: ChangeDetectorRef,
  ) {}
  ngOnInit(): void {
    this.cookService.slot$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((slot) => {
      this.revision++;
      this.slot = slot;
      this.addedMessage = '';
      this.exportError = '';
      this.exported.clear();
      this.addingToShoppingList = false;
      this.activeTab = 'full';
      this.currentStep = 0;
      this.selectedSection = null;
      this.checkedIngredients.clear();
      this.completedSteps.clear();
      this.localPersons = slot?.persons ?? 1;
      this.localUnitsPerPerson = slot?.recipe.unitsPerPerson ?? 1;
      this.selectedServings = slot?.servings ?? slot?.recipe.baseServings ?? 4;
      this.cdr.markForCheck();
    });
  }
  get directRecipe(): boolean {
    return this.slot?.source === 'recipe';
  }
  get totalServings(): number {
    return this.directRecipe ? this.selectedServings : this.localPersons * this.localUnitsPerPerson;
  }
  get validQuantity(): boolean {
    return (
      Number.isFinite(this.totalServings) &&
      this.totalServings > 0 &&
      (this.directRecipe || Number.isInteger(this.localPersons))
    );
  }
  get servingLabel(): string {
    return this.slot?.recipe.servingType === 'Stücke' ? 'Stücke' : 'Portionen';
  }
  get scale(): number {
    return this.validQuantity ? this.totalServings / (this.slot?.recipe.baseServings || 4) : 0;
  }
  get steps(): RecipeStep[] {
    return [...(this.slot?.recipe.steps ?? [])]
      .sort((a, b) => a.order - b.order)
      .filter((s) => this.selectedSection == null || s.sectionId === this.selectedSection);
  }
  get step(): RecipeStep | null {
    return this.steps[this.currentStep] ?? null;
  }
  get completedCount(): number {
    return this.steps.filter((s) => this.completedSteps.has(s.order)).length;
  }
  get progress(): number {
    return this.steps.length ? (this.completedCount / this.steps.length) * 100 : 0;
  }
  get ingredients(): Array<{
    key: string;
    name: string;
    qty: string;
    unit: string;
    section: string;
  }> {
    return (this.slot?.recipe.ingredients ?? [])
      .filter(
        (i) =>
          this.selectedSection == null ||
          i.sectionId == null ||
          i.sectionId === this.selectedSection,
      )
      .map((i, index) => ({
        key: i.id ?? `${i.name}:${i.sectionId ?? ''}:${index}`,
        name: i.name,
        qty: this.formatQuantity(i.quantityPerPerson),
        unit: i.unit ?? '',
        section: this.sectionTitle(i.sectionId),
      }));
  }
  get stepIngredients(): Array<{ name: string; qty: string; unit: string }> {
    return (this.step?.ingredients ?? []).map((link) => {
      const amount = this.slot?.recipe.ingredients.find(
        (i) =>
          i.id === link.recipeIngredientId ||
          (!link.recipeIngredientId &&
            i.name === link.name &&
            (i.sectionId == null || i.sectionId === this.step?.sectionId)),
      );
      return {
        name: amount?.name ?? link.name,
        qty: this.formatQuantity(link.quantityPerPerson ?? amount?.quantityPerPerson),
        unit: (link.quantityPerPerson != null ? link.unit : '') || amount?.unit || '',
      };
    });
  }
  sectionTitle(id?: number): string {
    return this.slot?.recipe.sections?.find((s) => s.id === id)?.title ?? '';
  }
  formatQuantity(value?: number | null): string {
    return value == null
      ? 'Nach Bedarf'
      : new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(value * this.scale);
  }
  scaledIngredients(
    recipe: Recipe,
    persons: number,
    unitsPerPerson: number,
  ): Array<{ name: string; qty: string; unit: string }> {
    const scale = (persons * unitsPerPerson) / (recipe.baseServings || 4);
    return recipe.ingredients.map((i: RecipeIngredient) => ({
      name: i.name,
      qty:
        i.quantityPerPerson == null
          ? ''
          : String(Math.round(i.quantityPerPerson * scale * 100) / 100),
      unit: i.unit ?? '',
    }));
  }
  private scrollContent(): void {
    requestAnimationFrame(() => {
      if (this.body) this.body.nativeElement.scrollTop = 0;
      if (this.preparation) this.preparation.nativeElement.scrollTop = 0;
    });
  }
  setTab(tab: 'full' | 'steps'): void { this.activeTab = tab; this.scrollContent(); }
  setSection(id: number | null): void {
    this.selectedSection = id; this.currentStep = 0;
    if (!this.steps.length) this.activeTab = 'full';
    this.scrollContent();
  }
  prevStep(): void { if (this.currentStep > 0) { this.currentStep--; this.scrollContent(); } }
  nextStep(_total?: number): void { if (this.currentStep < this.steps.length - 1) { this.currentStep++; this.scrollContent(); } }
  goToStep(index: number): void {
    if (Number.isInteger(index) && index >= 0 && index < this.steps.length) { this.currentStep = index; this.scrollContent(); }
  }
  completeStep(): void {
    if (!this.step) return;
    this.completedSteps.add(this.step.order);
    this.nextStep();
  }
  toggleComplete(): void {
    if (!this.step) return;
    const order = this.step.order;
    this.completedSteps.has(order)
      ? this.completedSteps.delete(order)
      : this.completedSteps.add(order);
  }
  toggleIngredient(key: string): void {
    this.checkedIngredients.has(key)
      ? this.checkedIngredients.delete(key)
      : this.checkedIngredients.add(key);
  }
  adjustPersons(delta: number): void {
    if (!this.addingToShoppingList) this.localPersons = Math.max(1, this.localPersons + delta);
  }
  adjustUnitsPerPerson(delta: number): void {
    if (!this.addingToShoppingList)
      this.localUnitsPerPerson = Math.max(
        0.1,
        Math.round((this.localUnitsPerPerson + delta) * 10) / 10,
      );
  }
  adjustServings(delta: number): void {
    if (!this.addingToShoppingList)
      this.selectedServings = Math.max(1, this.selectedServings + delta);
  }
  private get exportKey(): string { return `${this.slot?.recipe.id}:${this.totalServings}`; }
  get ingredientsAdded(): boolean {
    return this.exported.has(this.exportKey);
  }
  addToShoppingList(slot: CookSlot): void {
    if (
      slot !== this.slot ||
      this.addingToShoppingList ||
      this.ingredientsAdded ||
      !this.validQuantity
    )
      return;
    const key = this.exportKey,
      revision = this.revision;
    this.addingToShoppingList = true;
    this.exportError = '';
    this.addedMessage = '';
    this.shoppingService
      .addRecipe(
        slot.recipe.id,
        this.directRecipe ? 1 : this.localPersons,
        this.directRecipe ? this.selectedServings : this.localUnitsPerPerson,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (count) => {
          if (revision !== this.revision) return;
          this.addingToShoppingList = false;
          this.exported.add(key);
          this.addedMessage = `${count} Zutaten zur manuellen Einkaufsliste hinzugefügt.`;
          this.cdr.markForCheck();
        },
        error: () => {
          if (revision !== this.revision) return;
          this.addingToShoppingList = false;
          this.exportError = 'Hinzufügen fehlgeschlagen. Bitte erneut versuchen.';
          this.cdr.markForCheck();
        },
      });
  }
  close(): void {
    if (!this.addingToShoppingList) this.cookService.close();
  }
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }
  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (!this.slot) return;
    const element = event.target as HTMLElement;
    if (element?.matches('input,textarea,select')) return;
    if (event.key === 'Escape') this.close();
    if (this.activeTab !== 'steps') return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.nextStep();
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prevStep();
    }
  }
}
