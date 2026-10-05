import { localIsoDate } from '../../../shared/date-utils';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { Component, OnInit, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TodosService } from '../service/todos.service';
import { Todo } from '../model/todos.model';
import { AuthService } from '../../../core/auth/service/auth.service';
import { finalize, switchMap } from 'rxjs';

type FilterMode = 'all' | 'open' | 'done' | 'overdue' | 'global' | 'private';

@Component({
  selector: 'todos-page',
  standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule],
  templateUrl: './todos.page.html',
  styleUrl: './todos.page.css',
})
export class TodosPage implements OnInit {
  todos: Todo[] = [];
  filter: FilterMode = 'all';
  showModal = false;
  saving = false;
  formError = '';
  loading = false;
  loadError = '';
  pendingIds = new Set<string>();
  modalMode: 'add' | 'edit' = 'add';

  form: Partial<Todo> = this.emptyForm();
  errors: Partial<Record<'title' | 'dueDate' | 'startDate', string>> = {};
  durH = 0;
  durM = 0;

  constructor(private todosService: TodosService, private auth: AuthService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.loadError = '';
    this.auth.ensureAccessToken().pipe(
      switchMap(() => this.todosService.getUserTodos()),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: todos => { this.todos = todos; this.cdr.markForCheck(); },
      error: () => { this.loadError = 'Aufgaben konnten nicht geladen werden.'; this.cdr.markForCheck(); },
    });
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

  formatDate(d?: string | null): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // ---- Toggle done inline ----
  toggleDone(todo: Todo, event: Event): void {
    event.stopPropagation();
    if (this.pendingIds.has(todo.id)) return;
    this.pendingIds.add(todo.id);
    this.todosService.updateTodo(todo.id, { done: !todo.done }).pipe(finalize(() => {
      this.pendingIds.delete(todo.id); this.cdr.markForCheck();
    })).subscribe({ next: updated => {
      this.todos = this.todos.map(t => t.id === updated.id ? updated : t);
      this.cdr.markForCheck();
    } });
  }

  // ---- Modal ----
  openAdd(): void {
    this.form = this.emptyForm();
    this.errors = {};
    this.formError = "";
    this.durH = 0; this.durM = 0;
    this.modalMode = 'add';
    this.showModal = true;
  }

  openEdit(todo: Todo): void {
    this.form = {
      ...todo,
      startDate: todo.startDate ? localIsoDate(new Date(todo.startDate)) : '',
      dueDate: todo.dueDate ? localIsoDate(new Date(todo.dueDate)) : '',
    };
    this.errors = {};
    this.formError = "";
    this.durH = Math.floor((todo.durationMinutes ?? 0) / 60);
    this.durM = (todo.durationMinutes ?? 0) % 60;
    this.modalMode = 'edit';
    this.showModal = true;
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.form = this.emptyForm();
    this.errors = {};
    this.formError = "";
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.closeModal(); }

  save(): void {
    if (this.saving) return;
    this.errors = this.validate(this.form);
    if (Object.keys(this.errors).length) return;
    if (!Number.isFinite(this.durH) || !Number.isFinite(this.durM) || this.durH < 0 || this.durM < 0 || this.durM > 59) {
      this.formError = 'Bitte eine gültige Dauer angeben (Minuten 0–59).'; return;
    }
    const payload: Partial<Todo> = {
      ...this.form, title: this.form.title!.trim(),
      startDate: this.form.startDate ? new Date(this.form.startDate + 'T00:00:00').toISOString() : null,
      dueDate: this.form.dueDate ? new Date(this.form.dueDate + 'T23:59:59').toISOString() : null,
      durationMinutes: this.durH * 60 + this.durM || null,
      recurrenceInterval: this.form.recurrence ? this.form.recurrenceInterval : 1,
    };
    this.saving = true; this.formError = '';
    const request = this.modalMode === 'add' ? this.todosService.addTodo(payload) : this.todosService.updateTodo(this.form.id!, payload);
    request.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: saved => {
        this.todos = this.modalMode === 'add' ? [...this.todos, saved] : this.todos.map(todo => todo.id === saved.id ? saved : todo);
        this.saving = false; this.closeModal(); this.cdr.markForCheck();
      },
      error: () => { this.formError = 'Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.'; this.cdr.markForCheck(); },
    });
  }

  deleteTodo(): void {
    if (!this.form.id || this.saving) return;
    const id = this.form.id;
    this.saving = true; this.formError = '';
    this.todosService.deleteTodo(id).pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: () => { this.todos = this.todos.filter(todo => todo.id !== id); this.saving = false; this.closeModal(); },
      error: () => { this.formError = 'Löschen fehlgeschlagen. Bitte erneut versuchen.'; },
    });
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
    if (t.recurrence && (!Number.isInteger(t.recurrenceInterval) || t.recurrenceInterval! < 1)) e.title = 'Das Wiederholungsintervall muss mindestens 1 sein.';
    if (t.startDate && t.dueDate && new Date(t.startDate) > new Date(t.dueDate))
      e.dueDate = 'Startdatum darf nicht nach dem Fälligkeitsdatum liegen.';
    return e;
  }
}