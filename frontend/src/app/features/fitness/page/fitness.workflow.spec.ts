import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/service/auth.service';
import { GymMachine, Workout } from '../model/fitness.model';
import { FitnessService } from '../service/fitness.service';
import { FitnessPage } from './fitness.page';

describe('Fitness page', () => {
  const machines: GymMachine[] = [
    { id: 1, exerciseType: 1, exerciseName: 'Beinpresse', manufacturer: 'Technogym', model: '', weightFactor: 1 },
    { id: 2, exerciseType: 1, exerciseName: 'Beinpresse', manufacturer: 'Gym80', model: '', weightFactor: 1.2 },
  ];
  const w = (id: string, date: string, machine: number, weight: number): Workout => ({
    id, date, durationMinutes: 60, gym: '', notes: '', calories: null, bodyWeightKg: 80,
    entries: [{ exerciseType: 1, machine, exerciseName: 'Beinpresse', kind: 'strength', met: 5,
      weightFactor: machine === 2 ? 1.2 : 1, machineLabel: machine === 2 ? 'Gym80' : 'Technogym',
      sets: [{ reps: 10, weight }] }],
  });
  const service = {
    getWorkouts: vi.fn(() => of([w('b', '2026-11-12', 2, 50), w('a', '2026-11-05', 1, 80)])),
    getExerciseTypes: vi.fn(() => of([{ id: 1, name: 'Beinpresse', kind: 'strength', muscleGroup: 'beine', met: 5 },
      { id: 2, name: 'Laufband', kind: 'cardio', muscleGroup: 'cardio', met: 8 }])),
    getMachines: vi.fn(() => of(machines)),
    getProfile: vi.fn(() => of({ bodyWeightKg: 80, defaultGym: '' })),
    updateMachine: vi.fn(), createMachine: vi.fn(), deleteMachine: vi.fn(), saveProfile: vi.fn(), createExerciseType: vi.fn(),
  };
  let page: FitnessPage;

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({ imports: [FitnessPage], providers: [
      { provide: FitnessService, useValue: service },
      { provide: AuthService, useValue: { ensureAccessToken: () => of('token') } },
    ] }).compileComponents();
    page = TestBed.createComponent(FitnessPage).componentInstance;
    page.ngOnInit();
  });

  it('shows progress per machine in stable colours and compares makers with the factor', () => {
    expect(page.exerciseId).toBe(1);
    expect(page.machineCount).toBe(2);
    expect(page.chartSeries.map((s) => [s.label, s.color, s.points[0].value])).toEqual([
      ['Technogym', '#3987e5', 80], ['Gym80', '#d95926', 50]]);
    page.normalized = true;
    expect(page.chartSeries[1].points[0].value).toBe(60);
    page.perMachine = false;
    expect(page.chartSeries.map((s) => s.points.length)).toEqual([2]);
    expect(page.months.map((m) => m.workouts.length)).toEqual([2]);
  });

  it('updates a machine factor and applies it to the logged workouts', () => {
    service.updateMachine.mockReturnValue(of({ ...machines[1], weightFactor: 1.5 }));
    page.updateFactor(machines[1], 1.5);
    expect(service.updateMachine).toHaveBeenCalledWith(2, { weightFactor: 1.5 });
    expect(page.machineBest(page.machines[1])).toEqual({ raw: 50, normalized: 75 });
    expect(page.workouts[0].entries[0].weightFactor).toBe(1.5);
    page.updateFactor(page.machines[1], 0); // invalid: ignored
    expect(service.updateMachine).toHaveBeenCalledTimes(1);
  });

  it('keeps the list in date order after saving and removes deleted workouts', () => {
    page.onSaved(w('c', '2026-11-14', 1, 82.5));
    expect(page.workouts.map((x) => x.id)).toEqual(['c', 'b', 'a']);
    page.onDeleted('b');
    expect(page.workouts.map((x) => x.id)).toEqual(['c', 'a']);
    expect(page.records[0]).toMatchObject({ name: 'Beinpresse', weight: 82.5 });
  });
});
