import { ChangeDetectorRef, Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, finalize, forkJoin, of, switchMap } from 'rxjs';
import { AuthService } from '../../../core/auth/service/auth.service';
import { filtersChanged, loadFilters, saveFilters } from '../../../shared/utils/filter-memory';
import { localIsoDate } from '../../../shared/utils/date-utils';
import { formatDuration, initials, personColor } from '../../todos/utils/todo-utils';
import { CleaningComplete, CompletionEntry } from '../complete/cleaning-complete';
import { CleaningEditor } from '../editor/cleaning-editor';
import { CleaningCategory, CleaningPerson, CleaningTask } from '../model/cleaning.model';
import { CleaningService } from '../service/cleaning.service';
import {
  DueBucket, DueInfo, PersonShare, ROOMS, RecentLog, agoText, dueInfo, dueText, intervalLabel, personShares,
  recentLogs, room, shortDate,
} from '../utils/cleaning-utils';

type StatusFilter = 'all' | 'due';
interface CleaningFilters { status: StatusFilter; person: string; room: string; }
const DEFAULT_FILTERS: CleaningFilters = { status: 'all', person: '', room: '' };

interface Row { task: CleaningTask; due: DueInfo; }
interface Group { key: DueBucket; label: string; rows: Row[]; }

const GROUP_LABELS: Record<DueBucket, string> = {
  overdue: 'Überfällig', today: 'Heute fällig', week: 'Diese Woche', later: 'Später',
};

/**
 * The WG cleaning plan: what is due, whose turn it is, one tap to tick it off
 * (with undo), and who did how much lately.
 */
@Component({
  selector: 'cleaning-page',
  standalone: true,
  imports: [FormsModule, RouterLink, CleaningEditor, CleaningComplete],
  templateUrl: './cleaning.page.html',
  styleUrl: './cleaning.page.css',
})
export class CleaningPage implements OnInit, OnDestroy {
  private readonly service = inject(CleaningService);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  tasks: CleaningTask[] = [];
  people: CleaningPerson[] = [];
  filters: CleaningFilters = loadFilters('cleaning', DEFAULT_FILTERS);
  loading = false;
  loadError = '';
  actionError = '';
  pendingIds = new Set<string>();
  showPaused = false;

  /** undefined: closed, null: new task. */
  editing: CleaningTask | null | undefined = undefined;
  completing: CleaningTask | null = null;
  completeSaving = false;
  completeError = '';

  undoAction: { message: string; logId: string } | null = null;
  private undoTimer?: ReturnType<typeof setTimeout>;

  readonly ROOMS = ROOMS;
  readonly room = room;
  readonly dueText = dueText;
  readonly intervalLabel = intervalLabel;
  readonly formatDuration = formatDuration;
  readonly initials = initials;
  readonly personColor = personColor;
  readonly agoText = agoText;
  readonly shortDate = shortDate;

  ngOnInit(): void { this.load(); }

