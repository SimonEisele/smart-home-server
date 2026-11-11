import { filtersChanged, loadFilters, saveFilters } from '../../../shared/utils/filter-memory';
import { ingredientKey as searchKey } from '../../ingredients/model/ingredient.model';
import { RouterLink } from '@angular/router';
import { localIsoDate } from '../../../shared/utils/date-utils';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { Component, OnInit, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TodosService } from '../service/todos.service';
import { Todo } from '../model/todos.model';
import { AuthService } from '../../../core/auth/service/auth.service';
import { finalize, map, switchMap } from 'rxjs';

type StatusFilter = 'open' | 'overdue' | 'done' | 'all';
type ScopeFilter = 'all' | 'global' | 'private';
interface TodoFilters { status: StatusFilter; scope: ScopeFilter; search: string; }
const DEFAULT_FILTERS: TodoFilters = { status: 'open', scope: 'all', search: '' };
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

@Component({
  selector: 'todos-page',
  standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule, RouterLink],
  templateUrl: './todos.page.html',
  styleUrl: './todos.page.css',
})
export class TodosPage implements OnInit {
  todos: Todo[] = [];
  filters: TodoFilters = loadFilters('todos', DEFAULT_FILTERS);
  showModal = false;
  saving = false;
  formError = '';
  loading = false;
  loadError = '';
  pendingIds = new Set<string>();
  notice = '';
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
  /** Status, scope (WG/Privat) and search combine; each chip counts within the other two. */
  setFilter(change: Partial<TodoFilters>): void {
    this.filters = { ...this.filters, ...change };
    saveFilters('todos', this.filters);
  }

  resetFilters(): void { this.setFilter(DEFAULT_FILTERS); }

  get filtersActive(): boolean { return filtersChanged(this.filters, DEFAULT_FILTERS); }

  private matches(t: Todo, status: StatusFilter, scope: ScopeFilter): boolean {
    const q = searchKey(this.filters.search);
    if (q && !searchKey(`${t.title} ${t.description ?? ''}`).includes(q)) return false;
    if (scope === 'global' && !t.globalTodo) return false;
    if (scope === 'private' && t.globalTodo) return false;
    if (status === 'open') return !t.done;
    if (status === 'overdue') return this.isOverdue(t);
    if (status === 'done') return t.done;
    return true;
  }

  statusCount(status: StatusFilter): number {
    return this.todos.filter(t => this.matches(t, status, this.filters.scope)).length;
  }

  scopeCount(scope: ScopeFilter): number {
    return this.todos.filter(t => this.matches(t, this.filters.status, scope)).length;
  }

  get filtered(): Todo[] {
    return this.todos.filter(t => this.matches(t, this.filters.status, this.filters.scope));
  }

  /** Overdue first, then by due date, then by priority. */
  get openTodos(): Todo[] {
    const due = (t: Todo) => (t.dueDate ? new Date(t.dueDate).getTime() : Infinity);
    return this.filtered.filter(t => !t.done).sort((a, b) =>
      Number(this.isOverdue(b)) - Number(this.isOverdue(a)) || due(a) - due(b) ||
      (PRIORITY_RANK[a.priority ?? 'medium'] - PRIORITY_RANK[b.priority ?? 'medium']));
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
    this.notice = '';
    // Completing goes through the server: recurring tasks move on to their next date instead of closing.
    const request = todo.done
      ? this.todosService.updateTodo(todo.id, { done: false })
      : this.todosService.completeTodo(todo.id).pipe(map(result => {
          if (result.advancedTo) {
            const next = new Date(`${result.advancedTo}T12:00:00`);
            this.notice = `„${todo.title}“ erledigt – nächstes Mal am ${next.toLocaleDateString('de-CH')}.`;
          }
          return result.data;
        }));
    request.pipe(finalize(() => {
      this.pendingIds.delete(todo.id); this.cdr.markForCheck();
    })).subscribe({ next: updated => {
      this.todos = this.todos.map(t => t.id === updated.id ? { ...updated, plannedSlots: updated.plannedSlots ?? t.plannedSlots } : t);
      this.cdr.markForCheck();
    } });
  }

  /** First upcoming calendar block of a task (or the last one if all are past). */
  nextSlot(todo: Todo): { start: Date; date: string } | null {
    const slots = (todo.plannedSlots ?? []).map(slot => new Date(slot.start)).sort((a, b) => a.getTime() - b.getTime());
    if (!slots.length) return null;
    const now = Date.now();
    const start = slots.find(d => d.getTime() >= now) ?? slots[slots.length - 1];
    return { start, date: localIsoDate(start) };
  }

  slotLabel(todo: Todo): string {
    const slot = this.nextSlot(todo);
    if (!slot) return '';
    const day = slot.start.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric' });
    const time = slot.start.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    const more = (todo.plannedSlots?.length ?? 0) > 1 ? ` (+${todo.plannedSlots!.length - 1})` : '';
    return `${day}, ${time}${more}`;
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