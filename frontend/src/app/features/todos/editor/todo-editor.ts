import {
  ChangeDetectorRef, Component, DestroyRef, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, finalize } from 'rxjs';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { localIsoDate } from '../../../shared/utils/date-utils';
import { CATEGORY_SUGGESTIONS, ChecklistItem, Todo, TodoCompletion, TodoPerson } from '../model/todos.model';
import { TodosService } from '../service/todos.service';
import { checklistProgress, dueLabel, formatDuration, initials, personColor, quickDates } from '../utils/todo-utils';

export interface TodoForm {
  title: string;
  description: string;
  globalTodo: boolean;
  assignedTo: string | null;
  /** yyyy-mm-dd or '' */
  dueDate: string;
  startDate: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  checklist: ChecklistItem[];
  durationMinutes: number | null;
  recurrence: '' | 'daily' | 'weekly' | 'monthly';
  recurrenceInterval: number;
}

const DURATIONS = [15, 30, 45, 60, 120];

/**
 * Create or change a task: what, for whom, until when, how important, the steps,
 * how long it takes (for planning in the calendar) and whether it repeats.
 */
@Component({
  selector: 'app-todo-editor',
  standalone: true,
  imports: [DialogDirective, FormsModule, RouterLink],
  templateUrl: './todo-editor.html',
  styleUrl: './todo-editor.css',
})
export class TodoEditor implements OnInit {
  /** The task to change; null creates a new one. */
  @Input() todo: Todo | null = null;
  /** Values for a new task, e.g. the WG/Privat choice of the quick entry. */
  @Input() defaults: Partial<TodoForm> = {};
  @Input() people: TodoPerson[] = [];
  /** Areas already in use, offered first. */
  @Input() categories: string[] = [];
  @Output() saved = new EventEmitter<Todo>();
  @Output() deleted = new EventEmitter<string>();
  @Output() completed = new EventEmitter<TodoCompletion>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('stepInput') private stepInput?: ElementRef<HTMLInputElement>;
  private readonly service = inject(TodosService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  form!: TodoForm;
  errors: Partial<Record<'title' | 'dueDate' | 'duration' | 'interval', string>> = {};
  formError = '';
  saving = false;
  confirmDelete = false;
  newStep = '';
  newCategory = '';
  showCategoryInput = false;
  customDuration = false;
  durH = 0;
  durM = 0;
  showMore = false;

  readonly quick = quickDates();
  readonly DURATIONS = DURATIONS;
  readonly formatDuration = formatDuration;
  readonly initials = initials;
  readonly personColor = personColor;
  readonly PRIORITIES: Array<{ value: TodoForm['priority']; label: string }> = [
    { value: 'low', label: 'Niedrig' }, { value: 'medium', label: 'Normal' }, { value: 'high', label: 'Wichtig' },
  ];

  get isNew(): boolean { return !this.todo?.id; }

  get categoryOptions(): string[] {
    const seen = new Set<string>();
    return [...this.categories, ...CATEGORY_SUGGESTIONS, this.form.category].filter(c => {
      const key = c?.toLocaleLowerCase('de');
      if (!c || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  get progress() { return checklistProgress(this.form.checklist); }

  get dueText(): string {
    if (!this.form.dueDate) return 'Kein Datum';
    const date = new Date(`${this.form.dueDate}T12:00:00`);
    const weekday = date.toLocaleDateString('de-CH', { weekday: 'long' });
    return `${dueLabel(date.toISOString())} · ${weekday}, ${date.toLocaleDateString('de-CH')}`;
  }

  get recurrenceUnit(): string {
    const many = this.form.recurrenceInterval > 1;
    return this.form.recurrence === 'daily' ? (many ? 'Tage' : 'Tag')
      : this.form.recurrence === 'weekly' ? (many ? 'Wochen' : 'Woche') : (many ? 'Monate' : 'Monat');
  }

  ngOnInit(): void {
    const t = this.todo;
    this.form = {
      title: t?.title ?? '',
      description: t?.description ?? '',
      globalTodo: t ? !!t.globalTodo : this.defaults.globalTodo ?? true,
      assignedTo: t?.assignedTo ?? null,
      dueDate: t?.dueDate ? localIsoDate(new Date(t.dueDate)) : '',
      startDate: t?.startDate ? localIsoDate(new Date(t.startDate)) : '',
      priority: t?.priority ?? 'medium',
      category: t?.category ?? '',
      checklist: (t?.checklist ?? []).map(item => ({ ...item })),
      durationMinutes: t?.durationMinutes ?? null,
      recurrence: t?.recurrence ?? '',
      recurrenceInterval: t?.recurrenceInterval ?? 1,
      ...(t ? {} : this.defaults),
    };
    const minutes = this.form.durationMinutes ?? 0;
    this.customDuration = !!minutes && !DURATIONS.includes(minutes);
    this.durH = Math.floor(minutes / 60);
    this.durM = minutes % 60;
    this.showMore = !!this.form.startDate;
  }

  /** Is the due date one of the quick picks (otherwise the calendar chip is highlighted)? */
  quickPicked(): boolean { return this.quick.some(q => q.date === this.form.dueDate); }

  // ── Choices ───────────────────────────────────────────────────────────────
  setDue(date: string): void { this.form.dueDate = date; this.errors = { ...this.errors, dueDate: undefined }; }

  setShared(shared: boolean): void {
    this.form.globalTodo = shared;
    if (!shared) this.form.assignedTo = null;
  }

  setDuration(minutes: number | null): void {
    this.customDuration = false;
    this.form.durationMinutes = minutes;
  }

  openCustomDuration(): void {
    this.customDuration = true;
    const minutes = this.form.durationMinutes ?? 0;
    this.durH = Math.floor(minutes / 60);
    this.durM = minutes % 60;
  }

  pickCategory(category: string): void {
    this.form.category = this.form.category === category ? '' : category;
  }

  addCategory(): void {
    const name = this.newCategory.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (name) this.form.category = name;
    this.newCategory = '';
    this.showCategoryInput = false;
  }

  // ── Checklist ─────────────────────────────────────────────────────────────
  addStep(): void {
    const text = this.newStep.trim();
    if (!text) return;
    this.form.checklist = [...this.form.checklist, { text: text.slice(0, 200), done: false }];
    this.newStep = '';
    setTimeout(() => this.stepInput?.nativeElement.focus());
  }

  removeStep(index: number): void {
    this.form.checklist = this.form.checklist.filter((_, i) => i !== index);
  }

  moveStep(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.form.checklist.length) return;
    const list = [...this.form.checklist];
    [list[index], list[target]] = [list[target], list[index]];
    this.form.checklist = list;
  }

  // ── Save, complete, delete ────────────────────────────────────────────────
  close(): void { if (!this.saving) this.closed.emit(); }

  save(): void {
    if (this.saving) return;
    if (this.newStep.trim()) this.addStep();
    this.errors = this.validate();
    if (Object.values(this.errors).some(Boolean)) return;
    const f = this.form;
    const duration = this.customDuration ? this.durH * 60 + this.durM : f.durationMinutes;
    const payload: Partial<Todo> = {
      title: f.title.trim(),
      description: f.description.trim(),
      globalTodo: f.globalTodo,
      assignedTo: f.globalTodo ? f.assignedTo : null,
      priority: f.priority,
      category: f.category.trim(),
      checklist: f.checklist.filter(item => item.text.trim()).map(item => ({ ...item, text: item.text.trim() })),
      startDate: f.startDate ? new Date(`${f.startDate}T00:00:00`).toISOString() : null,
      dueDate: f.dueDate ? new Date(`${f.dueDate}T23:59:59`).toISOString() : null,
      durationMinutes: duration || null,
      recurrence: f.recurrence,
      recurrenceInterval: f.recurrence ? f.recurrenceInterval : 1,
    };
    const request: Observable<Todo> = this.isNew
      ? this.service.addTodo(payload) : this.service.updateTodo(this.todo!.id, payload);
    this.run(request, saved => this.saved.emit(saved),
      'Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten. Bitte erneut versuchen.');
  }

  complete(): void {
    if (this.isNew || this.saving) return;
    this.run(this.service.completeTodo(this.todo!.id), result => this.completed.emit(result),
      'Abhaken fehlgeschlagen. Bitte erneut versuchen.');
  }

  remove(): void {
    if (this.isNew || this.saving) return;
    if (!this.confirmDelete) { this.confirmDelete = true; return; }
    const id = this.todo!.id;
    this.run(this.service.deleteTodo(id), () => this.deleted.emit(id), 'Löschen fehlgeschlagen. Bitte erneut versuchen.');
  }

  private run<T>(request: Observable<T>, done: (value: T) => void, message: string): void {
    this.saving = true;
    this.formError = '';
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({ next: done, error: () => { this.formError = message; } });
  }

  private validate(): typeof this.errors {
    const e: typeof this.errors = {};
    const f = this.form;
    if (!f.title.trim()) e.title = 'Bitte sagen, was zu tun ist.';
    if (f.startDate && f.dueDate && f.startDate > f.dueDate) e.dueDate = '«Erst ab» liegt nach der Fälligkeit.';
    if (this.customDuration && (!Number.isFinite(this.durH) || !Number.isFinite(this.durM) || this.durH < 0
      || this.durM < 0 || this.durM > 59)) e.duration = 'Bitte eine gültige Dauer angeben (Minuten 0–59).';
    if (f.recurrence && (!Number.isInteger(f.recurrenceInterval) || f.recurrenceInterval < 1)) {
      e.interval = 'Mindestens 1.';
    }
    return e;
  }

  // ── Calendar ──────────────────────────────────────────────────────────────
  slotText(start: string): string {
    const d = new Date(start);
    return `${d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric' })}, `
      + d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  }

  slotDate(start: string): string { return localIsoDate(new Date(start)); }
}
