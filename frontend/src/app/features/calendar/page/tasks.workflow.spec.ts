import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CalendarPage } from './calendar.page';
import { CalendarService } from '../service/calendar.service';
import { TodosService } from '../../todos/service/todos.service';
import { CleaningService } from '../../cleaning/service/cleaning.service';
import { AuthService } from '../../../core/auth/service/auth.service';
import { Todo } from '../../todos/model/todos.model';
import { CleaningTask } from '../../cleaning/model/cleaning.model';
import { CalendarEvent } from '../model/calendar.model';
import { buildWeek } from '../utils/calendar.utils';

describe('Calendar tasks and cleaning', () => {
  const calendar = { createEvent: vi.fn(), deleteEvent: vi.fn() };
  const todos = { completeTodo: vi.fn(), updateTodo: vi.fn() };
  const cleaning = { logCompletion: vi.fn(), deleteLog: vi.fn() };
  let page: CalendarPage;

  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      imports: [CalendarPage],
      providers: [
        { provide: CalendarService, useValue: calendar },
        { provide: TodosService, useValue: todos },
        { provide: CleaningService, useValue: cleaning },
        { provide: AuthService, useValue: {} },
      ],
    });
    page = TestBed.createComponent(CalendarPage).componentInstance;
    page.weekDays = buildWeek(new Date()).days;
  });

  it('lists only one-off tasks without a time block under "Noch einplanen"', () => {
    page.todos = [
      { id: 'a', title: 'Offen', done: false },
      { id: 'b', title: 'Wöchentlich', done: false, recurrence: 'weekly', startDate: new Date().toISOString() },
      { id: 'c', title: 'Woanders geplant', done: false, plannedSlots: [{ id: 'x', start: '2099-01-01T10:00:00Z' }] },
      { id: 'd', title: 'Erledigt', done: true },
    ];
    expect(page.openTodos.map(t => t.id)).toEqual(['a']);
  });

  it('moves a recurring task on and restores it on undo', () => {
    const today = page.weekDays.find(d => d.isToday)!.dateStr;
    const task: Todo = { id: 'w', title: 'Altpapier', done: false, recurrence: 'weekly', startDate: `${today}T07:00:00Z` };
    page.todos = [task];
    todos.completeTodo.mockReturnValue(of({ data: { ...task, startDate: '2099-01-08T07:00:00Z' }, advancedTo: '2099-01-08',
      previous: { startDate: task.startDate, dueDate: null, done: false } }));
    todos.updateTodo.mockReturnValue(of(task));
    const item = page.tasksForDay(today)[0];
    page.completeTask(item, today);
    expect(todos.completeTodo).toHaveBeenCalledWith('w', today);
    expect(page.tasksForDay(today)).toEqual([]);
    expect(page.undoAction?.message).toContain('nächstes Mal 8.1.');
    page.undo();
    expect(todos.updateTodo).toHaveBeenCalledWith('w', { startDate: task.startDate, dueDate: null });
    expect(page.todos[0].startDate).toBe(task.startDate);
  });

  it('logs cleaning for the day and can undo it', () => {
    const today = page.weekDays.find(d => d.isToday)!.dateStr;
    const bath: CleaningTask = { id: 'bad', name: 'Bad', category: 'bathroom', intervalDays: 7, isActive: true, lastDoneAt: null };
    page.cleaningTasks = [bath];
    cleaning.logCompletion.mockReturnValue(of({ id: 'log', task: 'bad', doneAt: today }));
    cleaning.deleteLog.mockReturnValue(of(undefined));
    page.completeTask(page.tasksForDay(today)[0], today);
    expect(cleaning.logCompletion).toHaveBeenCalledWith('bad', today);
    expect(page.cleaningTasks[0].lastDoneAt).toBe(today);
    expect(page.tasksForDay(today)).toEqual([]);
    page.undo();
    expect(cleaning.deleteLog).toHaveBeenCalledWith('log');
    expect(page.cleaningTasks[0].lastDoneAt).toBeNull();
  });

  it('plans a long task in blocks with breaks and removes it from the list', () => {
    const task: Todo = { id: 't', title: 'Steuern', done: false, durationMinutes: 180 };
    page.todos = [task];
    calendar.createEvent.mockImplementation((ev: Partial<CalendarEvent>) => of({ ...ev, id: ev.title } as CalendarEvent));
    page.openPlan(task, page.weekDays[2].dateStr, 9);
    expect(page.planForm.blocks).toBe(2);
    page.confirmPlan();
    const starts = calendar.createEvent.mock.calls.map(call => new Date(call[0].start).getHours() * 60 + new Date(call[0].start).getMinutes());
    expect(starts).toEqual([9 * 60, 10 * 60 + 45]);
    expect(calendar.createEvent.mock.calls[1][0].title).toBe('Steuern (2/2)');
    expect(page.planTodo).toBeNull();
    expect(page.openTodos).toEqual([]);
    expect(page.todos[0].plannedSlots?.length).toBe(2);
  });
});
