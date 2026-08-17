import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CleaningService } from '../service/cleaning.service';
import { CleaningTask, CleaningCategory } from '../model/cleaning.model';
import { AuthService } from '../../../core/auth/service/auth.service';
import { switchMap, catchError, of } from 'rxjs';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './cleaning.page.html',
  styleUrl: './cleaning.page.css',
})
export class CleaningPage implements OnInit {
  tasks: CleaningTask[] = [];
  filter: FilterMode = 'all';
  expandedTaskId: string | null = null;

  showModal = false;
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

  private load(): void {
    this.auth.ensureAccessToken()
      .pipe(
        switchMap(() => this.cleaningService.getTasks()),
        catchError(() => of([] as CleaningTask[]))
      )
      .subscribe(tasks => { this.tasks = tasks; this.cdr.detectChanges(); });
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
    this.completeDate = new Date().toISOString().slice(0, 10);
    this.completeNote = '';
    this.showCompleteModal = true;
  }

  submitComplete(): void {
    if (!this.completingTask) return;
    this.cleaningService
      .logCompletion(this.completingTask.id, this.completeDate, this.completeNote)
      .subscribe(log => {
        const task = this.tasks.find(t => t.id === this.completingTask!.id);
        if (task) {
          task.logs = [log, ...(task.logs ?? [])];
          task.lastDoneAt = log.doneAt;
        }
        this.showCompleteModal = false;
        this.cdr.detectChanges();
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
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.showCompleteModal = false;
  }

  onBackdropClick(e: Event): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closeModal();
    }
  }

  submitTask(): void {
    this.errors = {};
    if (!this.form.name.trim()) {
      this.errors['name'] = 'Pflichtfeld';
      return;
    }
    if (this.form.intervalDays < 1) {
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

    if (this.modalMode === 'add') {
      this.cleaningService.createTask(payload).subscribe(task => {
        this.tasks = [...this.tasks, task].sort((a, b) => a.name.localeCompare(b.name));
        this.closeModal();
        this.cdr.detectChanges();
      });
    } else {
      this.cleaningService.updateTask(this.editingTaskId!, payload).subscribe(updated => {
        this.tasks = this.tasks.map(t => t.id === updated.id ? { ...t, ...updated } : t);
        this.closeModal();
        this.cdr.detectChanges();
      });
    }
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
