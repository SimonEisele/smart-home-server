import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ExerciseType, GymMachine, Workout } from '../model/fitness.model';
import { FitnessService } from '../service/fitness.service';
import { WorkoutEditor } from './workout-editor';

describe('Workout editor', () => {
  const service = { createWorkout: vi.fn(), updateWorkout: vi.fn(), deleteWorkout: vi.fn(), createMachine: vi.fn() };
  const types: ExerciseType[] = [
    { id: 1, name: 'Beinpresse', kind: 'strength', muscleGroup: 'beine', met: 5 },
    { id: 2, name: 'Laufband', kind: 'cardio', muscleGroup: 'cardio', met: 8 },
  ];
  const machines: GymMachine[] = [{ id: 7, exerciseType: 1, exerciseName: 'Beinpresse', manufacturer: 'Technogym',
    model: 'Selection', weightFactor: 1 }];
  const before: Workout = { id: 'old', date: '2026-11-01', durationMinutes: 50, gym: 'Activ', notes: '', calories: null,
    bodyWeightKg: 80, entries: [{ exerciseType: 1, machine: 7, kind: 'strength', sets: [{ reps: 10, weight: 80 },
      { reps: 8, weight: 85 }] }] };

  function create(workout: Workout | null = null) {
    TestBed.configureTestingModule({ imports: [WorkoutEditor], providers: [{ provide: FitnessService, useValue: service }] });
    const editor = TestBed.createComponent(WorkoutEditor).componentInstance;
    Object.assign(editor, { workout, workouts: [before], types, machines, bodyWeightKg: 80, defaultGym: 'Activ' });
    editor.ngOnInit();
    return editor;
  }

  beforeEach(() => vi.clearAllMocks());

  it('adds machines with last time’s sets, edits sets and saves the gym day', () => {
    const editor = create();
    expect([editor.gym, editor.pickerOpen, editor.recentMachines.map((m) => m.id)]).toEqual(['Activ', true, [7]]);
    editor.addMachine(machines[0]);
    const entry = editor.entries[0];
    expect(entry.sets).toEqual([{ reps: 10, weight: 80 }, { reps: 8, weight: 85 }]);
    editor.bump(entry.sets[1], 2.5);
    editor.addSet(entry);
    expect(entry.sets[2]).toEqual({ reps: 8, weight: 87.5 });
    editor.addType(types[1]);
    editor.entries[1].durationMinutes = 15;
    editor.entries[1].distanceKm = 2.5;
    editor.durationMinutes = 60;
    expect(editor.estimate).toBe(Math.round(8 * 80 * 0.25 + 5 * 80 * (45 / 60)));
    service.createWorkout.mockReturnValue(of({ ...before, id: 'new' }));
    const saved = vi.fn();
    editor.saved.subscribe(saved);
    editor.save();
    const payload = service.createWorkout.mock.calls[0][0];
    expect(payload).toMatchObject({ durationMinutes: 60, gym: 'Activ', calories: null, bodyWeightKg: 80 });
    expect(payload.entries.map((e: { machine: number | null; sets: unknown[] }) => [e.machine, e.sets.length]))
      .toEqual([[7, 3], [null, 0]]);
    expect(payload.entries[0].key).toBeUndefined();
    expect(saved).toHaveBeenCalled();
  });

  it('creates a new machine for an exercise inline and refuses future dates', () => {
    const editor = create();
    editor.addType(types[0]);
    const entry = editor.entries[0];
    expect(entry.machine).toBe(7); // the only machine of this exercise is preselected
    editor.changeMachine(entry, 'new');
    entry.newMachine!.manufacturer = 'Gym80';
    entry.newMachine!.weightFactor = 1.2;
    const gym80 = { id: 9, exerciseType: 1, exerciseName: 'Beinpresse', manufacturer: 'Gym80', model: '', weightFactor: 1.2 };
    service.createMachine.mockReturnValue(of(gym80));
    const created = vi.fn();
    editor.machineCreated.subscribe(created);
    editor.createMachine(entry);
    expect(service.createMachine).toHaveBeenCalledWith({ exerciseType: 1, manufacturer: 'Gym80', model: '', weightFactor: 1.2 });
    expect([entry.machine, entry.machineLabel, entry.weightFactor, entry.newMachine]).toEqual([9, 'Gym80', 1.2, null]);
    expect(created).toHaveBeenCalledWith(gym80);
    editor.date = '2999-01-01';
    editor.save();
    expect(editor.dateError).toContain('Zukunft');
    expect(service.createWorkout).not.toHaveBeenCalled();
  });

  it('edits an existing workout and deletes after confirming', () => {
    const editor = create(before);
    expect([editor.isNew, editor.pickerOpen, editor.entries.length]).toEqual([false, false, 1]);
    expect(editor.previous(editor.entries[0])).toBeUndefined(); // its own workout does not count as "last time"
    service.deleteWorkout.mockReturnValue(of(undefined));
    const deleted = vi.fn();
    editor.deleted.subscribe(deleted);
    editor.remove();
    expect(service.deleteWorkout).not.toHaveBeenCalled();
    editor.remove();
    expect(deleted).toHaveBeenCalledWith('old');
  });
});
