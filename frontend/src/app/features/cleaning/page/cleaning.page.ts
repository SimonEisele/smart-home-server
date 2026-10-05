import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { localIsoDate } from '../../../shared/date-utils';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CleaningService } from '../service/cleaning.service';
import { CleaningTask, CleaningCategory } from '../model/cleaning.model';
import { AuthService } from '../../../core/auth/service/auth.service';
import { finalize, switchMap } from 'rxjs';

type FilterMode = 'all' | 'overdue' | 'upcoming';

interface TaskForm {
  name: string;
  description: string;
  category: CleaningCategory;
  intervalDays: number;
  color: string;
}

const CATEGORY_LABELS: Record<CleaningCategory, string> = {
  bathroom: 'Bad',
  kitchen: 'Küche',
  living_room: 'Wohnzimmer',
  bedroom: 'Schlafzimmer',
  hallway: 'Flur / Eingang',
  other: 'Sonstiges',
};

const CATEGORY_ICONS: Record<CleaningCategory, string> = {
  bathroom: '🚿',
  kitchen: '🍳',
  living_room: '🛋️',
  bedroom: '🛏️',
  hallway: '🚪',
  other: '🧹',
};

@Component({
  selector: 'cleaning-page',
  standalone: true,
  imports: [DialogDirective, CommonModule, FormsModule],
  templateUrl: './cleaning.page.html',
  styleUrl: './cleaning.page.css',
})
export class CleaningPage implements OnInit {
  tasks: CleaningTask[] = [];
  filter: FilterMode = 'all';
  expandedTaskId: string | null = null;

  showModal = false;
  saving = false;
  formError = '';
  loadError = '';
  loading = false;
  modalMode: 'add' | 'edit' = 'add';
  editingTaskId: string | null = null;
  form: TaskForm = this.emptyForm();
  errors: Partial<Record<keyof TaskForm, string>> = {};

  // Complete modal
  showCompleteModal = false;
  completingTask: CleaningTask | null = null;
  completeDate = '';
  completeNote = '';

  readonly categories: CleaningCategory[] = ['bathroom', 'kitchen', 'living_room', 'bedroom', 'hallway', 'other'];
  readonly categoryLabels = CATEGORY_LABELS;
  readonly categoryIcons = CATEGORY_ICONS;

