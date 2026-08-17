import { Component, OnInit, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TodosService } from '../service/todos.service';
import { Todo } from '../model/todos.model';
import { AuthService } from '../../../core/auth/service/auth.service';
import { switchMap, catchError, of } from 'rxjs';

type FilterMode = 'all' | 'open' | 'done' | 'overdue' | 'global' | 'private';

@Component({
  selector: 'todos-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './todos.page.html',
  styleUrl: './todos.page.css',
})
export class TodosPage implements OnInit {
  todos: Todo[] = [];
  filter: FilterMode = 'all';
  showModal = false;
  modalMode: 'add' | 'edit' = 'add';

  form: Partial<Todo> = this.emptyForm();
  errors: Partial<Record<'title' | 'dueDate' | 'startDate', string>> = {};
  durH = 0;
  durM = 0;

  constructor(private todosService: TodosService, private auth: AuthService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.auth.ensureAccessToken()
      .pipe(
        switchMap(() => this.auth.fetchUser()),
        catchError(() => of(null)),
        switchMap(() => this.todosService.getUserTodos())
      )
      .subscribe({ next: todos => { this.todos = todos; this.cdr.detectChanges(); } });
  }

  // ---- Filtering ----
  get filtered(): Todo[] {
    const now = new Date();
    return this.todos.filter(t => {
      if (this.filter === 'open') return !t.done;
      if (this.filter === 'done') return t.done;
      if (this.filter === 'overdue') return !t.done && !!t.dueDate && new Date(t.dueDate) < now;
      if (this.filter === 'global') return !!t.globalTodo;
      if (this.filter === 'private') return !t.globalTodo;
      return true;
    });
  }

  get openTodos(): Todo[] {
    return this.filtered.filter(t => !t.done);
  }

  get doneTodos(): Todo[] {
    return this.filtered.filter(t => t.done);
  }

  get openCount(): number { return this.todos.filter(t => !t.done).length; }
  get globalCount(): number { return this.todos.filter(t => !!t.globalTodo && !t.done).length; }
  get overdueCount(): number {
    const now = new Date();
    return this.todos.filter(t => !t.done && !!t.dueDate && new Date(t.dueDate!) < now).length;
  }

  // ---- UI helpers ----
  isOverdue(t: Todo): boolean {
    return !t.done && !!t.dueDate && new Date(t.dueDate) < new Date();
  }

  isDueSoon(t: Todo): boolean {
    if (!t.dueDate || t.done) return false;
    const diff = new Date(t.dueDate).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
  }

  priorityLabel(p?: string): string {
    return p === 'high' ? 'Hoch' : p === 'low' ? 'Niedrig' : 'Mittel';
  }

  recurrenceLabel(t: Todo): string {
    if (!t.recurrence) return '';
    const map: Record<string, string> = { daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' };
    const interval = (t.recurrenceInterval ?? 1) > 1 ? ` ×${t.recurrenceInterval}` : '';
    return map[t.recurrence] + interval;
  }

  formatDate(d?: string): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ---- Toggle done inline ----
  toggleDone(todo: Todo, event: Event): void {
    event.stopPropagation();
    // Optimistic update — no waiting for HTTP
    this.todos = this.todos.map(t => t.id === todo.id ? { ...t, done: !t.done } : t);
    this.cdr.detectChanges();
    this.todosService.updateTodo(todo.id, { done: !todo.done }).subscribe({
      error: () => {
        // Revert on failure
        this.todos = this.todos.map(t => t.id === todo.id ? { ...t, done: !t.done } : t);
        this.cdr.detectChanges();
      }
    });
  }

  // ---- Modal ----
  openAdd(): void {
    this.form = this.emptyForm();
    this.errors = {};
    this.durH = 0; this.durM = 0;
    this.modalMode = 'add';
    this.showModal = true;
  }

  openEdit(todo: Todo): void {
    this.form = {
      ...todo,
      startDate: todo.startDate ? todo.startDate.split('T')[0] : '',
      dueDate: todo.dueDate ? todo.dueDate.split('T')[0] : '',
    };
    this.errors = {};
    this.durH = Math.floor((todo.durationMinutes ?? 0) / 60);
    this.durM = (todo.durationMinutes ?? 0) % 60;
    this.modalMode = 'edit';
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.form = this.emptyForm();
    this.errors = {};
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeModal(); }

  save(): void {
    if (!this.form.title?.trim()) return;
    const totalMin = this.durH * 60 + this.durM;
    this.form.durationMinutes = totalMin > 0 ? totalMin : undefined;
    const payload = this.cleanPayload(this.form);
    const mode = this.modalMode;
    const formId = this.form.id;
    this.closeModal();
    if (mode === 'add') {
      this.todosService.addTodo(payload).subscribe({
        next: () => { this.loadData(); },
        error: () => { this.loadData(); },
      });
    } else {
      this.todosService.updateTodo(formId!, payload).subscribe({
        next: () => { this.loadData(); },
        error: () => { this.loadData(); },
      });
    }
  }

  deleteTodo(): void {
    if (!this.form.id) return;
    const id = this.form.id;
    this.closeModal();
    this.todosService.deleteTodo(id).subscribe({
      next: () => { this.loadData(); },
      error: () => { this.loadData(); },
    });
  }

  private cleanPayload(form: Partial<Todo>): Partial<Todo> {
    const p: Partial<Todo> = { ...form };
    if (!p.startDate) delete p.startDate;
    if (!p.dueDate) delete p.dueDate;
    if (p.durationMinutes == null) delete p.durationMinutes;
    if (!p.recurrence) delete p.recurrenceInterval;
    return p;
  }

  private emptyForm(): Partial<Todo> {
    return {
      title: '',
      description: '',
      priority: 'medium',
      done: false,
      startDate: '',
      dueDate: '',
      durationMinutes: undefined,
      progress: 0,
      recurrence: '',
      recurrenceInterval: 1,
      globalTodo: false,
    };
  }

  private validate(t: Partial<Todo>): Partial<Record<'title' | 'dueDate' | 'startDate', string>> {
    const e: Partial<Record<'title' | 'dueDate' | 'startDate', string>> = {};
    if (!t.title?.trim()) e.title = 'Titel ist erforderlich.';
    if (t.startDate && t.dueDate && new Date(t.startDate) > new Date(t.dueDate))
      e.dueDate = 'Startdatum darf nicht nach dem Fälligkeitsdatum liegen.';
    return e;
  }
}