import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable, tap } from "rxjs";
import { User } from "../model/auth.model";
import { HttpClient } from "@angular/common/http";
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient) {
    const storedUser = localStorage.getItem('user');
    if(storedUser) {
      this.userSubject.next(JSON.parse(storedUser));
    }
  }

  register(user: any): Observable<User> {
    return this.http.post<User>(`${environment.apiUrl}/users/create/`, user);
  }

  login(email: string, password: string) {
    return this.http.post<{ access: string, refresh: string }>(`${environment.apiUrl}/users/token/`, { email, password })
      .pipe(
        tap(tokens => {
          localStorage.setItem('access', tokens.access);
          localStorage.setItem('refresh', tokens.refresh);
        }),
        tap(() => this.fetchUser().subscribe())
      );
  }

  fetchUser() {
    return this.http.get<User>(`${environment.apiUrl}/users/`).pipe(
      tap(user => {
        this.userSubject.next(user);
        localStorage.setItem('user', JSON.stringify(user));
      })
    );
  }

  logout() {
    localStorage.removeItem('access');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    this.userSubject.next(null);
  }

  get user(): User | null {
    return this.userSubject.value;
  }

  checkEmail(email: string) {
    return this.http.post<{ exists: boolean }>(
      `${environment.apiUrl}/users/check-email/`,
      { email }
    );
  }
}