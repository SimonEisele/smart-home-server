export interface ShoppingItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  checked: boolean;
  userID?: string;
  global?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
