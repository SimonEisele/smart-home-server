import { FitWidgetContentDirective } from '../../../shared/directives/fit-widget-content.directive';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, DestroyRef, inject, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Todo } from '../model/todos.model';
import { TodosService } from '../service/todos.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'todos-widget',
  standalone: true,
  imports: [FitWidgetContentDirective,  CommonModule ],
  templateUrl: './todos.widget.html',
  styleUrl: './todos.widget.css',
})
export class TodosWidget implements OnInit, AfterViewInit, OnDestroy {
  private observer?: ResizeObserver;
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;

  openTodos: Todo[] = [];
  visibleTodos: Todo[] = [];

  readonly MARGIN = 12;

  constructor(private todosService: TodosService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.todosService.getUserTodos().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(todos => {
      this.openTodos = todos
        .filter(t => !t.done)
        .sort((a, b) =>
          new Date(a.dueDate ?? '').getTime() -
          new Date(b.dueDate ?? '').getTime()
        );
      setTimeout(() => { if (!this.destroyRef.destroyed) this.updateVisibleTodos(); });
      this.cdr.detectChanges();
    });
  }

  ngAfterViewInit(): void {
    this.observer = new ResizeObserver(() => {
      setTimeout(() => { if (!this.destroyRef.destroyed) this.updateVisibleTodos(); });
    });

    this.observer.observe(this.container.nativeElement);
    setTimeout(() => { if (!this.destroyRef.destroyed) this.updateVisibleTodos(); });
  }

  ngOnDestroy(): void { this.observer?.disconnect(); }

  updateVisibleTodos() {
    const height = this.container.nativeElement.clientHeight;

    if (height <= 0) return;

    const firstLi = this.container.nativeElement.querySelector('li');
    const rowHeight = firstLi?.getBoundingClientRect().height ?? 48;

    const maxTodos = Math.floor(
      (height + this.MARGIN) / (rowHeight + this.MARGIN)
    );

    this.visibleTodos = this.openTodos.slice(0, Math.max(maxTodos, 1));
    this.cdr.detectChanges();
  }

  completeTodo(todo: Todo, event: Event): void {
    event.stopPropagation();
    // Optimistic: remove from list immediately
    this.openTodos = this.openTodos.filter(t => t.id !== todo.id);
    this.updateVisibleTodos();
    this.todosService.updateTodo(todo.id, { done: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        if (!updated.done) {
          this.openTodos = [updated, ...this.openTodos].sort((a, b) => (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity));
          this.updateVisibleTodos();
        }
      },
      error: () => {
        // Revert on failure
        this.openTodos = [todo, ...this.openTodos].sort(
          (a, b) => new Date(a.dueDate ?? '').getTime() - new Date(b.dueDate ?? '').getTime()
        );
        this.updateVisibleTodos();
      }
    });
  }

  isOverdue(todo: Todo): boolean {
    if (!todo.dueDate) return false;
    const due = new Date(todo.dueDate);
    const now = new Date();
    return due < now && !todo.done && !this.isDueToday(todo);
  }

  isDueToday(todo: Todo): boolean {
    if (!todo.dueDate) return false;
    const due = new Date(todo.dueDate);
    const now = new Date();
    return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate() && !todo.done;
  }
}