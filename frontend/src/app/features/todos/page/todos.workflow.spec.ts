import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TodosPage } from './todos.page';
import { TodosService } from '../service/todos.service';
import { AuthService } from '../../../core/auth/service/auth.service';
import { Todo } from '../model/todos.model';

describe('Task editing workflows', () => {
  const service = { getUserTodos: vi.fn(() => of([] as Todo[])), addTodo: vi.fn(), updateTodo: vi.fn(), deleteTodo: vi.fn() };
  let page: TodosPage;
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({ imports: [TodosPage], providers: [
      { provide: TodosService, useValue: service },
      { provide: AuthService, useValue: { ensureAccessToken: () => of('token') } },
    ] }).compileComponents();
    page = TestBed.createComponent(TodosPage).componentInstance;
    page.openAdd(); page.form.title = 'Fenster putzen';
  });
  it('retains the input and dialog after a rejected save', () => {
    service.addTodo.mockReturnValue(throwError(() => new Error('offline')));
    page.save();
    expect(page.showModal).toBe(true); expect(page.form.title).toBe('Fenster putzen');
    expect(page.formError).toContain('Eingaben'); expect(page.saving).toBe(false);
  });
  it('sends only one save while a request is pending', () => {
    const response = new Subject<Todo>(); service.addTodo.mockReturnValue(response);
    page.save(); page.save(); expect(service.addTodo).toHaveBeenCalledTimes(1);
    response.next({ id:'saved', title:'Fenster putzen', done:false }); response.complete();
    expect(page.showModal).toBe(false); expect(page.todos[0].id).toBe('saved');
  });
  it('can clear saved dates and duration rather than omitting them from PATCH', () => {
    page.openEdit({ id:'task', title:'Test', done:false, startDate:'2026-10-04T12:00:00Z', dueDate:'2026-10-06T12:00:00Z', durationMinutes:90 });
    page.form.startDate = ''; page.form.dueDate = ''; page.durH = 0; page.durM = 0;
    service.updateTodo.mockReturnValue(of({ id:'task', title:'Test', done:false })); page.save();
    expect(service.updateTodo.mock.calls[0][1]).toMatchObject({ startDate:null, dueDate:null, durationMinutes:null });
  });
  it('validates date order and treats a due date as the end of the local day', () => {
    page.form.startDate = '2026-10-08'; page.form.dueDate = '2026-10-07'; page.save();
    expect(service.addTodo).not.toHaveBeenCalled(); expect(page.errors.dueDate).toBeTruthy();
    page.form.startDate = ''; service.addTodo.mockReturnValue(of({ id:'new', title:'Test', done:false })); page.save();
    const due = new Date(service.addTodo.mock.calls[0][0].dueDate);
    expect(due.getHours()).toBe(23); expect(due.getDate()).toBe(7);
  });
  it('uses the server response when completing a recurring task', () => {
    const task:Todo = { id:'weekly', title:'Wöchentlich', done:false, recurrence:'weekly' };
    page.todos = [task]; service.updateTodo.mockReturnValue(of({ ...task, dueDate:'2026-10-12T12:00:00Z' }));
    page.toggleDone(task, new Event('click'));
    expect(page.todos[0].done).toBe(false); expect(page.todos[0].dueDate).toBe('2026-10-12T12:00:00Z');
  });
});
