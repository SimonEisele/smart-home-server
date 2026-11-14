import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { provideRouter } from '@angular/router';
import { TodoEditor } from './todo-editor';
import { TodosService } from '../service/todos.service';
import { Todo } from '../model/todos.model';

describe('Task editor', () => {
  const service = { addTodo: vi.fn(), updateTodo: vi.fn(), deleteTodo: vi.fn(), completeTodo: vi.fn() };

  function create(todo: Todo | null = null, defaults = {}) {
    TestBed.configureTestingModule({ imports: [TodoEditor],
      providers: [{ provide: TodosService, useValue: service }, provideRouter([])] });
    const editor = TestBed.createComponent(TodoEditor).componentInstance;
    editor.todo = todo;
    editor.defaults = defaults;
    editor.people = [{ id: 'me', name: 'Simon', isMe: true }, { id: 'lisa', name: 'Lisa', isMe: false }];
    editor.ngOnInit();
    return editor;
  }

  beforeEach(() => vi.clearAllMocks());

  it('creates a WG task with person, due date, steps, area and duration', () => {
    const editor = create(null, { title: 'Keller' });
    const saved = vi.fn();
    editor.saved.subscribe(saved);
    editor.form.assignedTo = 'lisa';
    editor.setDue('2026-11-21');
    editor.newStep = 'Kisten'; editor.addStep();
    editor.newStep = 'Velo raus';
    editor.pickCategory('Haushalt');
    editor.setDuration(60);
    service.addTodo.mockReturnValue(of({ id: 'k', title: 'Keller', done: false }));
    editor.save();
    const payload = service.addTodo.mock.calls[0][0];
    expect(payload).toMatchObject({ title: 'Keller', globalTodo: true, assignedTo: 'lisa', category: 'Haushalt',
      durationMinutes: 60, recurrence: '', recurrenceInterval: 1 });
    expect(payload.checklist.map((i: { text: string }) => i.text)).toEqual(['Kisten', 'Velo raus']); // typed step is kept
    const due = new Date(payload.dueDate);
    expect([due.getDate(), due.getHours()]).toEqual([21, 23]);
    expect(saved).toHaveBeenCalled();
  });

  it('drops the person for private tasks and clears removed values when editing', () => {
    const editor = create({ id: 't', title: 'Bad', done: false, globalTodo: true, assignedTo: 'lisa',
      startDate: '2026-10-04T12:00:00Z', dueDate: '2026-10-06T12:00:00Z', durationMinutes: 90 });
    expect(editor.customDuration).toBe(true);
    expect([editor.durH, editor.durM]).toEqual([1, 30]);
    editor.setShared(false);
    editor.form.startDate = ''; editor.setDue(''); editor.setDuration(null);
    service.updateTodo.mockReturnValue(of({ id: 't', title: 'Bad', done: false }));
    editor.save();
    expect(service.updateTodo.mock.calls[0][1]).toMatchObject({ assignedTo: null, globalTodo: false, startDate: null,
      dueDate: null, durationMinutes: null });
  });

  it('validates and keeps the input after a failed save, sending only once', () => {
    const editor = create();
    editor.save();
    expect(editor.errors.title).toBeTruthy();
    editor.form.title = 'Fenster';
    editor.form.startDate = '2026-10-08'; editor.setDue('2026-10-07');
    editor.save();
    expect(editor.errors.dueDate).toBeTruthy();
    editor.form.startDate = '';
    const pending = new Subject<Todo>();
    service.addTodo.mockReturnValue(pending);
    editor.save(); editor.save();
    expect(service.addTodo).toHaveBeenCalledTimes(1);
    pending.error(new Error('offline'));
    expect(editor.formError).toContain('Eingaben');
    expect(editor.form.title).toBe('Fenster');
    expect(editor.saving).toBe(false);
  });

  it('reorders and removes steps', () => {
    const editor = create({ id: 't', title: 'X', done: false,
      checklist: [{ id: '1', text: 'a', done: true }, { id: '2', text: 'b', done: false }] });
    editor.moveStep(1, -1);
    expect(editor.form.checklist.map(i => i.text)).toEqual(['b', 'a']);
    editor.removeStep(0);
    expect(editor.progress).toEqual({ done: 1, total: 1 });
  });

  it('completes through the server and asks before deleting', () => {
    const editor = create({ id: 't', title: 'X', done: false });
    const completed = vi.fn(), deleted = vi.fn();
    editor.completed.subscribe(completed);
    editor.deleted.subscribe(deleted);
    service.completeTodo.mockReturnValue(of({ data: { id: 't', title: 'X', done: true }, advancedTo: null, previous: { done: false } }));
    editor.complete();
    expect(completed).toHaveBeenCalled();
    service.deleteTodo.mockReturnValue(of(undefined));
    editor.remove();
    expect(service.deleteTodo).not.toHaveBeenCalled();
    editor.remove();
    expect(deleted).toHaveBeenCalledWith('t');
    service.deleteTodo.mockReturnValue(throwError(() => new Error('x')));
  });
});
