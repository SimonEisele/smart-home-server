export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string; // ISO-8601
  end?: string;  // ISO-8601
  allDay?: boolean;
  location?: string;
  calendarType?: 'household' | 'private';
  todoRefId?: string | null;
  color?: string;
  source?: 'event' | 'cleaning'; // virtual source flag
  createdAt?: string;
  updatedAt?: string;
}

export interface HouseholdMember {
  id: string;
  name: string;
  color?: string;
  isActive?: boolean;
}

export interface MemberAvailability {
  id: string;
  memberId: string;
  date: string;
  lunchPresent: boolean;
  dinnerPresent: boolean;
  note?: string;
}

export interface UserMealAttendance {
  id: string;
  userId: string;
  userFirstName: string;
  userLastName: string;
  date: string;
  breakfastPresent: boolean;
  lunchPresent: boolean;
  dinnerPresent: boolean;
}

export interface ExternalMealGuest {
  id: string;
  name: string;
  date: string;
  meal: 'breakfast' | 'lunch' | 'dinner';
  created_at: string;
}
