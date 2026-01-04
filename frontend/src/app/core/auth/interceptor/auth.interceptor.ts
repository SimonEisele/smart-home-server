import { HttpInterceptorFn, HttpErrorResponse } from "@angular/common/http";
import { inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { catchError, switchMap, throwError } from "rxjs";

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const http = inject(HttpClient);
  
  const isPublic =
    req.url.includes('/users/token/') ||
    req.url.includes('/users/check-email/') ||
    req.url.includes('/users/create/');

  if (isPublic) {
    return next(req);
  }

  const access = localStorage.getItem('access');

  const authReq = access
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${access}`
        }
      })
    : req;

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        const refresh = localStorage.getItem('refresh');
        if (!refresh) {
          return throwError(() => err);
        }

        return http
          .post<any>('http://localhost:8000/api/users/token/refresh/', {
            refresh
          })
          .pipe(
            switchMap(res => {
              localStorage.setItem('access', res.access);

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