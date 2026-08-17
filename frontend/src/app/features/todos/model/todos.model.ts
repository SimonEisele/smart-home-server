export interface Todo {
  id: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  done: boolean;
  startDate?: string;
  dueDate?: string;
  progress?: number;
  durationMinutes?: number;
  recurrence?: '' | 'daily' | 'weekly' | 'monthly';
  recurrenceInterval?: number;
  globalTodo?: boolean;
  createdBy?: string | null;
  doneByName?: string | null;
  created_at?: string;
  updated_at?: string;
}