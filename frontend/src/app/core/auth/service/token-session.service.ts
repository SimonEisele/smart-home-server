import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';

interface RefreshResponse { access: string; refresh?: string; }

/** One refresh pipeline for guards, expiry timers and failed API requests. */
@Injectable({ providedIn: 'root' })
export class TokenSessionService {
  readonly expired$ = new Subject<void>();
  private pendingRefresh$: Observable<string | null> | null = null;

  constructor(private http: HttpClient) {}

  get access(): string | null {
    return localStorage.getItem('access') || sessionStorage.getItem('access');
  }

  ensureAccessToken(forceRefresh = false): Observable<string | null> {
    const access = this.access;
    if (access && !forceRefresh) {
      try {
        const part = access.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(atob(part));
        if (payload.exp * 1000 > Date.now() + 5000) return of(access);
      } catch { /* Attempt recovery through the refresh token. */ }
    }
    if (this.pendingRefresh$) return this.pendingRefresh$;
    const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
    if (!refresh) { this.expire(); return of(null); }
    const storage = localStorage.getItem('refresh') ? localStorage : sessionStorage;
    const other = storage === localStorage ? sessionStorage : localStorage;
    this.pendingRefresh$ = this.http.post<RefreshResponse>(`${environment.apiUrl}/users/token/refresh/`, { refresh }).pipe(
      tap(response => {
        // A completed request must never resurrect a session after logout.
        if (storage.getItem('refresh') !== refresh) return;
        storage.setItem('access', response.access);
        other.removeItem('access');
        if (response.refresh) {
          storage.setItem('refresh', response.refresh);
          other.removeItem('refresh');
        }
      }),
      map(response => storage.getItem('access') === response.access ? response.access : null),
      catchError(error => {
        if ((error.status === 401 || error.status === 403) && storage.getItem('refresh') === refresh) this.expire();
        return throwError(() => error);
      }),
      finalize(() => { this.pendingRefresh$ = null; }),
      shareReplay({ bufferSize: 1, refCount: false })
    );
    return this.pendingRefresh$;
  }

  expire(): void {
    for (const key of ['access', 'refresh', 'user']) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
    this.expired$.next();
  }
}
