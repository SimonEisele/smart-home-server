export type ExerciseKind = 'strength' | 'cardio';
export type MuscleGroup = 'beine' | 'brust' | 'ruecken' | 'schultern' | 'arme' | 'bauch' | 'ganzkoerper' | 'cardio';

/** What is trained, independent of the machine, e.g. "Beinpresse". */
export interface ExerciseType {
  id: number;
  name: string;
  kind: ExerciseKind;
  muscleGroup: MuscleGroup;
  /** Metabolic equivalent used for the calorie estimate. */
  met: number;
}

/** A concrete machine; reference kg = machine kg × weightFactor. */
export interface GymMachine {
  id: number;
  exerciseType: number;
  exerciseName?: string;
  kind?: ExerciseKind;
  manufacturer: string;
  model: string;
  weightFactor: number;
  notes?: string;
  isMine?: boolean;
}

export interface FitnessProfile {
  bodyWeightKg: number | null;
  defaultGym: string;
}

export interface WorkoutSet {
  reps: number | null;
  /** As shown on the machine. */
  weight: number | null;
}

export interface WorkoutEntry {
  id?: number;
  exerciseType: number;
  machine: number | null;
  exerciseName?: string;
  kind?: ExerciseKind;
  met?: number;
  machineLabel?: string;
  weightFactor?: number;
  sets: WorkoutSet[];
  durationMinutes?: number | null;
  distanceKm?: number | null;
  level?: string;
  notes?: string;
}

/** One gym day. */
export interface Workout {
  id: string;
  date: string;
  durationMinutes: number | null;
  gym: string;
  notes: string;
  /** Own value (e.g. from a watch); null means "estimate". */
  calories: number | null;
  bodyWeightKg: number | null;
  entries: WorkoutEntry[];
  createdAt?: string;
}
