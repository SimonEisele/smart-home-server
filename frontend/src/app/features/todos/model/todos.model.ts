export interface Todo {
  id: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  done: boolean;
  startDate?: string | null;
  dueDate?: string | null;
  progress?: number;
  durationMinutes?: number | null;
  recurrence?: '' | 'daily' | 'weekly' | 'monthly';
  recurrenceInterval?: number;
  globalTodo?: boolean;
  /** Who takes care of a WG task. */
  assignedTo?: string | null;
  assignedToName?: string | null;
  /** Area such as "Haushalt" or "Papierkram". */
  category?: string;
  checklist?: ChecklistItem[];
  createdBy?: string | null;
  createdByName?: string | null;
  doneByName?: string | null;
  /** Calendar blocks linked to this task (read-only, from the server). */
  plannedSlots?: PlannedSlot[];
  created_at?: string;
  updated_at?: string;
}

export interface PlannedSlot {
  id: string;
  start: string;
  end?: string | null;
}

/** Result of ticking off a task; `previous` restores it on undo. */
export interface TodoCompletion {
  data: Todo;
  advancedTo: string | null;
  previous: { startDate?: string | null; dueDate?: string | null; done: boolean };
}

export interface ChecklistItem {
  id?: string;
  text: string;
  done: boolean;
}

/** A WG member to assign tasks to. */
export interface TodoPerson { id: string; name: string; isMe: boolean; }

export const CATEGORY_SUGGESTIONS = ['Haushalt', 'Putzen', 'Einkauf', 'Reparatur', 'Papierkram', 'Garten', 'Organisation'];
