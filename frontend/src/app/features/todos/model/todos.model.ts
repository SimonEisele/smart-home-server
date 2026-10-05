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
  created_at?: string;
  updated_at?: string;
}