export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string; // ISO-8601
  end?: string;  // ISO-8601
  allDay?: boolean;
  location?: string;
  createdAt?: string;
  updatedAt?: string;
}
