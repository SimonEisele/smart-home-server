import { Injectable } from '@angular/core';
import { Todo, TodoCompletion, TodoPerson } from '../model/todos.model';
import { Observable, map } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TodosService {
  constructor(private http: HttpClient) {}

  getUserTodos(): Observable<Todo[]> {
    return this.http.get<{ data: Todo[] }>(`${environment.apiUrl}/todos/`).pipe(
      map(res => res.data)
    );
  }

  addTodo(todo: Partial<Todo>): Observable<Todo> {
    return this.http.post<{ data: Todo }>(`${environment.apiUrl}/todos/`, todo).pipe(
      map(res => res.data)
    );
  }

  updateTodo(id: string, patch: Partial<Todo>): Observable<Todo> {
    return this.http.patch<{ data: Todo }>(`${environment.apiUrl}/todos/${id}/`, patch).pipe(
      map(res => res.data)
    );
  }

  /** One-off tasks become done; recurring tasks move on to their next occurrence. */
  completeTodo(id: string, date?: string): Observable<TodoCompletion> {
    return this.http.post<TodoCompletion>(`${environment.apiUrl}/todos/${id}/complete/`, date ? { date } : {});
  }

  /** WG members who can be responsible for a task. */
  getPeople(): Observable<TodoPerson[]> {
    return this.http.get<{ data: TodoPerson[] }>(`${environment.apiUrl}/calendar/people/`).pipe(map(res => res.data));
  }

  deleteTodo(id: string): Observable<void> {
    return this.http.delete<{ success: boolean }>(`${environment.apiUrl}/todos/${id}/`).pipe(
      map(() => void 0)
    );
  }
}
