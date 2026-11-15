import {
  ChangeDetectorRef, Component, DestroyRef, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { formatDuration, initials, personColor } from '../../todos/utils/todo-utils';
import { CleaningCategory, CleaningLog, CleaningPerson, CleaningTask } from '../model/cleaning.model';
import { CleaningService } from '../service/cleaning.service';
import { INTERVAL_PRESETS, ROOMS, agoText, intervalLabel, shortDate } from '../utils/cleaning-utils';

export type TurnMode = 'open' | 'fixed' | 'rotation';

export interface CleaningForm {
  name: string;
  description: string;
  category: CleaningCategory;
  intervalDays: number;
  mode: TurnMode;
  assignedTo: string | null;
  rotation: string[];
  checklist: string[];
  durationMinutes: number | null;
  color: string;
  isActive: boolean;
}

const DURATIONS = [10, 15, 30, 45, 60];
export const TASK_COLORS = ['#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6'];

/**
 * Create or change a cleaning job: what and where, how often, who does it
 * (one person or taking turns), the steps and how long it takes. Existing jobs
 * also show their history, where single entries can be removed.
 */
@Component({
  selector: 'app-cleaning-editor',
  standalone: true,
  imports: [DialogDirective, FormsModule],
  templateUrl: './cleaning-editor.html',
  styleUrls: ['../../todos/editor/todo-editor.css', './cleaning-editor.css'],
})
export class CleaningEditor implements OnInit {
  /** The job to change; null creates a new one. */
  @Input() task: CleaningTask | null = null;
  @Input() people: CleaningPerson[] = [];
  @Output() saved = new EventEmitter<CleaningTask>();
  /** The task changed without closing, e.g. a history entry was removed. */
  @Output() changed = new EventEmitter<CleaningTask>();
  @Output() deleted = new EventEmitter<string>();
  /** Ask the page to log a completion (it owns the undo notice). */
  @Output() completeRequested = new EventEmitter<CleaningTask>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('stepInput') private stepInput?: ElementRef<HTMLInputElement>;
  private readonly service = inject(CleaningService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  form!: CleaningForm;
  errors: Partial<Record<'name' | 'interval' | 'rotation', string>> = {};
  formError = '';
  saving = false;
  confirmDelete = false;
  confirmLogId: string | null = null;
  customInterval = false;
  customDuration = false;
  newStep = '';
  showAllLogs = false;

  readonly ROOMS = ROOMS;
  readonly INTERVALS = INTERVAL_PRESETS;
  readonly DURATIONS = DURATIONS;
  readonly COLORS = TASK_COLORS;
  readonly formatDuration = formatDuration;
  readonly initials = initials;
  readonly personColor = personColor;
  readonly shortDate = shortDate;
  readonly agoText = agoText;

  get isNew(): boolean { return !this.task?.id; }

  get logs(): CleaningLog[] {
    const all = this.task?.logs ?? [];
    return this.showAllLogs ? all : all.slice(0, 5);
  }

  get intervalText(): string { return intervalLabel(this.form.intervalDays || 1); }

  ngOnInit(): void {
    const t = this.task;
    const rotation = t?.rotation ?? [];
    this.form = {
      name: t?.name ?? '',
      description: t?.description ?? '',
      category: t?.category ?? 'kitchen',
      intervalDays: t?.intervalDays ?? 7,
      mode: rotation.length > 1 ? 'rotation' : t?.assignedTo ? 'fixed' : 'open',
      assignedTo: t?.assignedTo ?? null,
      rotation: [...rotation],
      checklist: [...(t?.checklist ?? [])],
      durationMinutes: t?.durationMinutes ?? null,
      color: t?.color ?? '',
      isActive: t?.isActive ?? true,
    };
    this.customInterval = !INTERVAL_PRESETS.some(p => p.days === this.form.intervalDays);
    this.customDuration = !!this.form.durationMinutes && !DURATIONS.includes(this.form.durationMinutes);
  }

  personName(id: string | null | undefined): string {
    return this.people.find(p => p.id === id)?.name ?? '';
  }

  // ── Choices ───────────────────────────────────────────────────────────────
  setInterval(days: number): void {
    this.customInterval = false;
    this.form.intervalDays = days;
    this.errors = { ...this.errors, interval: undefined };
  }

  setMode(mode: TurnMode): void {
    this.form.mode = mode;
    this.errors = { ...this.errors, rotation: undefined };
    if (mode === 'rotation' && !this.form.rotation.length) {
      // Sensible start: everyone, beginning with whoever was responsible.
      const ids = this.people.map(p => p.id);
      const first = this.form.assignedTo && ids.includes(this.form.assignedTo) ? this.form.assignedTo : ids[0];
      this.form.rotation = first ? [first, ...ids.filter(id => id !== first)] : [];
      this.form.assignedTo = first ?? null;
    }
  }

  toggleRotation(id: string): void {
    const list = this.form.rotation;
    this.form.rotation = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    if (!this.form.assignedTo || !this.form.rotation.includes(this.form.assignedTo)) {
      this.form.assignedTo = this.form.rotation[0] ?? null;
    }
    this.errors = { ...this.errors, rotation: undefined };
  }

  moveRotation(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.form.rotation.length) return;
    const list = [...this.form.rotation];
    [list[index], list[target]] = [list[target], list[index]];
    this.form.rotation = list;
  }

  setDuration(minutes: number | null): void {
    this.customDuration = false;
    this.form.durationMinutes = minutes;
  }

  // ── Steps ─────────────────────────────────────────────────────────────────
  addStep(): void {
    const text = this.newStep.trim().replace(/\s+/g, ' ');
    if (!text) return;
    this.form.checklist = [...this.form.checklist, text.slice(0, 200)];
    this.newStep = '';
    setTimeout(() => this.stepInput?.nativeElement.focus());
  }

  removeStep(index: number): void { this.form.checklist = this.form.checklist.filter((_, i) => i !== index); }

  moveStep(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.form.checklist.length) return;
    const list = [...this.form.checklist];
    [list[index], list[target]] = [list[target], list[index]];
    this.form.checklist = list;
  }


  // ── Save, delete, history ─────────────────────────────────────────────────
  close(): void { if (!this.saving) this.closed.emit(); }

  save(): void {
    if (this.saving) return;
    if (this.newStep.trim()) this.addStep();
    this.errors = this.validate();
    if (Object.values(this.errors).some(Boolean)) return;
    const f = this.form;
    const payload: Partial<CleaningTask> = {
      name: f.name.trim(),
      description: f.description.trim(),
      category: f.category,
      intervalDays: f.intervalDays,
      assignedTo: f.mode === 'open' ? null : f.assignedTo,
      rotation: f.mode === 'rotation' ? f.rotation : [],
      checklist: f.checklist.map(step => step.trim()).filter(Boolean),
      durationMinutes: f.durationMinutes || null,
      color: f.color,
      isActive: f.isActive,
    };
    const request: Observable<CleaningTask> = this.isNew
      ? this.service.createTask(payload) : this.service.updateTask(this.task!.id, payload);
    this.run(request, task => this.saved.emit(task), 'Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten.');
  }

  remove(): void {
    if (this.isNew || this.saving) return;
    if (!this.confirmDelete) { this.confirmDelete = true; return; }
    const id = this.task!.id;
    this.run(this.service.deleteTask(id), () => this.deleted.emit(id), 'Löschen fehlgeschlagen. Bitte erneut versuchen.');
  }

  complete(): void {
    if (this.task && !this.saving) this.completeRequested.emit(this.task);
  }

  removeLog(log: CleaningLog): void {
    if (this.saving) return;
    if (this.confirmLogId !== log.id) { this.confirmLogId = log.id; return; }
    this.run(this.service.undo(log.id), task => {
      this.task = task;
      this.form.assignedTo = this.form.mode === 'open' ? null : task.assignedTo ?? null;
      this.confirmLogId = null;
      this.changed.emit(task);
    }, 'Eintrag konnte nicht entfernt werden.', false);
  }

  private run<T>(request: Observable<T>, done: (value: T) => void, message: string, closing = true): void {
    this.saving = true;
    this.formError = '';
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({ next: value => { done(value); if (!closing) this.cdr.markForCheck(); }, error: () => { this.formError = message; } });
  }

  private validate(): typeof this.errors {
    const e: typeof this.errors = {};
    const f = this.form;
    if (!f.name.trim()) e.name = 'Bitte sagen, was geputzt wird.';
    if (!Number.isInteger(f.intervalDays) || f.intervalDays < 1 || f.intervalDays > 730) {
      e.interval = 'Bitte 1 bis 730 Tage angeben.';
    }
    if (f.mode === 'rotation' && f.rotation.length < 2) e.rotation = 'Zum Abwechseln mindestens zwei Personen wählen.';
    if (f.mode === 'fixed' && !f.assignedTo) e.rotation = 'Bitte eine Person wählen.';
    return e;
  }
}
