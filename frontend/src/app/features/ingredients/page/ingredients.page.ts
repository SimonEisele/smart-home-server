import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RecipesService } from '../../recipes/service/recipes.service';
import { Ingredient } from '../../recipes/model/recipes.model';

interface IngForm { name: string; category: string; subcategory: string; defaultUnit: string; }

@Component({
  selector: 'app-ingredients-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ingredients.page.html',
  styleUrl: './ingredients.page.css',
})
export class IngredientsPage implements OnInit {
  ingredients: Ingredient[] = [];
  search = '';
  showAddForm = false;
  addForm: IngForm = this.emptyForm();
  savingAdd = false;
  editId: number | null = null;
  editForm: IngForm = this.emptyForm();
  confirmDeleteId: number | null = null;

  readonly CATEGORIES = [
    { value: 'gemuese',        label: 'Gemüse' },
    { value: 'obst',           label: 'Obst' },
    { value: 'fleisch',        label: 'Fleisch & Fisch' },
    { value: 'milch',          label: 'Milchprodukte' },
    { value: 'getreide',       label: 'Getreide & Backwaren' },
    { value: 'huelsenfruechte',label: 'Hülsenfrüchte' },
    { value: 'gewuerze',       label: 'Gewürze & Kräuter' },
    { value: 'oele',           label: 'Öle & Fette' },
    { value: 'saucen',         label: 'Saucen & Konserven' },
    { value: 'sonstiges',      label: 'Sonstiges' },
  ];

  constructor(private service: RecipesService) {}

  ngOnInit(): void {
    this.service.getIngredients().subscribe(list => { this.ingredients = list; });
  }

  get filtered(): Ingredient[] {
    const q = this.search.toLowerCase().trim();
    if (!q) return this.ingredients;
    return this.ingredients.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.subcategory ?? '').toLowerCase().includes(q) ||
      this.catLabel(i.category).toLowerCase().includes(q)
    );
  }

  get grouped(): Array<{ value: string; label: string; items: Ingredient[] }> {
    const items = this.filtered;
    return this.CATEGORIES
      .map(cat => ({ ...cat, items: items.filter(i => i.category === cat.value) }))
      .filter(g => g.items.length > 0);
  }

  trackByCategory(_i: number, g: { value: string }): string { return g.value; }
  trackByIngId(_i: number, ing: Ingredient): number { return ing.id; }

  catLabel(value: string): string {
    return this.CATEGORIES.find(c => c.value === value)?.label ?? value;
  }

  openAdd(): void {
    this.showAddForm = true;
    this.addForm = this.emptyForm();
    this.editId = null;
  }

  cancelAdd(): void { this.showAddForm = false; }

  saveAdd(): void {
    if (!this.addForm.name.trim()) return;
    this.savingAdd = true;
    this.service.createIngredient({
      name: this.addForm.name.trim(),
      category: this.addForm.category,
      subcategory: this.addForm.subcategory.trim(),
      defaultUnit: this.addForm.defaultUnit.trim(),
    }).subscribe({
      next: ing => {
        this.ingredients = [...this.ingredients, ing]
          .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
        this.showAddForm = false;
        this.savingAdd = false;
      },
      error: () => { this.savingAdd = false; },
    });
  }

  startEdit(ing: Ingredient): void {
    this.editId = ing.id;
    this.editForm = { name: ing.name, category: ing.category, subcategory: ing.subcategory ?? '', defaultUnit: ing.defaultUnit ?? '' };
    this.showAddForm = false;
    this.confirmDeleteId = null;
  }

  cancelEdit(): void { this.editId = null; }

  saveEdit(): void {
    if (!this.editId || !this.editForm.name.trim()) return;
    this.service.updateIngredient(this.editId, {
      name: this.editForm.name.trim(),
      category: this.editForm.category,
      subcategory: this.editForm.subcategory.trim(),
      defaultUnit: this.editForm.defaultUnit.trim(),
    }).subscribe({
      next: updated => {
        this.ingredients = this.ingredients.map(i => i.id === updated.id ? updated : i);
        this.editId = null;
      },
    });
  }

  confirmDelete(id: number): void { this.confirmDeleteId = id; this.editId = null; }
  cancelDelete(): void { this.confirmDeleteId = null; }

  doDelete(id: number): void {
    this.service.deleteIngredient(id).subscribe({
      next: () => {
        this.ingredients = this.ingredients.filter(i => i.id !== id);
        this.confirmDeleteId = null;
      },
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.editId) this.editId = null;
    else if (this.showAddForm) this.showAddForm = false;
    else if (this.confirmDeleteId) this.confirmDeleteId = null;
  }

  private emptyForm(): IngForm {
    return { name: '', category: 'sonstiges', subcategory: '', defaultUnit: '' };
  }
}
