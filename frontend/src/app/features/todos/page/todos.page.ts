import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, map, switchMap } from 'rxjs';
import { filtersChanged, loadFilters, saveFilters } from '../../../shared/utils/filter-memory';
import { ingredientKey as searchKey } from '../../ingredients/model/ingredient.model';
import { localIsoDate } from '../../../shared/utils/date-utils';
import { AuthService } from '../../../core/auth/service/auth.service';
import { TodosService } from '../service/todos.service';
import { Todo, TodoCompletion, TodoPerson } from '../model/todos.model';
import { TodoEditor, TodoForm } from '../editor/todo-editor';
import {
  BUCKET_LABELS, DueBucket, checklistProgress, dueBucket, dueLabel, formatDuration, initials, personColor,
} from '../utils/todo-utils';

type StatusFilter = 'open' | 'overdue' | 'done' | 'all';
type ScopeFilter = 'all' | 'global' | 'private';
/** person: '' everyone, 'me' my tasks (assigned to me or private), 'nobody' unassigned WG tasks, or a person id. */
interface TodoFilters { status: StatusFilter; scope: ScopeFilter; search: string; person: string; category: string; }
const DEFAULT_FILTERS: TodoFilters = { status: 'open', scope: 'all', search: '', person: '', category: '' };
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const BUCKETS: DueBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none'];
const QUICK_SHARED_KEY = 'todos:quick-shared';

export interface TodoGroup { key: DueBucket | 'done'; label: string; todos: Todo[]; }

@Component({
  selector: 'todos-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TodoEditor],
  templateUrl: './todos.page.html',
  styleUrl: './todos.page.css',
})
export class TodosPage implements OnInit {
  private readonly todosService = inject(TodosService);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  todos: Todo[] = [];
  people: TodoPerson[] = [];
  filters: TodoFilters = { ...DEFAULT_FILTERS, ...loadFilters('todos', DEFAULT_FILTERS) };
  loading = false;
  loadError = '';
  pendingIds = new Set<string>();
  notice = '';
  /** Task whose "Details ergänzen" link is offered after a quick entry. */
  noticeTodo: Todo | null = null;

  /** undefined: closed; null: new task; otherwise the task being changed. */
  editing: Todo | null | undefined = undefined;
  editorDefaults: Partial<TodoForm> = {};

  quickTitle = '';
  quickShared = this.readQuickShared();
  quickSaving = false;
  quickError = '';

  readonly dueLabel = dueLabel;
  readonly initials = initials;
  readonly personColor = personColor;
  readonly formatDuration = formatDuration;
  readonly checklistProgress = checklistProgress;

