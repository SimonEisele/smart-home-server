import { FitWidgetContentDirective } from '../../../shared/directives/fit-widget-content.directive';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Todo } from '../model/todos.model';
import { TodosService } from '../service/todos.service';

type DueState = 'overdue' | 'today' | 'tomorrow' | 'later' | 'none';

@Component({
  selector: 'todos-widget',
  standalone: true,
  imports: [FitWidgetContentDirective, DatePipe],
  templateUrl: './todos.widget.html',
  styleUrl: './todos.widget.css',
})
export class TodosWidget implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  openTodos: Todo[] = [];
  loaded = false;

  constructor(private todosService: TodosService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.todosService.getUserTodos().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(todos => {
      this.openTodos = this.sorted(todos.filter(t => !t.done));
      this.loaded = true;
      this.cdr.detectChanges();
    });
  }

  completeTodo(todo: Todo, event: Event): void {
    event.stopPropagation();
    // Optimistic: remove from list immediately
    this.openTodos = this.openTodos.filter(t => t.id !== todo.id);
    this.todosService.updateTodo(todo.id, { done: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        // Recurring todos come back open with their next due date.
        if (!updated.done) this.openTodos = this.sorted([updated, ...this.openTodos]);
        this.cdr.markForCheck();
      },
      error: () => {
        this.openTodos = this.sorted([todo, ...this.openTodos]);
        this.cdr.markForCheck();
      }
    });
  }

  dueState(todo: Todo): DueState {
    if (!todo.dueDate) return 'none';
    const due = this.startOfDay(new Date(todo.dueDate)).getTime();
    const today = this.startOfDay(new Date()).getTime();
    if (due < today) return 'overdue';
    if (due === today) return 'today';
    if (due === today + 86400000) return 'tomorrow';
    return 'later';
  }

  isOverdue(todo: Todo): boolean {
    return this.dueState(todo) === 'overdue';
  }

  isDueToday(todo: Todo): boolean {
    return this.dueState(todo) === 'today';
  }

  /** Todos without a due date go last. */
  private sorted(todos: Todo[]): Todo[] {
    const time = (t: Todo) => t.dueDate ? new Date(t.dueDate).getTime() : Infinity;
    return [...todos].sort((a, b) => time(a) - time(b));
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }
}
