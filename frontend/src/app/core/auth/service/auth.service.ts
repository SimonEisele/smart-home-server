import { Injectable } from "@angular/core";
import { BehaviorSubject, catchError, map, Observable, of, switchMap, tap, throwError } from "rxjs";
import { AuthResponse, EmailCheckResponse, LoginDTO, User } from "../model/auth.model";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { environment } from '../../../../environments/environment';
import { TokenSessionService } from './token-session.service';
import { HouseholdService } from '../../../shared/services/household.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // User-Stream
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  // Auto-refresh timer (JWT expiry)
  private tokenExpiryTimer: any;

  // Constructor
  constructor(private http: HttpClient, private householdService: HouseholdService, private session: TokenSessionService) {
    this.session.expired$.subscribe(() => this.logout());
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    const storedAccess = localStorage.getItem('access') || sessionStorage.getItem('access');

    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (storedAccess || localStorage.getItem('refresh') || sessionStorage.getItem('refresh')) {
          this.userSubject.next(user);
          this.householdService.initFromUser(user);
        }
      } catch { this.logout(); }
    }

    if (storedAccess) {
      this.setupAutoLogout(storedAccess);
    }
  }

  // Ensure an access token is available; refresh if needed
  ensureAccessToken(): Observable<string | null> {
    return this.session.ensureAccessToken().pipe(
      tap(token => { if (token) this.setupAutoLogout(token); })
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
          // Clear a previous account's tokens before choosing session persistence.
          this.logout();
          if (credentials.rememberMe) {
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
          if (credentials.rememberMe) {
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
        if (localStorage.getItem('refresh')) {
          localStorage.setItem('user', JSON.stringify(user));
        } else {
          sessionStorage.setItem('user', JSON.stringify(user));
        }
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

    if (this.tokenExpiryTimer) {
      clearTimeout(this.tokenExpiryTimer);
      this.tokenExpiryTimer = undefined;
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

  // Refresh the access token instead of logging out when it expires
  private setupAutoLogout(token: string) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const expiresIn = payload.exp * 1000 - Date.now();

      if (this.tokenExpiryTimer) {
        clearTimeout(this.tokenExpiryTimer);
      }

      if (this.session.access) {
        this.tokenExpiryTimer = setTimeout(() => {
          this.ensureAccessToken().subscribe({
            next: refreshedToken => {
              if (!refreshedToken) {
                this.logout();
              }
            },
            error: () => {
              // A temporary network failure must not log the wall tablet out.
              if (this.session.access) this.tokenExpiryTimer = setTimeout(() => this.setupAutoLogout(token), 30_000);
            },
          });
        }, Math.max(0, expiresIn - 5000));
      }
    } catch {
      console.warn("JWT-Token couldn't get parsed");
    }
  }
}
