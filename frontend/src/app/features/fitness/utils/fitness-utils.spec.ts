import { Workout, WorkoutEntry } from '../model/fitness.model';
import {
  entryMeasures, entrySummary, estimateCalories, lastEntry, oneRepMax, personalRecords, progressSeries, weeklyTotals,
  workoutCalories,
} from './fitness-utils';

const press = (machine: number, sets: [number, number][], factor = 1): WorkoutEntry => ({
  exerciseType: 1, machine, exerciseName: 'Beinpresse', kind: 'strength', met: 5, weightFactor: factor,
  machineLabel: machine === 1 ? 'Technogym' : 'Gym80', sets: sets.map(([reps, weight]) => ({ reps, weight })),
});
const run = (minutes: number, km: number): WorkoutEntry => ({
  exerciseType: 2, machine: null, exerciseName: 'Laufband', kind: 'cardio', met: 8, sets: [], durationMinutes: minutes,
  distanceKm: km,
});
const workout = (id: string, date: string, entries: WorkoutEntry[], extra: Partial<Workout> = {}): Workout =>
  ({ id, date, durationMinutes: null, gym: '', notes: '', calories: null, bodyWeightKg: 80, entries, ...extra });

describe('fitness utils', () => {
  it('estimates calories from cardio minutes and the remaining time for strength sets', () => {
    // 20 min running at MET 8, 80 kg = 213 kcal; 40 min strength at MET 5 = 267 kcal
    const w = workout('a', '2026-11-10', [run(20, 3), press(1, [[10, 80], [10, 80]])], { durationMinutes: 60 });
    expect(estimateCalories(w)).toBe(480);
    // Without a duration: 2.5 min per set
    expect(estimateCalories(workout('b', '2026-11-10', [press(1, [[10, 80], [10, 80]])]))).toBe(33);
    expect(estimateCalories(workout('c', '2026-11-10', [], { durationMinutes: 30, bodyWeightKg: null }), 70)).toBe(175);
    expect(workoutCalories({ ...w, calories: 510 })).toEqual({ value: 510, estimated: false });
  });

  it('measures strength sets, also on the reference scale', () => {
    expect(oneRepMax(100, 1)).toBe(100);
    expect(oneRepMax(90, 10)).toBe(120);
    const entry = press(2, [[12, 50], [10, 60], [0, 0]], 1.2);
    expect(entryMeasures(entry)).toEqual({ maxWeight: 60, e1rm: 80, volume: 1200, reps: 22, sets: 2 });
    expect(entryMeasures(entry, true).maxWeight).toBe(72);
    expect(entrySummary(press(1, [[10, 80], [10, 80], [10, 80]]))).toBe('3 × 10 · 80 kg');
    expect(entrySummary(press(1, [[12, 70], [8, 90]]))).toBe('2 Sätze · 70–90 kg');
    expect(entrySummary(run(20, 3.15))).toBe('20 min · 3.15 km');
  });

  it('builds progress per machine with one point per day and compares makers via the factor', () => {
    const workouts = [
      workout('2', '2026-11-12', [press(2, [[10, 50]], 1.2)]),
      workout('1', '2026-11-05', [press(1, [[10, 80]]), press(1, [[8, 85]])]),
      workout('3', '2026-11-14', [press(1, [[10, 82.5]])]),
    ];
    const series = progressSeries(workouts, 1, 'maxWeight', { perMachine: true, normalized: true });
    expect(series.map((s) => [s.label, s.points.map((p) => p.value)])).toEqual([
      ['Technogym', [85, 82.5]], ['Gym80', [60]],
    ]);
    expect(progressSeries(workouts, 1, 'maxWeight')[0].points.map((p) => p.date))
      .toEqual(['2026-11-05', '2026-11-12', '2026-11-14']);
    expect(progressSeries([workout('r', '2026-11-01', [run(30, 5)])], 2, 'speed')[0].points[0].value).toBe(10);
    expect(personalRecords(workouts)[0]).toMatchObject({ name: 'Beinpresse', value: 110, reps: 10, weight: 82.5 });
    expect(lastEntry(workouts, 1, 2)?.date).toBe('2026-11-12');
    expect(lastEntry(workouts, 1, 1, '3')?.date).toBe('2026-11-05');
  });

  it('sums the last weeks, oldest first', () => {
    const today = new Date(2026, 10, 15); // Sunday
    const weeks = weeklyTotals([
      workout('a', '2026-11-15', [], { durationMinutes: 60, calories: 400 }),
      workout('b', '2026-11-10', [], { durationMinutes: 45, calories: 300 }),
      workout('c', '2026-11-03', [], { calories: 200 }),
      workout('old', '2026-01-01', [], { calories: 999 }),
    ], 3, null, today);
    expect(weeks.map((w) => [w.start, w.workouts, w.calories, w.minutes])).toEqual([
      ['2026-10-26', 0, 0, 0], ['2026-11-02', 1, 200, 0], ['2026-11-09', 2, 700, 105],
    ]);
  });
});
