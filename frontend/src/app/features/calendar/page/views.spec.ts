import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CalendarPage } from './calendar.page';
import { CalendarService } from '../service/calendar.service';
import { TodosService } from '../../todos/service/todos.service';
import { AuthService } from '../../../core/auth/service/auth.service';
import { CalendarEvent } from '../model/calendar.model';
import { Todo } from '../../todos/model/todos.model';

describe('Calendar views: day, week, month', () => {
  const games: CalendarEvent = { id: 'g', title: 'Spieleabend', start: new Date(2026, 10, 6, 19, 0).toISOString(),
    end: new Date(2026, 10, 6, 22, 0).toISOString() };
  const holiday: CalendarEvent = { id: 'h', title: 'Skiferien', allDay: true, start: new Date(2026, 10, 23).toISOString(),
    end: new Date(2026, 10, 27).toISOString() };
  const calendar = {
    getEvents: vi.fn(() => of([games, holiday])),
    getExternalEvents: vi.fn(() => of({ events: [], refreshing: false })),
    getExternalCalendars: vi.fn(() => of([])),
    getSharedCalendars: vi.fn(() => of([])),
    getCleaningTasks: vi.fn(() => of([])),
    updateEvent: vi.fn((id: string, patch: Partial<CalendarEvent>) => of({ ...games, ...patch, id })),
  };
  let page: CalendarPage;

  function create(): CalendarPage {
    const instance = TestBed.createComponent(CalendarPage).componentInstance;
    instance.ngOnInit();
    return instance;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 14, 10, 0));
    TestBed.configureTestingModule({
      imports: [CalendarPage],
      providers: [
        { provide: CalendarService, useValue: calendar },
        { provide: TodosService, useValue: { getUserTodos: () => of([]) } },
        { provide: AuthService, useValue: {} },
      ],
    });
    page = create();
  });

  afterEach(() => { page.ngOnDestroy(); vi.useRealTimers(); localStorage.clear(); });

  it('loads whole weeks of the month and remembers the view', () => {
    expect(page.view).toBe('week');
    expect(page.periodLabel).toBe('9.–15. Nov. 2026');
    page.setView('month');
    expect(calendar.getEvents).toHaveBeenLastCalledWith('2026-10-26', '2026-12-06');
    expect(page.periodLabel).toBe('November 2026');
    expect(page.monthEntries('2026-11-25').map(e => e.title)).toEqual(['Skiferien']); // multi-day all-day
    expect(page.monthEntries('2026-11-27')).toEqual([]); // the end at midnight is exclusive
    page.ngOnDestroy();
    page = create();
    expect(page.view).toBe('month');
  });

  it('steps by day without reloading inside the loaded week', () => {
    page.setView('day');
    const calls = calendar.getEvents.mock.calls.length;
    page.next();
    expect(page.anchorStr).toBe('2026-11-15');
    expect(page.gridDays.map(d => d.dateStr)).toEqual(['2026-11-15']);
    expect(calendar.getEvents.mock.calls.length).toBe(calls);
    page.next();
    expect(page.anchorStr).toBe('2026-11-16');
    expect(calendar.getEvents.mock.calls.length).toBe(calls + 1);
    expect(page.isCurrentWeek).toBe(false);
    page.goToday();
    expect(page.isCurrentWeek).toBe(true);
  });

  it('moves an appointment to another day in the month and keeps its time', () => {
    page.setView('month');
    page.onMonthDragEntry(games);
    page.onMonthDrop('2026-11-07');
    const patch = calendar.updateEvent.mock.calls[0][1] as CalendarEvent;
    expect(new Date(patch.start).getDate()).toBe(7);
    expect(new Date(patch.start).getHours()).toBe(19);
    expect(new Date(patch.end!).getHours()).toBe(22);
  });

  it('opens the plan dialog for a task dropped on a day', () => {
    const task = { id: 't', title: 'Velo flicken', done: false, durationMinutes: 45 } as Todo;
    page.setView('month');
    page.onTodoDragstart({ dataTransfer: { setData: () => undefined, effectAllowed: '' } } as unknown as DragEvent, task);
    page.onMonthDrop('2026-11-20');
    expect(page.planTodo).toBe(task);
    expect(page.planForm.date).toBe('2026-11-20');
  });

  it('opens a day from the week and the month', () => {
    page.openDay('2026-11-12');
    expect([page.view, page.anchorStr]).toEqual(['day', '2026-11-12']);
    page.setView('month');
    page.openDay('2026-11-30');
    expect([page.view, page.anchorStr]).toEqual(['day', '2026-11-30']);
  });

  it('answers to the keyboard but not while typing or with a dialog open', () => {
    const key = (k: string, target: Element = document.body) => {
      const event = new KeyboardEvent('keydown', { key: k, cancelable: true });
      Object.defineProperty(event, 'target', { value: target });
      page.onKey(event);
    };
    key('d');
    expect(page.view).toBe('day');
    key('ArrowLeft');
    expect(page.anchorStr).toBe('2026-11-13');
    key('m', document.createElement('input'));
    expect(page.view).toBe('day');
    page.showModal = true;
    key('m');
    expect(page.view).toBe('day');
  });

  it('swipes to the next or previous day on phones only', () => {
    const touch = (x: number, y: number) => ({ clientX: x, clientY: y });
    const swipe = (from: number, to: number) => {
      page.onSwipeStart({ touches: [touch(from, 300)], target: document.body } as unknown as TouchEvent);
      page.onSwipeEnd({ changedTouches: [touch(to, 310)] } as unknown as TouchEvent);
    };
    page.setView('day');
    swipe(300, 100);
    expect(page.anchorStr).toBe('2026-11-14'); // not compact
    page.compact = true;
    swipe(300, 100);
    expect(page.anchorStr).toBe('2026-11-15');
    swipe(100, 300);
    swipe(100, 130); // too short
    expect(page.anchorStr).toBe('2026-11-14');
  });
});
