export interface RecipeIngredient {
  name: string;
  quantityPerPerson?: number;
  unit?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  durationMinutes?: number;
  ingredients: RecipeIngredient[];
  createdAt?: string;
  updatedAt?: string;
}
