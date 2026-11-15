import {
  ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { ExerciseType, GymMachine, Workout, WorkoutEntry, WorkoutSet } from '../model/fitness.model';
import { FitnessService } from '../service/fitness.service';
import {
  MANUFACTURERS, MUSCLE_LABELS, entrySummary, estimateCalories, isoDate, lastEntry, machineLabel,
} from '../utils/fitness-utils';

interface EntryForm extends WorkoutEntry {
  /** Local key for tracking rows. */
  key: number;
  newMachine?: { manufacturer: string; model: string; weightFactor: number } | null;
}

/**
 * One gym day: date, duration, the exercises with their sets (or minutes/distance for cardio)
 * and the calories – estimated unless an own value is entered.
 */
@Component({
  selector: 'app-workout-editor',
  standalone: true,
  imports: [DialogDirective, FormsModule],
  templateUrl: './workout-editor.html',
  styleUrls: ['../../todos/editor/todo-editor.css', './workout-editor.css'],
})
export class WorkoutEditor implements OnInit {
  @Input() workout: Workout | null = null;
  @Input() workouts: Workout[] = [];
  @Input() types: ExerciseType[] = [];
  @Input() machines: GymMachine[] = [];
  @Input() bodyWeightKg: number | null = null;
  @Input() defaultGym = '';
  @Output() saved = new EventEmitter<Workout>();
  @Output() deleted = new EventEmitter<string>();
  @Output() machineCreated = new EventEmitter<GymMachine>();
  @Output() closed = new EventEmitter<void>();

  private readonly service = inject(FitnessService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private nextKey = 1;

  date = '';
  durationMinutes: number | null = null;
  gym = '';
  notes = '';
  calories: number | null = null;
  weight: number | null = null;
  entries: EntryForm[] = [];

  pickerOpen = false;
  pickerQuery = '';
  saving = false;
  formError = '';
  dateError = '';
  confirmDelete = false;

  readonly today = isoDate(new Date());
  readonly yesterday = isoDate(new Date(Date.now() - 86_400_000));
  readonly MANUFACTURERS = MANUFACTURERS;
  readonly entrySummary = entrySummary;
  readonly machineLabel = machineLabel;

  get isNew(): boolean { return !this.workout?.id; }

  ngOnInit(): void {
    const w = this.workout;
    this.date = w?.date ?? this.today;
    this.durationMinutes = w?.durationMinutes ?? null;
    this.gym = w?.gym ?? this.defaultGym;
    this.notes = w?.notes ?? '';
    this.calories = w?.calories ?? null;
    this.weight = w?.bodyWeightKg ?? this.bodyWeightKg;
    this.entries = (w?.entries ?? []).map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })), key: this.nextKey++ }));
    this.pickerOpen = this.isNew;
  }

  // ── Lookups ───────────────────────────────────────────────────────────────
  type(id: number): ExerciseType | undefined { return this.types.find((t) => t.id === id); }

  machinesFor(typeId: number): GymMachine[] { return this.machines.filter((m) => m.exerciseType === typeId); }

  isCardio(entry: WorkoutEntry): boolean { return this.type(entry.exerciseType)?.kind === 'cardio'; }

  get gyms(): string[] {
    return [...new Set(this.workouts.map((w) => w.gym).filter(Boolean))];
  }

  /** Machines used before, most recent first – the quickest way to add the usual exercises. */
  get recentMachines(): GymMachine[] {
    const seen: number[] = [];
    for (const w of [...this.workouts].sort((a, b) => b.date.localeCompare(a.date))) {
      for (const e of w.entries) if (e.machine && !seen.includes(e.machine)) seen.push(e.machine);
    }
    return seen.map((id) => this.machines.find((m) => m.id === id)).filter((m): m is GymMachine => !!m)
      .filter((m) => this.matchesQuery(`${m.exerciseName} ${machineLabel(m)}`)).slice(0, 8);
  }

  /** Exercise types grouped by muscle group, filtered by the search field. */
  get typeGroups(): { label: string; types: ExerciseType[] }[] {
    const groups = new Map<string, ExerciseType[]>();
    for (const t of this.types) {
      if (!this.matchesQuery(`${t.name} ${MUSCLE_LABELS[t.muscleGroup]} ${this.machinesFor(t.id).map(machineLabel).join(' ')}`)) {
        continue;
      }
      const label = MUSCLE_LABELS[t.muscleGroup] ?? 'Weitere';
      groups.set(label, [...(groups.get(label) ?? []), t]);
    }
    return [...groups.entries()].map(([label, types]) => ({ label, types }));
  }

  private matchesQuery(text: string): boolean {
    const q = this.pickerQuery.trim().toLocaleLowerCase('de');
    return !q || text.toLocaleLowerCase('de').includes(q);
  }

  /** "Letztes Mal" for an entry (same machine, or same exercise without machine). */
  previous(entry: WorkoutEntry): { entry: WorkoutEntry; date: string } | undefined {
    return lastEntry(this.workouts, entry.exerciseType, entry.machine ?? null, this.workout?.id);
  }

  formatDay(value: string): string {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric' });
  }

  // ── Calories ──────────────────────────────────────────────────────────────
  get estimate(): number {
    return estimateCalories(this.toWorkout(), this.bodyWeightKg);
  }

  // ── Entries ───────────────────────────────────────────────────────────────
  addType(type: ExerciseType): void {
    const machines = this.machinesFor(type.id);
    this.addEntry(type, machines.length === 1 ? machines[0] : null);
  }

  addMachine(machine: GymMachine): void {
    const type = this.type(machine.exerciseType);
    if (type) this.addEntry(type, machine);
  }

  private addEntry(type: ExerciseType, machine: GymMachine | null): void {
    const entry: EntryForm = {
      key: this.nextKey++, exerciseType: type.id, machine: machine?.id ?? null, exerciseName: type.name,
      kind: type.kind, met: type.met, machineLabel: machineLabel(machine ?? undefined),
      weightFactor: machine?.weightFactor ?? 1, sets: [], durationMinutes: null, distanceKm: null, level: '',
    };
    this.prefill(entry);
    this.entries = [...this.entries, entry];
    this.pickerQuery = '';
    this.pickerOpen = false;
  }

  /** Same sets as last time on this machine (progressive overload starts from there). */
  private prefill(entry: EntryForm): void {
    const before = this.previous(entry)?.entry;
    if (entry.kind === 'cardio') {
      entry.durationMinutes = before?.durationMinutes ?? null;
      entry.distanceKm = before?.distanceKm ?? null;
      entry.level = before?.level ?? '';
      return;
    }
    entry.sets = before?.sets.length ? before.sets.map((s) => ({ ...s })) : [{ reps: null, weight: null }];
  }

  changeMachine(entry: EntryForm, value: string): void {
    if (value === 'new') {
      entry.newMachine = { manufacturer: '', model: '', weightFactor: 1 };
      return;
    }
    const machine = this.machines.find((m) => m.id === Number(value));
    entry.machine = machine?.id ?? null;
    entry.machineLabel = machineLabel(machine);
    entry.weightFactor = machine?.weightFactor ?? 1;
    entry.newMachine = null;
    if (!entry.sets.some((s) => s.reps || s.weight) && !entry.durationMinutes) this.prefill(entry);
  }

  createMachine(entry: EntryForm): void {
    const draft = entry.newMachine;
    if (!draft?.manufacturer.trim() || this.saving) return;
    this.saving = true;
    this.formError = '';
    this.service.createMachine({
      exerciseType: entry.exerciseType, manufacturer: draft.manufacturer.trim(), model: draft.model.trim(),
      weightFactor: draft.weightFactor || 1,
    }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({
        next: (machine) => {
          this.machines = [...this.machines, machine];
          this.machineCreated.emit(machine);
          this.changeMachine(entry, String(machine.id));
        },
        error: (error) => { this.formError = apiErrorMessage(error, 'Gerät konnte nicht gespeichert werden.'); },
      });
  }

  addSet(entry: EntryForm): void {
    const last = entry.sets[entry.sets.length - 1];
    entry.sets = [...entry.sets, { reps: last?.reps ?? null, weight: last?.weight ?? null }];
  }

  removeSet(entry: EntryForm, index: number): void {
    entry.sets = entry.sets.filter((_, i) => i !== index);
  }

  /** "+2.5": the next step on the same machine. */
  bump(set: WorkoutSet, delta: number): void {
    set.weight = Math.max(0, Math.round(((set.weight ?? 0) + delta) * 100) / 100);
  }

  moveEntry(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.entries.length) return;
    const list = [...this.entries];
    [list[index], list[target]] = [list[target], list[index]];
    this.entries = list;
  }

  removeEntry(index: number): void { this.entries = this.entries.filter((_, i) => i !== index); }

  // ── Save ──────────────────────────────────────────────────────────────────
  private toWorkout(): Workout {
    return {
      id: this.workout?.id ?? '', date: this.date, durationMinutes: this.durationMinutes || null, gym: this.gym.trim(),
      notes: this.notes.trim(), calories: this.calories ?? null, bodyWeightKg: this.weight || null,
      entries: this.entries.map(({ key: _key, newMachine: _new, ...entry }) => ({
        ...entry,
        sets: entry.sets.filter((s) => (s.reps ?? 0) > 0 || (s.weight ?? 0) > 0),
      })),
    };
  }

  close(): void { if (!this.saving) this.closed.emit(); }

  save(): void {
    if (this.saving) return;
    this.dateError = !this.date ? 'Bitte ein Datum wählen.' : this.date > this.today ? 'Das Datum liegt in der Zukunft.' : '';
    if (this.dateError) return;
    const { id: _id, ...payload } = this.toWorkout();
    const request: Observable<Workout> = this.isNew
      ? this.service.createWorkout(payload) : this.service.updateWorkout(this.workout!.id, payload);
    this.run(request, (workout) => this.saved.emit(workout), 'Training konnte nicht gespeichert werden.');
  }

  remove(): void {
    if (this.isNew || this.saving) return;
    if (!this.confirmDelete) { this.confirmDelete = true; return; }
    const id = this.workout!.id;
    this.run(this.service.deleteWorkout(id), () => this.deleted.emit(id), 'Löschen fehlgeschlagen.');
  }

  private run<T>(request: Observable<T>, done: (value: T) => void, message: string): void {
    this.saving = true;
    this.formError = '';
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({ next: done, error: (error) => { this.formError = apiErrorMessage(error, message); } });
  }

  trackKey(_: number, entry: EntryForm): number { return entry.key; }
}
