import { HttpInterceptorFn, HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable, catchError, shareReplay, switchMap, throwError } from "rxjs";
import { environment } from '../../../../environments/environment';
import { Router } from "@angular/router";

interface TokenRefreshResponse {
  access: string;
  refresh?: string;
}

// Shared in-flight refresh — prevents parallel refresh races on page load
let pendingRefresh$: Observable<TokenRefreshResponse> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const http = inject(HttpClient);
  const router = inject(Router);

  const isPublic =
    req.url.includes('/users/token/') ||
    req.url.includes('/users/token/refresh/') ||
    req.url.includes('/users/check-email/') ||
    req.url.includes('/users/create/') ||
    req.url.includes('open-meteo.com');

  if (isPublic) {
    return next(req);
  }

  const access = localStorage.getItem('access') || sessionStorage.getItem('access');

  const authReq = access
    ? req.clone({ setHeaders: { Authorization: `Bearer ${access}` } })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (req.url.includes('/users/token/refresh/')) {
        return throwError(() => err);
      }

      if (err.status === 401) {
        const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
        if (!refresh) {
          clearSession();
          router.navigate(['/']);
          return throwError(() => err);
        }

        // Reuse an in-progress refresh instead of firing N parallel requests
        if (!pendingRefresh$) {
          pendingRefresh$ = http
            .post<TokenRefreshResponse>(`${environment.apiUrl}/users/token/refresh/`, { refresh })
            .pipe(
              shareReplay(1),
              catchError(refreshErr => {
                pendingRefresh$ = null;
                clearSession();
                router.navigate(['/']);
                return throwError(() => refreshErr);
              })
            );

          // Clear the shared observable once all subscribers have received the value
          pendingRefresh$.subscribe({
            error: () => { pendingRefresh$ = null; },
            complete: () => { pendingRefresh$ = null; }
          });
        }

        return pendingRefresh$.pipe(
          switchMap(res => {
            storeRefreshedTokens(res);
            const retried = req.clone({ setHeaders: { Authorization: `Bearer ${res.access}` } });
            return next(retried);
          }),
          catchError(() => throwError(() => err))
        );
      }

      return throwError(() => err);
    })
  );
};

function storeRefreshedTokens(response: TokenRefreshResponse): void {
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

function clearSession(): void {
  ['access', 'refresh', 'user'].forEach(key => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
}