  constructor(
    private cleaningService: CleaningService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true; this.loadError = '';
    this.auth.ensureAccessToken().pipe(
      switchMap(() => this.cleaningService.getTasks()),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); })
    ).subscribe({
      next: tasks => { this.tasks = tasks; this.cdr.markForCheck(); },
      error: () => { this.loadError = 'Reinigungsplan konnte nicht geladen werden.'; this.cdr.markForCheck(); },
    });
  }

  // ── Filtering ────────────────────────────────────────────────────────────────

  get filtered(): CleaningTask[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.tasks.filter(t => {
      if (!t.isActive) return false;
      if (this.filter === 'overdue') return this.isOverdue(t);
      if (this.filter === 'upcoming') return !this.isOverdue(t) && this.isDueSoon(t);
      return true;
    });
  }

  get overdueCount(): number {
    return this.tasks.filter(t => t.isActive && this.isOverdue(t)).length;
  }

  get upcomingCount(): number {
    return this.tasks.filter(t => t.isActive && !this.isOverdue(t) && this.isDueSoon(t)).length;
  }

  // ── Due-date helpers ─────────────────────────────────────────────────────────

  nextDue(task: CleaningTask): Date | null {
    if (!task.lastDoneAt) return null;
    const last = new Date(task.lastDoneAt);
    last.setHours(0, 0, 0, 0);
    const d = new Date(last);
    d.setDate(d.getDate() + task.intervalDays);
    return d;
  }

  isOverdue(task: CleaningTask): boolean {
    if (!task.lastDoneAt) return true; // never done → overdue
    const due = this.nextDue(task);
    if (!due) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return due < today;
  }

  isDueSoon(task: CleaningTask): boolean {
    if (!task.lastDoneAt) return false;
    const due = this.nextDue(task);
    if (!due) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 3;
  }

  statusLabel(task: CleaningTask): string {
    if (this.isOverdue(task)) return 'Überfällig';
    if (this.isDueSoon(task)) return 'Bald fällig';
    return 'OK';
  }

  statusClass(task: CleaningTask): string {
    if (this.isOverdue(task)) return 'overdue';
    if (this.isDueSoon(task)) return 'soon';
    return 'ok';
  }

  formatDate(d: string | Date | null | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  intervalLabel(days: number): string {
    if (days === 1) return 'Täglich';
    if (days === 7) return 'Wöchentlich';
    if (days === 14) return 'Alle 2 Wochen';
    if (days === 30) return 'Monatlich';
    return `Alle ${days} Tage`;
  }

  // ── Toggle history ───────────────────────────────────────────────────────────

  toggleHistory(id: string): void {
    this.expandedTaskId = this.expandedTaskId === id ? null : id;
  }

  // ── Complete modal ───────────────────────────────────────────────────────────

  openComplete(task: CleaningTask, event: Event): void {
    event.stopPropagation();
    this.completingTask = task;
    this.completeDate = localIsoDate(new Date());
    this.completeNote = '';
    this.formError = '';
    this.showCompleteModal = true;
  }

  submitComplete(): void {
    if (!this.completingTask || this.saving) return;
    if (!this.completeDate || this.completeDate > localIsoDate(new Date())) {
      this.formError = 'Bitte ein Datum bis heute angeben.'; return;
    }
    const taskId = this.completingTask.id;
    this.saving = true; this.formError = '';
    this.cleaningService.logCompletion(taskId, this.completeDate, this.completeNote).pipe(finalize(() => {
      this.saving = false; this.cdr.markForCheck();
    })).subscribe({
      next: log => {
        this.tasks = this.tasks.map(task => task.id === taskId ? { ...task, logs: [log, ...(task.logs ?? [])], lastDoneAt: task.lastDoneAt && task.lastDoneAt > log.doneAt ? task.lastDoneAt : log.doneAt } : task);
        this.saving = false; this.closeModal(); this.cdr.markForCheck();
      },
      error: () => { this.formError = 'Erledigung konnte nicht gespeichert werden. Bitte erneut versuchen.'; this.cdr.markForCheck(); },
    });
  }

  deleteLog(taskId: string, logId: string, event: Event): void {
    event.stopPropagation();
    if (!confirm('Eintrag löschen?')) return;
    this.cleaningService.deleteLog(logId).subscribe(() => {
      const task = this.tasks.find(t => t.id === taskId);
      if (task) {
        task.logs = (task.logs ?? []).filter(l => l.id !== logId);
        task.lastDoneAt = task.logs[0]?.doneAt ?? null;
        this.cdr.detectChanges();
      }
    });
  }

  // ── Task modal ────────────────────────────────────────────────────────────────

  openAdd(): void {
    this.modalMode = 'add';
    this.editingTaskId = null;
    this.form = this.emptyForm();
    this.errors = {};
    this.formError = "";
    this.showModal = true;
  }

  openEdit(task: CleaningTask, event: Event): void {
    event.stopPropagation();
    this.modalMode = 'edit';
    this.editingTaskId = task.id;
    this.form = {
      name: task.name,
      description: task.description ?? '',
      category: task.category,
      intervalDays: task.intervalDays,
      color: task.color ?? '',
    };
    this.errors = {};
    this.formError = "";
    this.showModal = true;
  }

  closeModal(): void {
    if (this.saving) return;
    this.showModal = false;
    this.showCompleteModal = false;
  }

  onBackdropClick(e: Event): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closeModal();
    }
  }

  submitTask(): void {
    if (this.saving) return;
    this.errors = {};
    this.formError = "";
    if (!this.form.name.trim()) {
      this.errors['name'] = 'Pflichtfeld';
      return;
    }
    if (!Number.isInteger(this.form.intervalDays) || this.form.intervalDays < 1) {
      this.errors['intervalDays'] = 'Mindestens 1 Tag';
      return;
    }

    const payload: Partial<CleaningTask> = {
      name: this.form.name.trim(),
      description: this.form.description.trim(),
      category: this.form.category,
      intervalDays: this.form.intervalDays,
      color: this.form.color,
    };

    this.saving = true; this.formError = '';
    const request = this.modalMode === 'add' ? this.cleaningService.createTask(payload) : this.cleaningService.updateTask(this.editingTaskId!, payload);
    request.pipe(finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: task => {
        this.tasks = this.modalMode === 'add' ? [...this.tasks, task] : this.tasks.map(t => t.id === task.id ? { ...t, ...task } : t);
        this.saving = false; this.closeModal(); this.cdr.markForCheck();
      },
      error: () => { this.formError = 'Speichern fehlgeschlagen. Deine Eingaben bleiben erhalten.'; this.cdr.markForCheck(); },
    });
  }

  deleteTask(task: CleaningTask, event: Event): void {
    event.stopPropagation();
    if (!confirm(`"${task.name}" wirklich löschen?`)) return;
    this.cleaningService.deleteTask(task.id).subscribe(() => {
      this.tasks = this.tasks.filter(t => t.id !== task.id);
      this.cdr.detectChanges();
    });
  }

  private emptyForm(): TaskForm {
    return { name: '', description: '', category: 'other', intervalDays: 7, color: '' };
  }
}