  ngOnDestroy(): void { if (this.undoTimer) clearTimeout(this.undoTimer); }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.auth.ensureAccessToken().pipe(
      switchMap(() => forkJoin({
        tasks: this.service.getTasks(),
        people: this.service.getPeople().pipe(catchError(() => of([] as CleaningPerson[]))),
      })),
      takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); }),
    ).subscribe({
      next: ({ tasks, people }) => { this.tasks = tasks; this.people = people; },
      error: () => { this.loadError = 'Putzplan konnte nicht geladen werden.'; },
    });
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  get me(): CleaningPerson | undefined { return this.people.find(p => p.isMe); }

  get active(): CleaningTask[] { return this.tasks.filter(t => t.isActive !== false); }

  get paused(): CleaningTask[] { return this.tasks.filter(t => t.isActive === false); }

  private rows(): Row[] {
    return this.active.map(task => ({ task, due: dueInfo(task) }));
  }

  private isDue(row: Row): boolean { return row.due.bucket === 'overdue' || row.due.bucket === 'today'; }

  private matches(row: Row, f: CleaningFilters): boolean {
    if (f.room && row.task.category !== f.room) return false;
    if (f.person && row.task.assignedTo !== f.person) return false;
    return f.status === 'due' ? this.isDue(row) : true;
  }

  get groups(): Group[] {
    const rows = this.rows().filter(row => this.matches(row, this.filters))
      .sort((a, b) => a.due.days - b.due.days || Number(b.due.never) - Number(a.due.never)
        || a.task.name.localeCompare(b.task.name, 'de'));
    return (Object.keys(GROUP_LABELS) as DueBucket[])
      .map(key => ({ key, label: GROUP_LABELS[key], rows: rows.filter(row => row.due.bucket === key) }))
      .filter(group => group.rows.length);
  }

  get overdueCount(): number { return this.rows().filter(r => r.due.bucket === 'overdue').length; }
  get todayCount(): number { return this.rows().filter(r => r.due.bucket === 'today').length; }
  get dueCount(): number { return this.rows().filter(r => this.isDue(r)).length; }

  get myTurnCount(): number {
    const me = this.me?.id;
    return me ? this.rows().filter(r => r.task.assignedTo === me && this.isDue(r)).length : 0;
  }

  /** Rooms in use; the room filter only appears with two or more. */
  get rooms() { return ROOMS.filter(r => this.active.some(t => t.category === r.key)); }

  roomCount(key: CleaningCategory): number {
    return this.rows().filter(row => this.matches(row, { ...this.filters, room: key })).length;
  }

  statusCount(status: StatusFilter): number {
    return this.rows().filter(row => this.matches(row, { ...this.filters, status })).length;
  }

  get shares(): PersonShare[] { return personShares(this.tasks, this.people); }

  get maxDone(): number { return Math.max(1, ...this.shares.map(s => s.done)); }

  get recent(): RecentLog[] { return recentLogs(this.tasks, 5); }

  get doneThisWeek(): number {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    const from = localIsoDate(since);
    return this.tasks.reduce((n, t) => n + (t.logs ?? []).filter(l => l.doneAt >= from).length, 0);
  }

  firstName(name: string | null | undefined): string { return (name ?? '').split(' ')[0]; }

  // ── Filters ───────────────────────────────────────────────────────────────
  setFilter(change: Partial<CleaningFilters>): void {
    this.filters = { ...this.filters, ...change };
    saveFilters('cleaning', this.filters);
  }

  toggle(key: 'person' | 'room', value: string): void {
    this.setFilter({ [key]: this.filters[key] === value ? '' : value });
  }

  resetFilters(): void { this.setFilter(DEFAULT_FILTERS); }

  get filtersActive(): boolean { return filtersChanged(this.filters, DEFAULT_FILTERS); }

  // ── Completing ────────────────────────────────────────────────────────────
  /** One tap: done today, by me. */
  quickDone(task: CleaningTask): void {
    this.logCompletion(task, { doneAt: localIsoDate(new Date()), doneBy: this.me?.id ?? null, note: '' });
  }

  openComplete(task: CleaningTask): void {
    this.completeError = '';
    this.completing = task;
    this.editing = undefined;
  }

  confirmComplete(entry: CompletionEntry): void {
    if (this.completing) this.logCompletion(this.completing, entry, true);
  }

  private logCompletion(task: CleaningTask, entry: CompletionEntry, fromDialog = false): void {
    if (this.pendingIds.has(task.id)) return;
    this.pendingIds = new Set(this.pendingIds).add(task.id);
    this.actionError = '';
    if (fromDialog) { this.completeSaving = true; this.completeError = ''; }
    this.service.complete(task.id, { doneAt: entry.doneAt, doneBy: entry.doneBy, note: entry.note }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => {
        const next = new Set(this.pendingIds);
        next.delete(task.id);
        this.pendingIds = next;
        this.completeSaving = false;
        this.cdr.markForCheck();
      }),
    ).subscribe({
      next: ({ log, task: updated }) => {
        this.replace(updated);
        this.completing = null;
        const who = log.doneBy && log.doneBy !== this.me?.id ? ` von ${this.firstName(log.doneByName)}` : '';
        const turn = updated.rotation?.length && updated.assignedToName
          ? ` · als Nächstes ${this.firstName(updated.assignedToName)}` : '';
        this.offerUndo(`„${task.name}“ erledigt${who}${turn}`, log.id);
      },
      error: () => {
        const message = 'Konnte nicht gespeichert werden. Bitte erneut versuchen.';
        if (fromDialog) this.completeError = message; else this.actionError = message;
      },
    });
  }

  private offerUndo(message: string, logId: string): void {
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.undoAction = { message, logId };
    this.undoTimer = setTimeout(() => { this.undoAction = null; this.cdr.markForCheck(); }, 8000);
  }

  undo(): void {
    const action = this.undoAction;
    if (!action) return;
    this.undoAction = null;
    if (this.undoTimer) clearTimeout(this.undoTimer);
    this.service.undo(action.logId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: task => { this.replace(task); this.cdr.markForCheck(); },
      error: () => { this.actionError = 'Rückgängig machen fehlgeschlagen.'; this.cdr.markForCheck(); },
    });
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  openAdd(): void { this.editing = null; }

  openEdit(task: CleaningTask): void { this.editing = task; }

  closeEditor(): void { this.editing = undefined; }

  onSaved(task: CleaningTask): void {
    const known = this.tasks.some(t => t.id === task.id);
    this.tasks = known ? this.tasks.map(t => t.id === task.id ? task : t) : [...this.tasks, task];
    this.editing = undefined;
  }

  onDeleted(id: string): void {
    this.tasks = this.tasks.filter(t => t.id !== id);
    this.editing = undefined;
  }

  replace(task: CleaningTask): void {
    this.tasks = this.tasks.map(t => t.id === task.id ? task : t);
  }
}
