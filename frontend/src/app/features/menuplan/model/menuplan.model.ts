import { Recipe } from '../../recipes/model/recipes.model';

export interface MenuRating {
  cookingDurationMinutes?: number | null;
  easeRating?: number | null;
  pricePerformanceRating?: number | null;
  tasteRating?: number | null;
  notes?: string;
}

export interface Menu {
  id: string;
  date: string;
  breakfastRecipeId?: string | null;
  lunchRecipeId?: string | null;
  dinnerRecipeId?: string | null;
  breakfastRecipe?: Recipe | null;
  lunchRecipe?: Recipe | null;
  dinnerRecipe?: Recipe | null;
  breakfastLeftoversRef?: string | null;
  lunchLeftoversRef?: string | null;
  dinnerLeftoversRef?: string | null;
  lunchPersons?: number;
  dinnerPersons?: number;
  breakfastPersons?: number;
  extraRecipeIds?: string[];
  extraRecipes?: Recipe[];
  rating?: MenuRating | null;
}