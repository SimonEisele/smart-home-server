import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Household, HouseholdMember, User } from '../../core/auth/model/auth.model';

@Injectable({ providedIn: 'root' })
export class HouseholdService {
  private activeHouseholdSubject = new BehaviorSubject<Household | null>(null);
  activeHousehold$ = this.activeHouseholdSubject.asObservable();

  private householdsSubject = new BehaviorSubject<Household[]>([]);
  households$ = this.householdsSubject.asObservable();

  constructor(private http: HttpClient) {}

  get activeHousehold(): Household | null {
    return this.activeHouseholdSubject.value;
  }

  get households(): Household[] {
    return this.householdsSubject.value;
  }

  /** Called after login / app init with the user's data */
  initFromUser(user: User): void {
    const households = user.households ?? [];
    this.householdsSubject.next(households);
    const active = households.find(h => h.id === user.active_household_id) ?? households[0] ?? null;
    this.activeHouseholdSubject.next(active);
  }

  /** Clear on logout */
  clear(): void {
    this.householdsSubject.next([]);
    this.activeHouseholdSubject.next(null);
  }

  /** Switch the active WG both locally and on the server */
  switchHousehold(id: string): Observable<User> {
    return this.http.post<{ data: User }>(`${environment.apiUrl}/users/households/${id}/switch/`, {}).pipe(
      map(res => res.data),
      tap(user => this.initFromUser(user))
    );
  }

  /** Create a new WG */
  createHousehold(name: string, description = ''): Observable<Household> {
    return this.http.post<{ data: Household }>(`${environment.apiUrl}/users/households/`, { name, description }).pipe(
      map(res => res.data),
      tap(hh => {
        const updated = [...this.householdsSubject.value, hh];
        this.householdsSubject.next(updated);
        if (!this.activeHouseholdSubject.value) {
          this.activeHouseholdSubject.next(hh);
        }
      })
    );
  }

  /** Join a WG with an invite code */
  joinHousehold(inviteCode: string): Observable<Household> {
    return this.http.post<{ data: Household }>(
      `${environment.apiUrl}/users/households/join/`, { invite_code: inviteCode }
    ).pipe(
      map(res => res.data),
      tap(hh => {
        if (!this.householdsSubject.value.find(h => h.id === hh.id)) {
          this.householdsSubject.next([...this.householdsSubject.value, hh]);
        }
      })
    );
  }

  /** Update WG name/description */
  updateHousehold(id: string, data: Partial<Household>): Observable<Household> {
    return this.http.patch<{ data: Household }>(`${environment.apiUrl}/users/households/${id}/`, data).pipe(
      map(res => res.data),
      tap(updated => {
        const list = this.householdsSubject.value.map(h => h.id === updated.id ? { ...h, ...updated } : h);
        this.householdsSubject.next(list);
        if (this.activeHouseholdSubject.value?.id === updated.id) {
          this.activeHouseholdSubject.next({ ...this.activeHouseholdSubject.value, ...updated });
        }
      })
    );
  }

  /** Get members of a WG */
  getMembers(householdId: string): Observable<HouseholdMember[]> {
    return this.http.get<{ data: HouseholdMember[] }>(
      `${environment.apiUrl}/users/households/${householdId}/members/`
    ).pipe(map(res => res.data));
  }

  /** Update a member's role */
  updateMemberRole(householdId: string, userId: string, role: string): Observable<HouseholdMember> {
    return this.http.patch<{ data: HouseholdMember }>(
      `${environment.apiUrl}/users/households/${householdId}/members/`,
      { user_id: userId, role }
    ).pipe(map(res => res.data));
  }

  /** Remove a member */
  removeMember(householdId: string, userId: string): Observable<void> {
    return this.http.delete<void>(
      `${environment.apiUrl}/users/households/${householdId}/members/`,
      { body: { user_id: userId } }
    );
  }

  /** Create a WG shared account */
  createHouseholdAccount(householdId: string, data: { name: string; password: string }): Observable<{ id: string; email: string; name: string }> {
    return this.http.post<{ data: { id: string; email: string; name: string } }>(
      `${environment.apiUrl}/users/households/${householdId}/accounts/`, data
    ).pipe(map(r => r.data));
  }

  /** Delete a WG shared account */
  deleteHouseholdAccount(householdId: string, userId: string): Observable<void> {
    return this.http.delete<void>(
      `${environment.apiUrl}/users/households/${householdId}/accounts/`,
      { body: { user_id: userId } }
    );
  }

  /** Change password of a WG shared account */
  changeHouseholdAccountPassword(householdId: string, userId: string, password: string): Observable<void> {
    return this.http.patch<void>(
      `${environment.apiUrl}/users/households/${householdId}/accounts/`,
      { user_id: userId, password }
    );
  }

  /** Leave a household (non-owner members only) */
  leaveHousehold(householdId: string): Observable<any> {
    return this.http.post<{ data: any }>(
      `${environment.apiUrl}/users/households/${householdId}/leave/`, {}
    ).pipe(map(r => r.data));
  }
}
