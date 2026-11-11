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
  createdBy?: string | null;
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
