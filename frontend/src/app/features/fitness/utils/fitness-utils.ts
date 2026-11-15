import { ExerciseType, GymMachine, Workout, WorkoutEntry, WorkoutSet } from '../model/fitness.model';

/** Pure fitness logic: calorie estimate, strength measures, progress series and weekly totals. */

export const DEFAULT_BODY_WEIGHT = 75;
/** Minutes per strength set including rest, when the workout has no duration. */
export const MINUTES_PER_SET = 2.5;

export const MUSCLE_LABELS: Record<string, string> = {
  beine: 'Beine', brust: 'Brust', ruecken: 'Rücken', schultern: 'Schultern', arme: 'Arme',
  bauch: 'Bauch & Rumpf', ganzkoerper: 'Ganzkörper', cardio: 'Ausdauer',
};

export const MANUFACTURERS = [
  'Technogym', 'Gym80', 'Life Fitness', 'Matrix', 'Precor', 'Cybex', 'Hammer Strength', 'Nautilus', 'eGym',
  'Milon', 'Panatta', 'Star Trac', 'Concept2', 'Schnell', 'Hoist', 'Freie Gewichte',
];

const isCardio = (entry: WorkoutEntry) => entry.kind === 'cardio';
const filledSets = (entry: WorkoutEntry) => entry.sets.filter((s) => (s.reps ?? 0) > 0 || (s.weight ?? 0) > 0);

export function bodyWeight(workout: Workout, fallback?: number | null): number {
  return workout.bodyWeightKg ?? fallback ?? DEFAULT_BODY_WEIGHT;
}

/**
 * Estimated kcal: MET × body weight × hours per exercise. Cardio uses its own minutes; the remaining
 * workout time is shared among the strength sets (2.5 min per set when no duration is known).
 */
export function estimateCalories(workout: Workout, fallbackKg?: number | null): number {
  const kg = bodyWeight(workout, fallbackKg);
  const cardio = workout.entries.filter(isCardio);
  const strength = workout.entries.filter((e) => !isCardio(e));
  const cardioMinutes = cardio.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const setCount = strength.reduce((sum, e) => sum + Math.max(1, filledSets(e).length), 0);
  let kcal = cardio.reduce((sum, e) => sum + (e.met ?? 7) * kg * ((e.durationMinutes ?? 0) / 60), 0);
  if (strength.length) {
    const strengthMinutes = workout.durationMinutes
      ? Math.max(0, workout.durationMinutes - cardioMinutes)
      : setCount * MINUTES_PER_SET;
    kcal += strength.reduce((sum, e) => {
      const share = Math.max(1, filledSets(e).length) / setCount;
      return sum + (e.met ?? 5) * kg * ((strengthMinutes * share) / 60);
    }, 0);
  } else if (!cardio.length && workout.durationMinutes) {
    kcal += 5 * kg * (workout.durationMinutes / 60);
  }
  return Math.round(kcal);
}

/** The calories to show: own value if entered, otherwise the estimate. */
export function workoutCalories(workout: Workout, fallbackKg?: number | null): { value: number; estimated: boolean } {
  return workout.calories != null
    ? { value: workout.calories, estimated: false }
    : { value: estimateCalories(workout, fallbackKg), estimated: true };
}

