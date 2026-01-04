import { Injectable } from '@angular/core';
import { Todo } from '../model/todos.model';
import { BehaviorSubject, combineLatest, map, Observable, of } from 'rxjs';
import { AuthService } from '../../../core/auth/service/auth.service';

@Injectable({ providedIn: 'root' })
export class TodosService {
  private todos$ = new BehaviorSubject<Todo[]>([
    { id: 1, title: 'Müll rausbringen', done: false, startDate: '2025-12-25', dueDate: '2025-12-23', progress: 80, durationMinutes: 30, userID: '1' },
    { id: 2, title: 'Bad putzen', done: false, startDate: '2025-12-25', dueDate: '2025-12-25', progress: 50, durationMinutes: 90, userID: '1'  },
    { id: 3, title: 'Staubsauger reinigen', done: false, startDate: '2025-12-25', dueDate: '2025-12-31', progress: 0, durationMinutes: 90, userID: '1'  },
    { id: 4, title: 'Wocheneinkauf', done: false, startDate: '2025-12-25', dueDate: '2026-01-02', progress: 0, durationMinutes: 90, userID: '1'  },
    { id: 5, title: 'Bad putzen', done: false, startDate: '2025-12-25', dueDate: '2025-12-28', progress: 0, durationMinutes: 90, userID: '1'  },
  ]);

  constructor(private auth: AuthService) {}

  getUserTodos(): Observable<Todo[]> {
    return combineLatest([this.todos$, this.auth.user$] as const).pipe(
      map(([todos, user]: [Todo[], { id: string } | null]) =>
        todos.filter((t: Todo) => t.userID === user?.id)
      )
    );
  }
}
