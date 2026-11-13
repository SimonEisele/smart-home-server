import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CalendarPage } from './calendar.page';
import { CalendarService } from '../service/calendar.service';
import { TodosService } from '../../todos/service/todos.service';
import { AuthService } from '../../../core/auth/service/auth.service';
import { CalendarEvent, ExternalCalendar } from '../model/calendar.model';

describe('Calendar with linked calendars', () => {
  const work: ExternalCalendar = { id: 'work', name: 'Arbeit', color: '#0ea5e9', visibility: 'private', enabled: true,
    ownerName: 'Simon', isOwner: true, lastSyncedAt: '2026-11-13T08:00:00Z' };
  const lisa: ExternalCalendar = { id: 'lisa', name: 'Uni', color: '#ec4899', visibility: 'busy', enabled: true,
    ownerName: 'Lisa', isOwner: false };
  const own: CalendarEvent = { id: 'a', title: 'WG-Sitzung', start: '2026-11-10T18:00:00', end: '2026-11-10T19:00:00' };
  const meeting: CalendarEvent = { id: 'ext-1', calendarId: 'work', source: 'external', title: 'Team-Meeting',
    start: '2026-11-10T09:00:00', end: '2026-11-10T10:00:00', location: 'Büro' };
  const busy: CalendarEvent = { id: 'ext-2', calendarId: 'lisa', source: 'external', title: 'Belegt', busyOnly: true,
    start: '2026-11-10T13:00:00', end: '2026-11-10T15:00:00' };
  const holiday: CalendarEvent = { id: 'ext-3', calendarId: 'work', source: 'external', title: 'Ferien', allDay: true,
    start: '2026-11-11T00:00:00', end: '2026-11-14T00:00:00' };
  const calendar = {
    getEvents: vi.fn(() => of([own])),
    getExternalEvents: vi.fn(() => of({ events: [meeting, busy, holiday], refreshing: false })),
    getExternalCalendars: vi.fn(() => of([work, lisa])),
    getCleaningTasks: vi.fn(() => of([])),
  };
  let page: CalendarPage;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CalendarPage],
      providers: [
        { provide: CalendarService, useValue: calendar },
        { provide: TodosService, useValue: { getUserTodos: () => of([]) } },
        { provide: AuthService, useValue: {} },
      ],
    });
    page = TestBed.createComponent(CalendarPage).componentInstance;
    (page as unknown as { initWeek(d: Date): void }).initWeek(new Date(2026, 10, 10));
    (page as unknown as { load(): void }).load();
  });

  afterEach(() => { page.ngOnDestroy(); localStorage.clear(); });

  it('shows linked appointments next to the WG ones, sorted by time, with where they come from', () => {
    expect(page.eventsForDay('2026-11-10').map(e => e.title)).toEqual(['Team-Meeting', 'Belegt', 'WG-Sitzung']);
    expect(page.sourceLabel(meeting)).toBe('Arbeit');
    expect(page.sourceLabel(busy)).toBe('Lisa · Uni');
    expect(page.sourceLabel(own)).toBe('WG');
    expect(page.evClass(busy)).toContain('ev-busy');
  });

  it('spreads linked all-day appointments over every day they cover', () => {
    const days = ['2026-11-10', '2026-11-11', '2026-11-13', '2026-11-14'];
    expect(days.map(d => page.allDayEventsForDay(d).length)).toEqual([0, 1, 1, 0]);
  });

  it('hides a linked calendar from its chip and remembers it', () => {
    page.toggleCalendar('lisa');
    expect(page.eventsForDay('2026-11-10').map(e => e.title)).toEqual(['Team-Meeting', 'WG-Sitzung']);
    expect(JSON.parse(localStorage.getItem('calendar:hidden-linked')!)).toEqual(['lisa']);
  });

  it('opens linked appointments read only and never drags them', () => {
    const drag = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent;
    page.onEvDragstart(drag, meeting);
    expect(drag.preventDefault).toHaveBeenCalled();
    expect(page.dragEvent).toBeNull();
    page.onEvClick(meeting, new MouseEvent('click'));
    expect(page.externalDetail).toBe(meeting);
    expect(page.showModal).toBe(false);
    expect(page.externalWhen(holiday)).toBe('Mi 11.11. – Fr 13.11., ganztägig');
  });

  it('asks again once when the linked calendars are still refreshing', () => {
    vi.useFakeTimers();
    calendar.getExternalEvents.mockReturnValueOnce(of({ events: [], refreshing: true }));
    page.nextWeek();
    const calls = calendar.getExternalEvents.mock.calls.length;
    vi.advanceTimersByTime(8000);
    expect(calendar.getExternalEvents.mock.calls.length).toBe(calls + 1);
    vi.useRealTimers();
  });
});
