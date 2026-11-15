import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, finalize, forkJoin } from 'rxjs';
import { AuthService } from '../../../core/auth/service/auth.service';
import { apiErrorMessage } from '../../../shared/utils/api-error';
import { BarChart, ChartSeries, LineChart, SERIES_COLORS } from '../chart/fitness-charts';
import { WorkoutEditor } from '../editor/workout-editor';
import { ExerciseKind, ExerciseType, FitnessProfile, GymMachine, MuscleGroup, Workout } from '../model/fitness.model';
import { FitnessService } from '../service/fitness.service';
import {
  MANUFACTURERS, METRIC_LABELS, MUSCLE_LABELS, Metric, PersonalRecord, entryMeasures, entrySummary, formatNumber,
  isoDate, machineLabel, parseDay, personalRecords, progressSeries, usedExercises, weeklyTotals, workoutCalories,
} from '../utils/fitness-utils';

type Tab = 'workouts' | 'progress' | 'machines';
type WeekMetric = 'workouts' | 'calories' | 'minutes';

const OTHER_COLOR = '#8a94a0';

/**
 * Personal training log: gym days with machines, sets and calories; progress charts per exercise
 * (machines of different makers compared via their weight factor); the shared machine catalog.
 */
@Component({
  selector: 'fitness-page',
  standalone: true,
  imports: [FormsModule, WorkoutEditor, LineChart, BarChart],
  templateUrl: './fitness.page.html',
  styleUrl: './fitness.page.css',
})
export class FitnessPage implements OnInit {
  private readonly service = inject(FitnessService);
  private readonly auth = inject(AuthService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  tab: Tab = 'workouts';
  workouts: Workout[] = [];
  types: ExerciseType[] = [];
  machines: GymMachine[] = [];
  profile: FitnessProfile = { bodyWeightKg: null, defaultGym: '' };
  loading = false;
  loadError = '';
  actionError = '';
  notice = '';

  /** undefined: closed, null: new. */
  editing: Workout | null | undefined = undefined;

  // Progress
  exerciseId: number | null = null;
  metric: Metric = 'maxWeight';
  perMachine = true;
  normalized = false;
  weekMetric: WeekMetric = 'workouts';

  // Catalog forms
  machineDraft = { exerciseType: null as number | null, manufacturer: '', model: '', weightFactor: 1 };
  typeDraft = { name: '', kind: 'strength' as ExerciseKind, muscleGroup: 'beine' as MuscleGroup };
  showTypeForm = false;
  confirmMachineId: number | null = null;
  saving = false;

  readonly MUSCLE_LABELS = MUSCLE_LABELS;
  readonly MUSCLES = Object.entries(MUSCLE_LABELS) as [MuscleGroup, string][];
  readonly MANUFACTURERS = MANUFACTURERS;
  readonly METRIC_LABELS = METRIC_LABELS;
  readonly entrySummary = entrySummary;
  readonly machineLabel = machineLabel;
  readonly formatNumber = formatNumber;

  ngOnInit(): void {
    try {
      const saved = localStorage.getItem('fitness:tab') as Tab | null;
      if (saved === 'workouts' || saved === 'progress' || saved === 'machines') this.tab = saved;
    } catch { /* private mode */ }
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.auth.ensureAccessToken().pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      forkJoin({
        workouts: this.service.getWorkouts(), types: this.service.getExerciseTypes(),
        machines: this.service.getMachines(), profile: this.service.getProfile(),
      }).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.loading = false; this.cdr.markForCheck(); }))
        .subscribe({
          next: ({ workouts, types, machines, profile }) => {
            this.workouts = workouts;
            this.types = types;
            this.machines = machines;
            this.profile = profile;
            this.ensureExercise();
          },
          error: () => { this.loadError = 'Fitness-Daten konnten nicht geladen werden.'; },
        });
    });
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    try { localStorage.setItem('fitness:tab', tab); } catch { /* ignore */ }
  }

  // ── Overview ──────────────────────────────────────────────────────────────
  calories(workout: Workout) { return workoutCalories(workout, this.profile.bodyWeightKg); }

  get monthCount(): number {
    const prefix = isoDate(new Date()).slice(0, 7);
    return this.workouts.filter((w) => w.date.startsWith(prefix)).length;
  }

  get weekCalories(): number {
    const last = weeklyTotals(this.workouts, 1, this.profile.bodyWeightKg)[0];
    return last?.calories ?? 0;
  }

  get perWeek(): string {
    const weeks = weeklyTotals(this.workouts, 8, this.profile.bodyWeightKg);
    return formatNumber(weeks.reduce((s, w) => s + w.workouts, 0) / weeks.length);
  }

  get lastWorkoutText(): string {
    const last = this.workouts[0];
    if (!last) return '–';
    const days = Math.round((parseDay(isoDate(new Date())).getTime() - parseDay(last.date).getTime()) / 86_400_000);
    return days <= 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`;
  }

  /** Workouts grouped by month, newest first. */
  get months(): { label: string; workouts: Workout[] }[] {
    const groups = new Map<string, Workout[]>();
    for (const w of this.workouts) groups.set(w.date.slice(0, 7), [...(groups.get(w.date.slice(0, 7)) ?? []), w]);
    return [...groups.entries()].map(([key, workouts]) => ({
      label: parseDay(`${key}-01`).toLocaleDateString('de-CH', { month: 'long', year: 'numeric' }), workouts,
    }));
  }

  dayLabel(value: string): string {
    return parseDay(value).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric' });
  }

  // ── Progress ──────────────────────────────────────────────────────────────
  get usedTypes(): ExerciseType[] { return usedExercises(this.workouts, this.types); }

  get exercise(): ExerciseType | undefined { return this.types.find((t) => t.id === this.exerciseId); }

  get metrics(): Metric[] {
    return this.exercise?.kind === 'cardio' ? ['distanceKm', 'durationMinutes', 'speed'] : ['maxWeight', 'e1rm', 'volume'];
  }

  private ensureExercise(): void {
    const used = this.usedTypes;
    if (!used.some((t) => t.id === this.exerciseId)) this.selectExercise(used[0]?.id ?? null);
  }

  selectExercise(id: number | null): void {
    this.exerciseId = id;
    if (!this.metrics.includes(this.metric)) this.metric = this.metrics[0];
  }

  /** Colour per machine in catalog order, so a machine keeps its colour whatever is filtered. */
  private colorFor(key: string, index: number): string {
    if (!this.perMachine) return SERIES_COLORS[0];
    const order = this.machines.filter((m) => m.exerciseType === this.exerciseId).map((m) => String(m.id));
    const at = key === 'none' ? order.length : order.indexOf(key);
    const slot = at >= 0 ? at : index;
    return SERIES_COLORS[slot] ?? OTHER_COLOR;
  }

  get chartSeries(): ChartSeries[] {
    if (this.exerciseId == null) return [];
    return progressSeries(this.workouts, this.exerciseId, this.metric,
      { normalized: this.normalized, perMachine: this.perMachine })
      .map((s, i) => ({ ...s, color: this.colorFor(s.key, i) }));
  }

  /** Comparing makers only makes sense when the exercise was done on 2+ machines. */
  get machineCount(): number {
    const ids = new Set<number | null>();
    for (const w of this.workouts) for (const e of w.entries) if (e.exerciseType === this.exerciseId) ids.add(e.machine);
    return ids.size;
  }

  get hasFactors(): boolean {
    return this.machines.some((m) => m.exerciseType === this.exerciseId && m.weightFactor !== 1);
  }

  get records(): PersonalRecord[] { return personalRecords(this.workouts).slice(0, 8); }

  get weekBars(): { label: string; value: number; note?: string }[] {
    return weeklyTotals(this.workouts, 12, this.profile.bodyWeightKg).map((w) => ({
      label: w.label,
      value: w[this.weekMetric],
      note: `${w.workouts} Training${w.workouts === 1 ? '' : 's'} · ≈ ${formatNumber(w.calories, 0)} kcal`,
    }));
  }

  get weekUnit(): string {
    return { workouts: 'Trainings', calories: 'kcal', minutes: 'min' }[this.weekMetric];
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  openAdd(): void { this.editing = null; }

  openEdit(workout: Workout): void { this.editing = workout; }

  onSaved(workout: Workout): void {
    const exists = this.workouts.some((w) => w.id === workout.id);
    this.workouts = (exists ? this.workouts.map((w) => (w.id === workout.id ? workout : w)) : [workout, ...this.workouts])
      .sort((a, b) => b.date.localeCompare(a.date));
    this.editing = undefined;
    this.ensureExercise();
  }

  onDeleted(id: string): void {
    this.workouts = this.workouts.filter((w) => w.id !== id);
    this.editing = undefined;
    this.ensureExercise();
  }

  onMachineCreated(machine: GymMachine): void {
    this.machines = [...this.machines, machine];
  }

  // ── Catalog ───────────────────────────────────────────────────────────────
  get machineGroups(): { type: ExerciseType; machines: GymMachine[] }[] {
    return this.types
      .map((type) => ({ type, machines: this.machines.filter((m) => m.exerciseType === type.id) }))
      .filter((g) => g.machines.length);
  }

  /** Heaviest set ever on a machine: as shown and on the reference scale. */
  machineBest(machine: GymMachine): { raw: number; normalized: number } | null {
    let raw = 0;
    for (const w of this.workouts) for (const e of w.entries) {
      if (e.machine === machine.id) raw = Math.max(raw, entryMeasures(e).maxWeight);
    }
    return raw ? { raw, normalized: raw * machine.weightFactor } : null;
  }

  usedMachine(machine: GymMachine): boolean {
    return this.workouts.some((w) => w.entries.some((e) => e.machine === machine.id));
  }

  saveProfile(): void {
    this.run(this.service.saveProfile(this.profile), (profile) => {
      this.profile = profile;
      this.notice = 'Gespeichert.';
    }, 'Profil konnte nicht gespeichert werden.');
  }

  addMachine(): void {
    const d = this.machineDraft;
    if (!d.exerciseType || !d.manufacturer.trim()) return;
    this.run(this.service.createMachine({ ...d, exerciseType: d.exerciseType }), (machine) => {
      this.machines = [...this.machines, machine];
      this.machineDraft = { exerciseType: d.exerciseType, manufacturer: '', model: '', weightFactor: 1 };
      this.notice = `${machine.exerciseName} von ${machineLabel(machine)} hinzugefügt.`;
    }, 'Gerät konnte nicht gespeichert werden.');
  }

  updateFactor(machine: GymMachine, value: number | null): void {
    if (!value || value < 0.1 || value > 10 || value === machine.weightFactor) return;
    this.run(this.service.updateMachine(machine.id, { weightFactor: value }), (updated) => {
      this.machines = this.machines.map((m) => (m.id === updated.id ? updated : m));
      // Old workouts show the factor of their machine, so update them locally too.
      this.workouts = this.workouts.map((w) => ({
        ...w, entries: w.entries.map((e) => (e.machine === updated.id ? { ...e, weightFactor: updated.weightFactor } : e)),
      }));
    }, 'Faktor konnte nicht gespeichert werden.');
  }

  deleteMachine(machine: GymMachine): void {
    if (this.confirmMachineId !== machine.id) { this.confirmMachineId = machine.id; return; }
    this.run(this.service.deleteMachine(machine.id), () => {
      this.machines = this.machines.filter((m) => m.id !== machine.id);
      this.confirmMachineId = null;
    }, 'Gerät konnte nicht gelöscht werden.');
  }

  addType(): void {
    const d = this.typeDraft;
    if (!d.name.trim()) return;
    const met = d.kind === 'cardio' ? 7 : 4;
    const muscleGroup = d.kind === 'cardio' ? 'cardio' : d.muscleGroup;
    this.run(this.service.createExerciseType({ name: d.name.trim(), kind: d.kind, muscleGroup, met }), (type) => {
      this.types = [...this.types, type].sort((a, b) => a.name.localeCompare(b.name, 'de'));
      this.typeDraft = { name: '', kind: 'strength', muscleGroup: 'beine' };
      this.showTypeForm = false;
      this.machineDraft.exerciseType = type.id;
      this.notice = `Übung «${type.name}» hinzugefügt.`;
    }, 'Übung konnte nicht gespeichert werden.');
  }

  private run<T>(request: Observable<T>, done: (value: T) => void, message: string): void {
    if (this.saving) return;
    this.saving = true;
    this.actionError = '';
    this.notice = '';
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.saving = false; this.cdr.markForCheck(); }))
      .subscribe({ next: done, error: (error) => { this.actionError = apiErrorMessage(error, message); } });
  }
}
