import { Injectable } from "@angular/core";
import { BehaviorSubject, catchError, map, Observable, of, switchMap, tap, throwError } from "rxjs";
import { AuthResponse, EmailCheckResponse, LoginDTO, User } from "../model/auth.model";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { environment } from '../../../../environments/environment';
import { HouseholdService } from '../../../shared/services/household.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // User-Stream
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  // Auto-Logout Timer (JWT Expiry)
  private tokenExpiryTimer: any;

  // Constructor
  constructor(private http: HttpClient, private householdService: HouseholdService) {
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    if(storedUser) {
      const user = JSON.parse(storedUser);
      this.userSubject.next(user);
      this.householdService.initFromUser(user);
    }
  }

  // Ensure an access token is available; refresh if needed
  ensureAccessToken(): Observable<string | null> {
    const access = localStorage.getItem('access') || sessionStorage.getItem('access');
    const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
    // If we have an access token, check its expiry and refresh if near/over expiry
    if (access) {
      try {
        const payload = JSON.parse(atob(access.split('.')[1]));
        const expMs = (payload?.exp ?? 0) * 1000;
        const now = Date.now();
        const bufferMs = 5_000; // 5s buffer to avoid racing expiry
        if (expMs > now + bufferMs) {
          return of(access);
        }
        // Token expired or expiring soon; attempt refresh below
      } catch {
        // Malformed token, attempt refresh if possible
      }
    }
    if (!refresh) {
      return of(null);
    }
    return this.http
      .post<{ access: string }>(`${environment.apiUrl}/users/token/refresh/`, { refresh })
      .pipe(
        map(res => res.access),
        tap(token => {
          // Store refreshed token in both storages to keep consistency
          localStorage.setItem('access', token);
          sessionStorage.setItem('access', token);
          this.setupAutoLogout(token);
        }),
        catchError(err => {
          console.error('Token refresh failed on ensureAccessToken', err);
          return of(null);
        })
      );
  }

  // Registration of a new user
  register(user: Partial<User>): Observable<User> {
    return this.http.post<User>(`${environment.apiUrl}/users/create/`, user).pipe(
      catchError(this.handleError)
    );
  }

  // Login with email and password
  login(credentials: LoginDTO): Observable<User> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/users/token/`, credentials)
      .pipe(
        map(res => res.data),
        tap(data => {
          if(credentials.rememberMe) {
            localStorage.setItem('access', data.access_token);
            localStorage.setItem('refresh', data.refresh_token);
          } else {
            sessionStorage.setItem('access', data.access_token);
            sessionStorage.setItem('refresh', data.refresh_token);
          }
          this.setupAutoLogout(data.access_token);
        }),
        switchMap(res => {
          return res.user ? of(res.user) : this.fetchUser();
        }),
        tap(user => {
          this.userSubject.next(user);
          this.householdService.initFromUser(user);
          if(credentials.rememberMe) {
            localStorage.setItem('user', JSON.stringify(user));
          } else {
            sessionStorage.setItem('user', JSON.stringify(user));
          }
        }),
        catchError(this.handleError)
      );
  }

  // Get user data
  fetchUser(): Observable<User> {
    return this.http.get<{ data: User }>(`${environment.apiUrl}/users/`).pipe(
      map(res => res.data),
      tap(user => {
        this.userSubject.next(user);
        this.householdService.initFromUser(user);
        localStorage.setItem('user', JSON.stringify(user));
      }),
      catchError(this.handleError)
    );
  }

  // Update own profile (name, phone) and/or password
  updateProfile(data: {
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    current_password?: string;
    new_password?: string;
  }): Observable<User> {
    return this.http.patch<{ data: User }>(`${environment.apiUrl}/users/`, data).pipe(
      map(res => res.data),
      tap(user => {
        this.userSubject.next(user);
        if (localStorage.getItem('user')) localStorage.setItem('user', JSON.stringify(user));
        if (sessionStorage.getItem('user')) sessionStorage.setItem('user', JSON.stringify(user));
      }),
      catchError(this.handleError)
    );
  }

  // Logout: Delete tokens
  logout() {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    sessionStorage.removeItem('access');
    sessionStorage.removeItem('refresh');
    sessionStorage.removeItem('user');
    this.userSubject.next(null);
    this.householdService.clear();

    if(this.tokenExpiryTimer) {
      clearTimeout(this.tokenExpiryTimer);
    }
  }

  // Returns actual user synchronous
  get user(): User | null {
    return this.userSubject.value;
  }

  // Check if email exists
  checkEmail(email: string): Observable<{ exists: boolean }> {
    return this.http.post<EmailCheckResponse>(
      `${environment.apiUrl}/users/check-email/`,
      { email }
    ).pipe(
      map(res => res.data),
      catchError(this.handleError));
  }

  // Handle error
  private handleError(error: HttpErrorResponse) {
    console.error('AuthService error:', error);
    return throwError(() => error);
  }

  // Seupt auto logout if token expires
  private setupAutoLogout(token: string) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresIn = payload.exp * 1000 - Date.now(); // Ms until expiry
      if(expiresIn > 0) {
        this.tokenExpiryTimer = setTimeout(() => this.logout(), expiresIn);
        console.log('Expires in' + expiresIn);
      }
    } catch {
      console.warn("JWT-Token couldn't get parsed")
    }
  }
}