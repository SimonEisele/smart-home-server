import { Component, ChangeDetectorRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RecipeCookService, CookSlot } from '../services/recipe-cook.service';
import { MenuService } from '../../features/menuplan/service/menuplan.service';
import { Recipe, RecipeIngredient } from '../../features/recipes/model/recipes.model';

@Component({
  selector: 'recipe-cook-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './recipe-cook-overlay.html',
  styleUrl: './recipe-cook-overlay.css',
})
export class RecipeCookOverlay implements OnInit {
  slot: CookSlot | null = null;
  addingToShoppingList = false;
  addedMessage = '';
  activeTab: 'full' | 'steps' = 'full';
  currentStep = 0;
  localPersons = 1;
  localUnitsPerPerson = 1;

  readonly MEAL_LABELS: Record<string, string> = { breakfast: 'Frühstück', lunch: 'Mittag', dinner: 'Abendessen' };

  constructor(
    private cookService: RecipeCookService,
    private menuService: MenuService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.cookService.slot$.subscribe(slot => {
      this.slot = slot;
      this.addedMessage = '';
      this.addingToShoppingList = false;
      this.activeTab = 'full';
      this.currentStep = 0;
      this.localPersons = slot ? slot.persons : 1;
      this.localUnitsPerPerson = slot ? (slot.recipe.unitsPerPerson ?? 1) : 1;
      if (slot) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = '';
      }
      this.cdr.detectChanges();
    });
  }

  @HostListener('document:keydown.escape')
  close(): void { this.cookService.close(); }

  onBackdropClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.cookService.close();
  }

  scaledIngredients(recipe: Recipe, persons: number, unitsPerPerson: number): Array<{ name: string; qty: string; unit: string }> {
    const base = recipe.baseServings || 4;
    const scale = (persons * unitsPerPerson) / base;
    return (recipe.ingredients || []).map((ing: RecipeIngredient) => {
      const q = ing.quantityPerPerson != null ? ing.quantityPerPerson * scale : null;
      const fmtQty = q != null ? (Math.round(q * 100) / 100).toString().replace(/\.?0+$/, '') : '';
      return { name: ing.name, qty: fmtQty, unit: ing.unit || '' };
    });
  }

  setTab(tab: 'full' | 'steps'): void {
    this.activeTab = tab;
    this.currentStep = 0;
  }

  prevStep(): void { if (this.currentStep > 0) this.currentStep--; }
  nextStep(total: number): void { if (this.currentStep < total - 1) this.currentStep++; }

  adjustPersons(delta: number): void {
    this.localPersons = Math.max(1, this.localPersons + delta);
  }

  adjustUnitsPerPerson(delta: number): void {
    this.localUnitsPerPerson = Math.max(0.5, Math.round((this.localUnitsPerPerson + delta) * 2) / 2);
  }

  addToShoppingList(slot: CookSlot): void {
    if (this.addingToShoppingList) return;
    this.addingToShoppingList = true;
    this.menuService.exportMeal(slot.date, slot.meal, slot.weekTag).subscribe({
      next: count => {
        this.addingToShoppingList = false;
        this.addedMessage = count > 0 ? `${count} Zutaten hinzugefügt!` : 'Bereits vorhanden.';
        this.cdr.detectChanges();
      },
      error: () => { this.addingToShoppingList = false; this.cdr.detectChanges(); }
    });
  }
}
