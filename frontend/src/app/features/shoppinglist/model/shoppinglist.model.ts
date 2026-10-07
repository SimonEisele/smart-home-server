export interface ShoppingItem {
  id: string;
  name: string;
  quantity?: number | null;
  quantityIncomplete?: boolean;
  unit?: string;
  category?: string;
  imageUrl?: string;
  suggestion?: string;
  checked: boolean;
  globalItem?: boolean;
  listType?: string; // 'manual' | 'menuplan'
  weekTag?: string; // e.g. '2026-W27'
  createdAt?: string;
  updatedAt?: string;
}
