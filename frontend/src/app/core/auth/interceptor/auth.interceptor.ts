import { HttpInterceptorFn, HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { catchError, switchMap, throwError } from "rxjs";
import { environment } from '../../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const http = inject(HttpClient);
  
  const isPublic =
    req.url.includes('/users/token/') ||
    req.url.includes('/users/token/refresh/') ||
    req.url.includes('/users/check-email/') ||
    req.url.includes('/users/create/');

  if (isPublic) {
    return next(req);
  }

  // Read token from either localStorage or sessionStorage
  const access = localStorage.getItem('access') || sessionStorage.getItem('access');

  const authReq = access
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${access}`
        }
      })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // Avoid refresh loops: if the failing request is the refresh endpoint, don't try to refresh again
      if (req.url.includes('/users/token/refresh/')) {
        return throwError(() => err);
      }
      if (err.status === 401) {
        const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
        if (!refresh) {
          return throwError(() => err);
        }

        return http
          .post<any>(`${environment.apiUrl}/users/token/refresh/`, { refresh })
          .pipe(
            switchMap(res => {
              // Store refreshed token in both storages to keep consistency
              localStorage.setItem('access', res.access);
              sessionStorage.setItem('access', res.access);

              const retryReq = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${res.access}`
                }
              });

              return next(retryReq);
            })
          );
      }

      return throwError(() => err);
    })
  );
};