import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TodosPage } from './todos.page';
import { TodosService } from '../service/todos.service';
import { AuthService } from '../../../core/auth/service/auth.service';
import { Todo, TodoPerson } from '../model/todos.model';

describe('Task list', () => {
  const people: TodoPerson[] = [{ id: 'me', name: 'Simon', isMe: true }, { id: 'lisa', name: 'Lisa', isMe: false }];
  const service = {
    getUserTodos: vi.fn(() => of([] as Todo[])), getPeople: vi.fn(() => of(people)),
    addTodo: vi.fn(), updateTodo: vi.fn(), deleteTodo: vi.fn(), completeTodo: vi.fn(),
  };
  let page: TodosPage;
  const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(23, 59); return d.toISOString(); };

  beforeEach(async () => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [TodosPage], providers: [
      { provide: TodosService, useValue: service },
      { provide: AuthService, useValue: { ensureAccessToken: () => of('token') } },
    ] }).compileComponents();
    page = TestBed.createComponent(TodosPage).componentInstance;
    page.ngOnInit();
  });

  it('groups open tasks by when they are due, overdue first', () => {
    page.todos = [
      { id: 'later', title: 'Später', done: false, dueDate: day(30) },
      { id: 'none', title: 'Irgendwann', done: false },
      { id: 'late', title: 'Zu spät', done: false, dueDate: day(-2) },
      { id: 'today', title: 'Heute', done: false, dueDate: day(0), priority: 'high' },
      { id: 'done', title: 'Fertig', done: true },
    ];
    expect(page.groups.map(g => [g.key, g.todos.map(t => t.id)])).toEqual([
      ['overdue', ['late']], ['today', ['today']], ['later', ['later']], ['none', ['none']],
    ]);
    page.setFilter({ status: 'all' });
    expect(page.groups.at(-1)?.key).toBe('done');
  });

  it('filters by person, area, WG/Privat and search, with counts, and remembers them', () => {
    page.todos = [
      { id: 'a', title: 'Bad', done: false, globalTodo: true, assignedTo: 'lisa', assignedToName: 'Lisa', category: 'Putzen' },
      { id: 'b', title: 'Altglas', done: false, globalTodo: true },
      { id: 'c', title: 'Steuern', done: false, globalTodo: false, createdBy: 'me', category: 'Papierkram',
        checklist: [{ text: 'Lohnausweis', done: false }] },
      { id: 'd', title: 'Velo', done: false, globalTodo: true, assignedTo: 'me' },
    ];
    page.togglePerson('lisa');
    expect(page.openTodos.map(t => t.id)).toEqual(['a']);
    page.togglePerson('me');
    expect(page.openTodos.map(t => t.id).sort()).toEqual(['c', 'd']);
    expect(page.mineCount).toBe(2);
    page.togglePerson('nobody');
    expect(page.openTodos.map(t => t.id)).toEqual(['b']);
    page.resetFilters();
    page.toggleCategory('Papierkram');
    expect(page.openTodos.map(t => t.id)).toEqual(['c']);
    page.setFilter({ category: '', search: 'lohnaus' });
    expect(page.openTodos.map(t => t.id)).toEqual(['c']);
    expect(page.scopeCount('private')).toBe(1);
    expect(JSON.parse(sessionStorage.getItem('filters:todos')!).search).toBe('lohnaus');
    expect(page.personStats.map(p => [p.name, p.count])).toEqual([['Simon (ich)', 1], ['Lisa', 1], ['Noch niemand', 1]]);
    expect(page.categoryStats.map(c => c.name)).toEqual(['Papierkram', 'Putzen']);
  });

  it('adds a task from the quick entry and offers to complete the details', () => {
    service.addTodo.mockReturnValue(of({ id: 'n', title: 'Keller', done: false, globalTodo: false }));
    page.toggleQuickShared();
    page.quickTitle = '  Keller ';
    page.quickAdd();
    expect(service.addTodo).toHaveBeenCalledWith({ title: 'Keller', globalTodo: false, priority: 'medium' });
    expect(page.todos.map(t => t.id)).toEqual(['n']);
    expect(page.quickTitle).toBe('');
    expect(page.noticeTodo?.id).toBe('n');
    expect(localStorage.getItem('todos:quick-shared')).toBe('false');
    service.addTodo.mockReturnValue(throwError(() => new Error('offline')));
    page.quickTitle = 'Velo';
    page.quickAdd();
    expect(page.quickTitle).toBe('Velo');
    expect(page.quickError).toContain('fehlgeschlagen');
  });

  it('uses the server response when completing a recurring task', () => {
    const task: Todo = { id: 'weekly', title: 'Wöchentlich', done: false, recurrence: 'weekly' };
    page.todos = [task];
    service.completeTodo.mockReturnValue(of({ data: { ...task, dueDate: '2026-10-12T12:00:00Z' }, advancedTo: '2026-10-12',
      previous: { done: false } }));
    page.toggleDone(task, new Event('click'));
    expect(service.completeTodo).toHaveBeenCalledWith('weekly');
    expect(page.todos[0].done).toBe(false);
    expect(page.notice).toContain('nächstes Mal');
  });

  it('reopens a finished task with a plain update', () => {
    const task: Todo = { id: 't', title: 'Velo', done: true };
    page.todos = [task];
    service.updateTodo.mockReturnValue(of({ ...task, done: false }));
    page.toggleDone(task, new Event('click'));
    expect(service.updateTodo).toHaveBeenCalledWith('t', { done: false });
    expect(page.todos[0].done).toBe(false);
  });

  it('opens the editor for new and existing tasks and takes over its results', () => {
    page.quickTitle = 'Fenster';
    page.openAdd();
    expect(page.editing).toBeNull();
    expect(page.editorDefaults).toEqual({ globalTodo: true, title: 'Fenster' });
    page.onSaved({ id: 'f', title: 'Fenster', done: false });
    expect([page.editing, page.todos.length, page.quickTitle]).toEqual([undefined, 1, '']);
    page.openEdit(page.todos[0]);
    page.onDeleted('f');
    expect(page.todos).toEqual([]);
  });

  it('shows when a task is planned in the calendar', () => {
    const task: Todo = { id: 't', title: 'Keller', done: false,
      plannedSlots: [{ id: 'e', start: new Date(2099, 0, 5, 14, 0).toISOString(), end: null }] };
    expect(page.nextSlot(task)?.date).toBe('2099-01-05');
    expect(page.slotLabel(task)).toContain('14:00');
    expect(page.recurrenceLabel({ id: 'r', title: '', done: false, recurrence: 'weekly', recurrenceInterval: 2 }))
      .toBe('Alle 2 Wochen');
  });
});