/** Estimated one-rep max (Epley). */
export function oneRepMax(weight: number, reps: number): number {
  if (!weight || !reps) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export interface EntryMeasures {
  /** Heaviest set (machine kg). */
  maxWeight: number;
  e1rm: number;
  volume: number;
  reps: number;
  sets: number;
}

/** Strength measures of one entry, optionally on the reference scale (× machine factor). */
export function entryMeasures(entry: WorkoutEntry, normalized = false): EntryMeasures {
  const factor = normalized ? (entry.weightFactor ?? 1) : 1;
  const sets = filledSets(entry);
  return sets.reduce<EntryMeasures>((m, s: WorkoutSet) => {
    const weight = (s.weight ?? 0) * factor;
    const reps = s.reps ?? 0;
    return {
      maxWeight: Math.max(m.maxWeight, weight),
      e1rm: Math.max(m.e1rm, oneRepMax(weight, reps)),
      volume: m.volume + weight * reps,
      reps: m.reps + reps,
      sets: m.sets + 1,
    };
  }, { maxWeight: 0, e1rm: 0, volume: 0, reps: 0, sets: 0 });
}

export type StrengthMetric = 'maxWeight' | 'e1rm' | 'volume' | 'reps';
export type CardioMetric = 'distanceKm' | 'durationMinutes' | 'speed';
export type Metric = StrengthMetric | CardioMetric;

export const METRIC_LABELS: Record<Metric, { label: string; unit: string }> = {
  maxWeight: { label: 'Schwerster Satz', unit: 'kg' },
  e1rm: { label: 'Geschätztes Maximum (1 Wdh.)', unit: 'kg' },
  volume: { label: 'Volumen (Wdh. × kg)', unit: 'kg' },
  reps: { label: 'Wiederholungen', unit: 'Wdh.' },
  distanceKm: { label: 'Distanz', unit: 'km' },
  durationMinutes: { label: 'Dauer', unit: 'min' },
  speed: { label: 'Tempo', unit: 'km/h' },
};

export interface Point { date: string; value: number; }
export interface Series { key: string; label: string; points: Point[]; }

function metricValue(entry: WorkoutEntry, metric: Metric, normalized: boolean): number {
  if (metric === 'distanceKm') return entry.distanceKm ?? 0;
  if (metric === 'durationMinutes') return entry.durationMinutes ?? 0;
  if (metric === 'speed') {
    return entry.distanceKm && entry.durationMinutes ? entry.distanceKm / (entry.durationMinutes / 60) : 0;
  }
  return entryMeasures(entry, normalized)[metric];
}

/**
 * Progress of one exercise over time: one series per machine (to compare manufacturers),
 * or a single combined series. One point per day (the best value of that day).
 */
export function progressSeries(
  workouts: Workout[], exerciseType: number, metric: Metric,
  options: { normalized?: boolean; perMachine?: boolean } = {},
): Series[] {
  const byKey = new Map<string, Series>();
  for (const workout of [...workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const entry of workout.entries) {
      if (entry.exerciseType !== exerciseType) continue;
      const value = metricValue(entry, metric, !!options.normalized);
      if (!value) continue;
      const key = options.perMachine ? String(entry.machine ?? 'none') : 'all';
      const label = options.perMachine ? entry.machineLabel || 'Ohne Gerät' : entry.exerciseName ?? '';
      const series = byKey.get(key) ?? { key, label, points: [] };
      const last = series.points[series.points.length - 1];
      if (last?.date === workout.date) last.value = Math.max(last.value, value);
      else series.points.push({ date: workout.date, value: round(value) });
      byKey.set(key, series);
    }
  }
  return [...byKey.values()];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface WeekTotal { start: string; label: string; workouts: number; calories: number; minutes: number; }

function monday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function isoDate(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function parseDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Training count, kcal and minutes per week for the last `weeks` weeks (oldest first). */
export function weeklyTotals(workouts: Workout[], weeks = 12, fallbackKg?: number | null, today = new Date()): WeekTotal[] {
  const first = monday(today);
  first.setDate(first.getDate() - (weeks - 1) * 7);
  const totals: WeekTotal[] = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(first);
    start.setDate(first.getDate() + i * 7);
    return { start: isoDate(start), label: `${start.getDate()}.${start.getMonth() + 1}.`, workouts: 0, calories: 0,
      minutes: 0 };
  });
  for (const workout of workouts) {
    const index = Math.floor((monday(parseDay(workout.date)).getTime() - first.getTime()) / (7 * 86_400_000) + 0.5);
    const week = totals[index];
    if (!week) continue;
    week.workouts += 1;
    week.calories += workoutCalories(workout, fallbackKg).value;
    week.minutes += workout.durationMinutes ?? 0;
  }
  return totals;
}

export interface PersonalRecord { exerciseType: number; name: string; value: number; reps: number; weight: number;
  date: string; machineLabel: string; }

/** Best estimated one-rep max per strength exercise (reference scale), newest records first. */
export function personalRecords(workouts: Workout[]): PersonalRecord[] {
  const best = new Map<number, PersonalRecord>();
  for (const workout of workouts) {
    for (const entry of workout.entries) {
      if (isCardio(entry)) continue;
      for (const s of filledSets(entry)) {
        const weight = (s.weight ?? 0) * (entry.weightFactor ?? 1);
        const value = oneRepMax(weight, s.reps ?? 0);
        const current = best.get(entry.exerciseType);
        if (value > 0 && (!current || value > current.value)) {
          best.set(entry.exerciseType, { exerciseType: entry.exerciseType, name: entry.exerciseName ?? '',
            value: round(value), reps: s.reps ?? 0, weight: s.weight ?? 0, date: workout.date,
            machineLabel: entry.machineLabel ?? '' });
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, 'de'));
}

/** The most recent entry for this machine (or exercise without machine), to prefill the next sets. */
export function lastEntry(workouts: Workout[], exerciseType: number, machine: number | null,
  excludeWorkoutId?: string): { entry: WorkoutEntry; date: string } | undefined {
  const sorted = [...workouts].filter((w) => w.id !== excludeWorkoutId).sort((a, b) => b.date.localeCompare(a.date));
  for (const workout of sorted) {
    const entry = workout.entries.find((e) => e.exerciseType === exerciseType && (e.machine ?? null) === machine);
    if (entry) return { entry, date: workout.date };
  }
  return undefined;
}

/** "Technogym Selection 700" */
export function machineLabel(machine: GymMachine | undefined): string {
  return machine ? [machine.manufacturer, machine.model].filter(Boolean).join(' ') : '';
}

/** Exercises that appear in the workouts, most used first. */
export function usedExercises(workouts: Workout[], types: ExerciseType[]): ExerciseType[] {
  const counts = new Map<number, number>();
  for (const w of workouts) for (const e of w.entries) counts.set(e.exerciseType, (counts.get(e.exerciseType) ?? 0) + 1);
  return types.filter((t) => counts.has(t.id))
    .sort((a, b) => (counts.get(b.id)! - counts.get(a.id)!) || a.name.localeCompare(b.name, 'de'));
}

export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString('de-CH', { maximumFractionDigits: digits });
}

/** Short summary of an entry: "3 × 10 · 80 kg" or "20 min · 3.1 km". */
export function entrySummary(entry: WorkoutEntry): string {
  if (isCardio(entry)) {
    return [entry.durationMinutes ? `${formatNumber(entry.durationMinutes)} min` : '',
      entry.distanceKm ? `${formatNumber(entry.distanceKm, 2)} km` : '', entry.level ? `Stufe ${entry.level}` : '']
      .filter(Boolean).join(' · ');
  }
  const sets = filledSets(entry);
  if (!sets.length) return '';
  const reps = new Set(sets.map((s) => s.reps ?? 0));
  const weights = sets.map((s) => s.weight ?? 0);
  const repText = reps.size === 1 ? `${sets.length} × ${sets[0].reps ?? 0}` : `${sets.length} Sätze`;
  const max = Math.max(...weights);
  const min = Math.min(...weights);
  const weightText = !max ? '' : min === max ? `${formatNumber(max)} kg` : `${formatNumber(min)}–${formatNumber(max)} kg`;
  return [repText, weightText].filter(Boolean).join(' · ');
}
