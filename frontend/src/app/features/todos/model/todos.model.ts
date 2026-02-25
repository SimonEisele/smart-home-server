export interface Todo {
  id: string;
  title: string;
  done: boolean;
  startDate?: string;
  dueDate?: string;
  progress?: number;
  durationMinutes?: number;
  userID: string;
  global?: boolean;
}