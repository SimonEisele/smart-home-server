import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { CleaningCompletion, CleaningLog, CleaningPerson, CleaningTask } from '../model/cleaning.model';

@Injectable({ providedIn: 'root' })
export class CleaningService {
  private base = `${environment.apiUrl}/cleaning-tasks`;

  constructor(private http: HttpClient) {}

  getTasks(): Observable<CleaningTask[]> {
    return this.http.get<{ data: CleaningTask[] }>(`${this.base}/`).pipe(
      map(res => res.data)
    );
  }

  createTask(task: Partial<CleaningTask>): Observable<CleaningTask> {
    return this.http.post<{ data: CleaningTask }>(`${this.base}/`, task).pipe(
      map(res => res.data)
    );
  }

  updateTask(id: string, patch: Partial<CleaningTask>): Observable<CleaningTask> {
    return this.http.patch<{ data: CleaningTask }>(`${this.base}/${id}/`, patch).pipe(
      map(res => res.data)
    );
  }

  deleteTask(id: string): Observable<void> {
    return this.http.delete<{ success: boolean }>(`${this.base}/${id}/`).pipe(
      map(() => void 0)
    );
  }

  logCompletion(taskId: string, doneAt: string, note?: string): Observable<CleaningLog> {
    return this.http
      .post<{ data: CleaningLog }>(`${this.base}/${taskId}/logs/`, { doneAt, note: note ?? '' })
      .pipe(map(res => res.data));
  }

  /** Log a completion (by default today and by me) and get the task back with whose turn is next. */
  complete(taskId: string, entry: { doneAt: string; doneBy?: string | null; note?: string }): Observable<CleaningCompletion> {
    return this.http
      .post<{ data: CleaningLog; task: CleaningTask }>(`${this.base}/${taskId}/logs/`, { note: '', ...entry })
      .pipe(map(res => ({ log: res.data, task: res.task })));
  }

  /** Remove a completion; returns the task (the turn goes back if this completion had moved it). */
  undo(logId: string): Observable<CleaningTask> {
    return this.http
      .delete<{ success: boolean; task: CleaningTask }>(`${environment.apiUrl}/cleaning-logs/${logId}/`)
      .pipe(map(res => res.task));
  }

  getPeople(): Observable<CleaningPerson[]> {
    return this.http.get<{ data: CleaningPerson[] }>(`${environment.apiUrl}/calendar/people/`).pipe(map(res => res.data));
  }

  deleteLog(logId: string): Observable<void> {
    return this.http
      .delete<{ success: boolean }>(`${environment.apiUrl}/cleaning-logs/${logId}/`)
      .pipe(map(() => void 0));
  }
}
