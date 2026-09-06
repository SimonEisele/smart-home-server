import { Injectable } from "@angular/core";
import { BehaviorSubject, catchError, map, Observable, of, switchMap, tap, throwError } from "rxjs";
import { AuthResponse, EmailCheckResponse, LoginDTO, User } from "../model/auth.model";
import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { environment } from '../../../../environments/environment';
import { HouseholdService } from '../../../shared/services/household.service';

interface TokenRefreshResponse {
  access: string;
  refresh?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  // User-Stream
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  // Auto-refresh timer (JWT expiry)
  private tokenExpiryTimer: any;

  // Constructor
  constructor(private http: HttpClient, private householdService: HouseholdService) {
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    const storedAccess = localStorage.getItem('access') || sessionStorage.getItem('access');

    if (storedUser) {
      const user = JSON.parse(storedUser);
      this.userSubject.next(user);
      this.householdService.initFromUser(user);
    }

    if (storedAccess) {
      this.setupAutoLogout(storedAccess);
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
      } catch {
        // Malformed token, attempt refresh if possible
      }
    }

    if (!refresh) {
      return of(null);
    }

    return this.http
      .post<TokenRefreshResponse>(`${environment.apiUrl}/users/token/refresh/`, { refresh })
      .pipe(
        tap(response => this.storeRefreshedTokens(response)),
        map(response => response.access),
        tap(token => this.setupAutoLogout(token)),
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

  private storeRefreshedTokens(response: TokenRefreshResponse): void {
    const useLocalStorage = !!localStorage.getItem('refresh');
    const storage = useLocalStorage ? localStorage : sessionStorage;
    const otherStorage = useLocalStorage ? sessionStorage : localStorage;

    storage.setItem('access', response.access);
    otherStorage.removeItem('access');

    if (response.refresh) {
      storage.setItem('refresh', response.refresh);
      otherStorage.removeItem('refresh');
    }
  }

  // Refresh the access token instead of logging out when it expires
  private setupAutoLogout(token: string) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresIn = payload.exp * 1000 - Date.now();

      if (this.tokenExpiryTimer) {
        clearTimeout(this.tokenExpiryTimer);
      }

      if (expiresIn > 0) {
        this.tokenExpiryTimer = setTimeout(() => {
          this.ensureAccessToken().subscribe({
            next: refreshedToken => {
              if (!refreshedToken) {
                this.logout();
              }
            },
            error: () => this.logout(),
          });
        }, expiresIn);
      }
    } catch {
      console.warn("JWT-Token couldn't get parsed");
    }
  }
}
