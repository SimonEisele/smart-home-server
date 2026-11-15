import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ExerciseType, FitnessProfile, GymMachine, Workout } from '../model/fitness.model';

type Data<T> = { data: T };

@Injectable({ providedIn: 'root' })
export class FitnessService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/fitness`;

  getExerciseTypes(): Observable<ExerciseType[]> {
    return this.http.get<Data<ExerciseType[]>>(`${this.base}/exercise-types/`).pipe(map((r) => r.data));
  }

  createExerciseType(type: Partial<ExerciseType>): Observable<ExerciseType> {
    return this.http.post<Data<ExerciseType>>(`${this.base}/exercise-types/`, type).pipe(map((r) => r.data));
  }

  getMachines(): Observable<GymMachine[]> {
    return this.http.get<Data<GymMachine[]>>(`${this.base}/machines/`).pipe(map((r) => r.data));
  }

  createMachine(machine: Partial<GymMachine>): Observable<GymMachine> {
    return this.http.post<Data<GymMachine>>(`${this.base}/machines/`, machine).pipe(map((r) => r.data));
  }

  updateMachine(id: number, patch: Partial<GymMachine>): Observable<GymMachine> {
    return this.http.patch<Data<GymMachine>>(`${this.base}/machines/${id}/`, patch).pipe(map((r) => r.data));
  }

  deleteMachine(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/machines/${id}/`);
  }

  getProfile(): Observable<FitnessProfile> {
    return this.http.get<Data<FitnessProfile>>(`${this.base}/profile/`).pipe(map((r) => r.data));
  }

  saveProfile(profile: Partial<FitnessProfile>): Observable<FitnessProfile> {
    return this.http.put<Data<FitnessProfile>>(`${this.base}/profile/`, profile).pipe(map((r) => r.data));
  }

  getWorkouts(): Observable<Workout[]> {
    return this.http.get<Data<Workout[]>>(`${this.base}/workouts/`).pipe(map((r) => r.data));
  }

  createWorkout(workout: Partial<Workout>): Observable<Workout> {
    return this.http.post<Data<Workout>>(`${this.base}/workouts/`, workout).pipe(map((r) => r.data));
  }

  updateWorkout(id: string, workout: Partial<Workout>): Observable<Workout> {
    return this.http.put<Data<Workout>>(`${this.base}/workouts/${id}/`, workout).pipe(map((r) => r.data));
  }

  deleteWorkout(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/workouts/${id}/`);
  }
}
