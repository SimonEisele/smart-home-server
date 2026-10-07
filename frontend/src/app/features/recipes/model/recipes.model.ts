export interface RecipeSection {
  id: number;
  title: string;
}

export interface RecipeSideNote {
  label: string;
  value: string;
}

export interface RecipeStepIngredient {
  recipeIngredientId?: string;
  ingredientId?: number | null;
  name: string;
  quantityPerPerson?: number | null;
  unit?: string;
}

export interface RecipeStep {
  order: number;
  description: string;
  ingredients: RecipeStepIngredient[];
  sectionId?: number;
}

export type { Ingredient } from '../../ingredients/model/ingredient.model';

export interface RecipeIngredient {
  id?: string;
  ingredientId?: number | null;
  name: string;
  quantityPerPerson?: number | null;
  unit?: string;
  sectionId?: number;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  durationMinutes?: number;
  baseServings?: number;
  servingType?: 'Portionen' | 'Stücke';
  unitsPerPerson?: number;
  category?: 'mahlzeit' | 'dessert' | 'backen' | 'snack' | 'beilage' | 'sonstiges';
  sideNotes?: RecipeSideNote[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  sections?: RecipeSection[];
  createdAt?: string;
  updatedAt?: string;
}
