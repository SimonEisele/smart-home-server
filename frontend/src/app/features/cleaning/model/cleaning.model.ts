export type CleaningCategory = 'bathroom' | 'kitchen' | 'living_room' | 'bedroom' | 'hallway' | 'other';

export interface CleaningLog {
  id: string;
  task: string;
  doneAt: string;
  doneBy?: string | null;
  doneByName?: string | null;
  note?: string;
  created_at?: string;
}

export interface CleaningTask {
  id: string;
  name: string;
  description?: string;
  category: CleaningCategory;
  intervalDays: number;
  color?: string;
  isActive?: boolean;
  logs?: CleaningLog[];
  lastDoneAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
