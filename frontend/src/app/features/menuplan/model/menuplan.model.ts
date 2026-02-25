export interface Ingredient {
  name: string;
  quantityPerPerson: number;
  unit: string;
}

export interface Dish {
  id: string;
  name: string;
  recipe?: string;
  ingredients: Ingredient[];
}

export interface Menu {
  id: string;
  date: string;
  lunch?: Dish;
  dinner?: Dish;
  lunchPersons?: number;
  dinnerPersons?: number;
}