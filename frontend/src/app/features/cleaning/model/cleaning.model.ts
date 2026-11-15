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
  /** Whose turn it is; with a rotation the server moves it on after each completion. */
  assignedTo?: string | null;
  assignedToName?: string | null;
  /** WG members taking turns, in order (empty: no rotation). */
  rotation?: string[];
  /** Steps as plain text, e.g. "Lavabo", "Spiegel", "Boden". */
  checklist?: string[];
  durationMinutes?: number | null;
  logs?: CleaningLog[];
  lastDoneAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Result of logging or undoing a completion: the task with its new turn. */
export interface CleaningCompletion {
  log: CleaningLog;
  task: CleaningTask;
}

export interface CleaningPerson { id: string; name: string; isMe: boolean; }