  ngOnInit(): void {
    this.loadData();
    this.todosService.getPeople().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: people => { this.people = people; this.cdr.markForCheck(); },
      error: () => { /* assigning is then simply not offered */ },
    });
  }

  loadData(): void {
    this.loading = true;
    this.loadError = '';
    this.auth.ensureAccessToken().pipe(
      switchMap(() => this.todosService.getUserTodos()),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: todos => { this.todos = todos; this.cdr.markForCheck(); },
      error: () => { this.loadError = 'Aufgaben konnten nicht geladen werden.'; this.cdr.markForCheck(); },
    });
  }

  get me(): TodoPerson | undefined { return this.people.find(p => p.isMe); }

  // ── Filters ───────────────────────────────────────────────────────────────
  setFilter(change: Partial<TodoFilters>): void {
    this.filters = { ...this.filters, ...change };
    saveFilters('todos', this.filters);
  }

  resetFilters(): void { this.setFilter(DEFAULT_FILTERS); }

  get filtersActive(): boolean { return filtersChanged(this.filters, DEFAULT_FILTERS); }

  togglePerson(person: string): void { this.setFilter({ person: this.filters.person === person ? '' : person }); }

  toggleCategory(category: string): void {
    this.setFilter({ category: this.filters.category === category ? '' : category });
  }

  private isMine(t: Todo): boolean {
    const me = this.me?.id;
    return (!!me && t.assignedTo === me) || (!t.globalTodo && (!t.createdBy || t.createdBy === me));
  }

  private matches(t: Todo, f: TodoFilters): boolean {
    const q = searchKey(f.search);
    if (q && !searchKey(`${t.title} ${t.description ?? ''} ${t.category ?? ''} ${t.assignedToName ?? ''}`
      + (t.checklist ?? []).map(i => ` ${i.text}`).join('')).includes(q)) return false;
    if (f.scope === 'global' && !t.globalTodo) return false;
    if (f.scope === 'private' && t.globalTodo) return false;
    if (f.person === 'me' && !this.isMine(t)) return false;
    if (f.person === 'nobody' && (!t.globalTodo || t.assignedTo)) return false;
    if (f.person && !['me', 'nobody'].includes(f.person) && t.assignedTo !== f.person) return false;
    if (f.category && (t.category ?? '') !== f.category) return false;
    if (f.status === 'open') return !t.done;
    if (f.status === 'overdue') return this.isOverdue(t);
    if (f.status === 'done') return t.done;
    return true;
  }

  /** Count for a chip: the other filters stay as they are. */
  countWith(change: Partial<TodoFilters>): number {
    const f = { ...this.filters, ...change };
    return this.todos.filter(t => this.matches(t, f)).length;
  }

  statusCount(status: StatusFilter): number { return this.countWith({ status }); }
  scopeCount(scope: ScopeFilter): number { return this.countWith({ scope }); }

  get filtered(): Todo[] { return this.todos.filter(t => this.matches(t, this.filters)); }

  /** Overdue first, then by due date, then by priority. */
  get openTodos(): Todo[] {
    const due = (t: Todo) => (t.dueDate ? new Date(t.dueDate).getTime() : Infinity);
    return this.filtered.filter(t => !t.done).sort((a, b) =>
      Number(this.isOverdue(b)) - Number(this.isOverdue(a)) || due(a) - due(b) ||
      (PRIORITY_RANK[a.priority ?? 'medium'] - PRIORITY_RANK[b.priority ?? 'medium']) ||
      a.title.localeCompare(b.title, 'de'));
  }

  get doneTodos(): Todo[] {
    return this.filtered.filter(t => t.done)
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  }

  /** Open tasks grouped by when they are due; done ones last. */
  get groups(): TodoGroup[] {
    const now = new Date();
    const open = this.openTodos;
    const groups: TodoGroup[] = BUCKETS
      .map(key => ({ key, label: BUCKET_LABELS[key], todos: open.filter(t => dueBucket(t, now) === key) }))
      .filter(g => g.todos.length);
    if (this.filters.status === 'done' || this.filters.status === 'all') {
      const done = this.doneTodos;
      if (done.length) groups.push({ key: 'done', label: 'Erledigt', todos: done });
    }
    return groups;
  }

  /** Open tasks per person and area, for the overview and its filter shortcuts. */
  get personStats(): Array<{ id: string; name: string; short: string; count: number; color: string }> {
    const open = this.todos.filter(t => !t.done);
    const stats = this.people.map(p => ({
      id: p.id, name: p.isMe ? `${p.name} (ich)` : p.name, short: initials(p.name), color: personColor(p.id),
      count: open.filter(t => t.assignedTo === p.id).length,
    }));
    return [...stats, { id: 'nobody', name: 'Noch niemand', short: '?', color: '',
      count: open.filter(t => t.globalTodo && !t.assignedTo).length }];
  }

  get categoryStats(): Array<{ name: string; count: number }> {
    const counts = new Map<string, number>();
    for (const t of this.todos) {
      if (!t.done && t.category) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  get categories(): string[] {
    return [...new Set(this.todos.map(t => t.category).filter((c): c is string => !!c))].sort();
  }

  get openCount(): number { return this.todos.filter(t => !t.done).length; }
  get overdueCount(): number { return this.todos.filter(t => this.isOverdue(t)).length; }
  get todayCount(): number { return this.todos.filter(t => !t.done && dueBucket(t) === 'today').length; }
  get mineCount(): number { return this.todos.filter(t => !t.done && this.isMine(t)).length; }

  // ── Row helpers ───────────────────────────────────────────────────────────
  isOverdue(t: Todo): boolean { return !t.done && !!t.dueDate && new Date(t.dueDate) < new Date(); }

  isDueSoon(t: Todo): boolean {
    if (!t.dueDate || t.done) return false;
    const diff = new Date(t.dueDate).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
  }

  recurrenceLabel(t: Todo): string {
    if (!t.recurrence) return '';
    const n = t.recurrenceInterval ?? 1;
    const unit = { daily: ['Täglich', 'Tage'], weekly: ['Wöchentlich', 'Wochen'], monthly: ['Monatlich', 'Monate'] }[t.recurrence];
    return n > 1 ? `Alle ${n} ${unit[1]}` : unit[0];
  }

  firstLine(text?: string): string { return (text ?? '').split('\n').find(line => line.trim())?.trim() ?? ''; }

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

  // ── Done / reopen ─────────────────────────────────────────────────────────
  toggleDone(todo: Todo, event: Event): void {
    event.stopPropagation();
    if (this.pendingIds.has(todo.id)) return;
    this.pendingIds.add(todo.id);
    this.notice = '';
    this.noticeTodo = null;
    // Completing goes through the server: recurring tasks move on to their next date instead of closing.
    const request = todo.done
      ? this.todosService.updateTodo(todo.id, { done: false })
      : this.todosService.completeTodo(todo.id).pipe(map(result => { this.announce(todo, result); return result.data; }));
    request.pipe(finalize(() => { this.pendingIds.delete(todo.id); this.cdr.markForCheck(); })).subscribe({
      next: updated => this.replace(updated),
      error: () => { this.notice = 'Das hat nicht geklappt. Bitte erneut versuchen.'; },
    });
  }

  private announce(todo: Todo, result: TodoCompletion): void {
    if (!result.advancedTo) return;
    const next = new Date(`${result.advancedTo}T12:00:00`);
    this.notice = `„${todo.title}“ erledigt – nächstes Mal am ${next.toLocaleDateString('de-CH')}.`;
  }

  private replace(updated: Todo): void {
    this.todos = this.todos.map(t => t.id === updated.id ? { ...updated, plannedSlots: updated.plannedSlots ?? t.plannedSlots } : t);
    this.cdr.markForCheck();
  }

  // ── Quick entry ───────────────────────────────────────────────────────────
  quickAdd(): void {
    const title = this.quickTitle.trim();
    if (!title || this.quickSaving) return;
    this.quickSaving = true;
    this.quickError = '';
    this.todosService.addTodo({ title, globalTodo: this.quickShared, priority: 'medium' })
      .pipe(finalize(() => { this.quickSaving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: saved => {
          this.todos = [...this.todos, saved];
          this.quickTitle = '';
          this.notice = `„${saved.title}“ hinzugefügt.`;
          this.noticeTodo = saved;
        },
        error: () => { this.quickError = 'Hinzufügen fehlgeschlagen. Bitte erneut versuchen.'; },
      });
  }

  toggleQuickShared(): void {
    this.quickShared = !this.quickShared;
    try { localStorage.setItem(QUICK_SHARED_KEY, String(this.quickShared)); } catch { /* not remembered */ }
  }

  private readQuickShared(): boolean {
    try { return localStorage.getItem(QUICK_SHARED_KEY) !== 'false'; } catch { return true; }
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  openAdd(): void {
    this.editorDefaults = { globalTodo: this.quickShared, title: this.quickTitle.trim() };
    this.editing = null;
  }

  openEdit(todo: Todo): void { this.editing = todo; this.notice = ''; this.noticeTodo = null; }

  closeEditor(): void { this.editing = undefined; }

  onSaved(saved: Todo): void {
    const exists = this.todos.some(t => t.id === saved.id);
    this.todos = exists ? this.todos.map(t => t.id === saved.id ? saved : t) : [...this.todos, saved];
    if (!exists) this.quickTitle = '';
    this.editing = undefined;
    this.cdr.markForCheck();
  }

  onCompleted(result: TodoCompletion): void {
    const todo = this.editing;
    if (todo) this.announce(todo, result);
    this.replace(result.data);
    this.editing = undefined;
  }

  onDeleted(id: string): void {
    this.todos = this.todos.filter(t => t.id !== id);
    this.editing = undefined;
    this.cdr.markForCheck();
  }
}
