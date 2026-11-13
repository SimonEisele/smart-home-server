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
  source?: 'event' | 'cleaning' | 'external'; // virtual source flag
  /** Linked (external) calendar the occurrence comes from; read only in the app. */
  calendarId?: string;
  /** Someone else's calendar shared as busy times only: no title, place or notes. */
  busyOnly?: boolean;
  /** False when the source marks the time as free. */
  busy?: boolean;
  /** Name ("Lisa · Uni") and colour of the linked calendar. */
  calendarName?: string;
  calendarColor?: string;
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

export type ExternalCalendarVisibility = 'private' | 'busy' | 'shared';

/** A subscribed calendar (Outlook, Google, iCloud … via its iCal link). */
export interface ExternalCalendar {
  id: string;
  name: string;
  /** Only sent to the owner. */
  url?: string;
  color: string;
  visibility: ExternalCalendarVisibility;
  enabled: boolean;
  lastSyncedAt?: string | null;
  lastError?: string;
  eventCount?: number;
  ownerName: string;
  isOwner: boolean;
}

export const VISIBILITY_LABELS: Record<ExternalCalendarVisibility, string> = {
  private: 'Nur ich',
  busy: 'WG sieht «belegt»',
  shared: 'WG sieht alles',
};
