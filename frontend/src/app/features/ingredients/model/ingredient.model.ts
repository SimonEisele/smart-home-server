/** Shared catalog identity; amounts belong to individual recipe ingredients. */
export interface Ingredient {
  id: number;
  name: string;
  category: string;
  subcategory: string;
  defaultUnit: string;
  archived?: boolean;
  usageCount?: number;
}

export const INGREDIENT_CATEGORIES = [
  { value: 'gemuese', label: 'Gemüse' },
  { value: 'obst', label: 'Obst' },
  { value: 'fleisch', label: 'Fleisch & Fisch' },
  { value: 'milch', label: 'Milchprodukte' },
  { value: 'getreide', label: 'Getreide & Backwaren' },
  { value: 'huelsenfruechte', label: 'Hülsenfrüchte' },
  { value: 'gewuerze', label: 'Gewürze & Kräuter' },
  { value: 'oele', label: 'Öle & Fette' },
  { value: 'saucen', label: 'Saucen & Konserven' },
  { value: 'sonstiges', label: 'Sonstiges' },
];
export const INGREDIENT_UNITS = [
  '',
  'g',
  'kg',
  'ml',
  'cl',
  'dl',
  'l',
  'Stück',
  'EL',
  'TL',
  'Prise',
  'Bund',
  'Zehe',
  'Dose',
  'Packung',
  'Becher',
  'Scheibe',
  'Stange',
  'Kopf',
  'cm',
];
export function ingredientKey(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');
}
