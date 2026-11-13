import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CalendarEvent, ExternalCalendar, ExternalMealGuest, HouseholdMember, MemberAvailability, UserMealAttendance } from '../model/calendar.model';
import { CleaningTask } from '../../cleaning/model/cleaning.model';

@Injectable({ providedIn: 'root' })
export class CalendarService {
  constructor(private http: HttpClient) {}

  getEvents(start: string, end: string): Observable<CalendarEvent[]> {
    return this.http
      .get<{ data: CalendarEvent[] }>(`${environment.apiUrl}/calendar-events/?start=${start}&end=${end}`)
      .pipe(map((res) => res.data));
  }

  createEvent(event: Partial<CalendarEvent>): Observable<CalendarEvent> {
    return this.http.post<{ data: CalendarEvent }>(`${environment.apiUrl}/calendar-events/`, event).pipe(
      map((res) => res.data)
    );
  }

  updateEvent(id: string, patch: Partial<CalendarEvent>): Observable<CalendarEvent> {
    return this.http.patch<{ data: CalendarEvent }>(`${environment.apiUrl}/calendar-events/${id}/`, patch).pipe(
      map((res) => res.data)
    );
  }

  deleteEvent(id: string): Observable<void> {
    return this.http.delete<{ success: boolean }>(`${environment.apiUrl}/calendar-events/${id}/`).pipe(
      map(() => void 0)
    );
  }

  // ── Linked calendars ────────────────────────────────────────────────────
  getExternalCalendars(): Observable<ExternalCalendar[]> {
    return this.http.get<{ data: ExternalCalendar[] }>(`${environment.apiUrl}/calendar/external/`).pipe(map(r => r.data));
  }

  createExternalCalendar(calendar: Partial<ExternalCalendar>): Observable<ExternalCalendar> {
    return this.http.post<{ data: ExternalCalendar }>(`${environment.apiUrl}/calendar/external/`, calendar)
      .pipe(map(r => r.data));
  }

  updateExternalCalendar(id: string, patch: Partial<ExternalCalendar>): Observable<ExternalCalendar> {
    return this.http.patch<{ data: ExternalCalendar }>(`${environment.apiUrl}/calendar/external/${id}/`, patch)
      .pipe(map(r => r.data));
  }

  deleteExternalCalendar(id: string): Observable<void> {
    return this.http.delete(`${environment.apiUrl}/calendar/external/${id}/`).pipe(map(() => void 0));
  }

  syncExternalCalendar(id: string): Observable<ExternalCalendar> {
    return this.http.post<{ data: ExternalCalendar }>(`${environment.apiUrl}/calendar/external/${id}/sync/`, {})
      .pipe(map(r => r.data));
  }

  /** Occurrences from linked calendars; `refreshing` means newer data arrives in a few seconds. */
  getExternalEvents(start: string, end: string): Observable<{ events: CalendarEvent[]; refreshing: boolean }> {
    return this.http
      .get<{ data: CalendarEvent[]; refreshing?: boolean }>(
        `${environment.apiUrl}/calendar/external-events/?start=${start}&end=${end}`)
      .pipe(map(r => ({ events: r.data.map(e => ({ ...e, source: 'external' as const })), refreshing: !!r.refreshing })));
  }

  /** Personal subscription link of the WG calendar (absolute URL). */
  getFeedLink(renew = false): Observable<string> {
    const url = `${environment.apiUrl}/calendar/feed/`;
    const request = renew ? this.http.post<{ data: { path: string } }>(url, {}) : this.http.get<{ data: { path: string } }>(url);
    return request.pipe(map(r => new URL(r.data.path, new URL(environment.apiUrl, window.location.origin)).href));
  }

  getMembers(): Observable<HouseholdMember[]> {
    return this.http.get<{ data: HouseholdMember[] }>(`${environment.apiUrl}/household-members/`).pipe(
      map((res) => res.data)
    );
  }

  createMember(member: Partial<HouseholdMember>): Observable<HouseholdMember> {
    return this.http.post<{ data: HouseholdMember }>(`${environment.apiUrl}/household-members/`, member).pipe(
      map((res) => res.data)
    );
  }

  getAvailabilities(start: string, end: string): Observable<MemberAvailability[]> {
    return this.http
      .get<{ data: MemberAvailability[] }>(`${environment.apiUrl}/member-availabilities/?start=${start}&end=${end}`)
      .pipe(map((res) => res.data));
  }

  upsertAvailability(payload: Partial<MemberAvailability>): Observable<MemberAvailability> {
    if (payload.id) {
      return this.http
        .patch<{ data: MemberAvailability }>(`${environment.apiUrl}/member-availabilities/${payload.id}/`, payload)
        .pipe(map((res) => res.data));
    }

    return this.http
      .post<{ data: MemberAvailability }>(`${environment.apiUrl}/member-availabilities/`, payload)
      .pipe(map((res) => res.data));
  }

  getMealAttendance(start: string, end: string): Observable<UserMealAttendance[]> {
    return this.http
      .get<{ data: UserMealAttendance[] }>(`${environment.apiUrl}/meal-attendance/?start=${start}&end=${end}`)
      .pipe(map((res) => res.data));
  }

  setMealAttendance(date: string, breakfastPresent: boolean, lunchPresent: boolean, dinnerPresent: boolean): Observable<UserMealAttendance> {
    return this.http
      .post<{ data: UserMealAttendance }>(`${environment.apiUrl}/meal-attendance/`, { date, breakfastPresent, lunchPresent, dinnerPresent })
      .pipe(map((res) => res.data));
  }

  deleteMealAttendance(date: string): Observable<void> {
    return this.http
      .delete(`${environment.apiUrl}/meal-attendance/`, { body: { date }, responseType: 'text' })
      .pipe(map(() => void 0));
  }

  getExternalGuests(start: string, end: string): Observable<ExternalMealGuest[]> {
    return this.http
      .get<{ data: ExternalMealGuest[] }>(`${environment.apiUrl}/external-meal-guests/?start=${start}&end=${end}`)
      .pipe(map((res) => res.data));
  }

  addExternalGuest(name: string, date: string, meal: string): Observable<ExternalMealGuest> {
    return this.http
      .post<{ data: ExternalMealGuest }>(`${environment.apiUrl}/external-meal-guests/`, { name, date, meal })
      .pipe(map((res) => res.data));
  }

  removeExternalGuest(id: string): Observable<void> {
    return this.http
      .delete(`${environment.apiUrl}/external-meal-guests/${id}/`, { responseType: 'text' })
      .pipe(map(() => void 0));
  }

  getCleaningTasks(): Observable<CleaningTask[]> {
    return this.http
      .get<{ data: CleaningTask[] }>(`${environment.apiUrl}/cleaning-tasks/`)
      .pipe(map(res => res.data));
  }
}
