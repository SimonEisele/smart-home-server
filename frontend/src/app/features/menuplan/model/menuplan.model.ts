export interface Ingredient {
  name: string;
  quantityPerPerson: number;
  unit: string;
}

export interface Dish {
  id: number;
  name: string;
  recipe?: string;
  ingredients: Ingredient[];
}

export interface Menu {
  id: number;
  date: string;
  lunch?: Dish;
  dinner?: Dish;
}