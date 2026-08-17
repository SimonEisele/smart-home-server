export interface RecipeSection {
  id: number;
  title: string;
}

export interface RecipeSideNote {
  label: string;
  value: string;
}

export interface RecipeStepIngredient {
  name: string;
  quantityPerPerson?: number;
  unit?: string;
}

export interface RecipeStep {
  order: number;
  description: string;
  ingredients: RecipeStepIngredient[];
  sectionId?: number;
}

export interface Ingredient {
  id: number;
  name: string;
  category: string;
  subcategory: string;
  defaultUnit: string;
}

export interface RecipeIngredient {
  name: string;
  quantityPerPerson?: number;
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
