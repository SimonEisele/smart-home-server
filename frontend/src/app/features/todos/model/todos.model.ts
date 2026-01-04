export interface Todo {
  id: number;
  title: string;
  done: boolean;
  startDate?: string;
  dueDate?: string;
  progress?: number;
  durationMinutes?: number;
  userID: string;
}