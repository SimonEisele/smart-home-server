import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MenuService, DishService } from '../service/menuplan.service';
import { Dish, Menu } from '../model/menuplan.model';
import { RecipesService } from '../../recipes/service/recipes.service';
import { Recipe } from '../../recipes/model/recipes.model';

@Component({
  selector: 'menuplan.page',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './menuplan.page.html',
  styleUrl: './menuplan.page.css',
})
export class MenuplanPage {
  weekStart!: Date;
  days: { date: Date; dateStr: string }[] = [];
  recipes: Recipe[] = [];
  menus: Record<string, Menu> = {};

  constructor(
    private menuService: MenuService,
    private dishService: DishService,
    private recipesService: RecipesService
  ) {
    this.initWeek(new Date());
    this.recipesService.getRecipes().subscribe(r => (this.recipes = r));
    this.menuService.getMenus().subscribe(list => {
      // Map menus by date for quick access
      this.menus = list.reduce((acc, m) => ({ ...acc, [m.date]: m }), {} as Record<string, Menu>);
    });
    // Seed mock menus for the current week if empty
    this.menuService.generateMockMenus(this.weekStart, 7);
  }

  initWeek(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day; // convert week start to Monday
    d.setDate(d.getDate() + diffToMonday);
    this.weekStart = d;
    this.days = Array.from({ length: 7 }, (_, i) => {
      const di = new Date(d);
      di.setDate(d.getDate() + i);
      return { date: di, dateStr: di.toISOString().split('T')[0] };
    });
  }

  prevWeek() {
    const d = new Date(this.weekStart);
    d.setDate(d.getDate() - 7);
    this.initWeek(d);
    this.menuService.generateMockMenus(this.weekStart, 7);
  }

  nextWeek() {
    const d = new Date(this.weekStart);
    d.setDate(d.getDate() + 7);
    this.initWeek(d);
    this.menuService.generateMockMenus(this.weekStart, 7);
  }

  getMenu(dateStr: string): Menu | undefined {
    return this.menus[dateStr];
  }

  updateLunch(dateStr: string, recipeId: string) {
    const recipe = this.recipes.find(r => r.id === recipeId);
    const lunch: Dish | undefined = recipe
      ? { id: recipe.id, name: recipe.name, ingredients: recipe.ingredients.map(i => ({ name: i.name, quantityPerPerson: i.quantityPerPerson ?? 0, unit: i.unit ?? '' })) }
      : undefined;
    this.menuService.setMenuForDate(dateStr, { lunch });
  }

  updateDinner(dateStr: string, recipeId: string) {
    const recipe = this.recipes.find(r => r.id === recipeId);
    const dinner: Dish | undefined = recipe
      ? { id: recipe.id, name: recipe.name, ingredients: recipe.ingredients.map(i => ({ name: i.name, quantityPerPerson: i.quantityPerPerson ?? 0, unit: i.unit ?? '' })) }
      : undefined;
    this.menuService.setMenuForDate(dateStr, { dinner });
  }

  updateLunchPersons(dateStr: string, persons: number) {
    this.menuService.setMenuForDate(dateStr, { lunchPersons: persons });
  }

  updateDinnerPersons(dateStr: string, persons: number) {
    this.menuService.setMenuForDate(dateStr, { dinnerPersons: persons });
  }

}
