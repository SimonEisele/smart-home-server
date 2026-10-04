import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ErrorNoticeService } from '../../../shared/services/error-notice.service';
import { TokenSessionService } from '../service/token-session.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only the configured backend may receive credentials. External requests bypass auth.
  const api = new URL(environment.apiUrl + '/', window.location.origin);
  const url = new URL(req.url, window.location.origin);
  const isBackend = url.origin === api.origin && url.pathname.startsWith(api.pathname);
  const publicPaths = ['users/token/', 'users/token/refresh/', 'users/check-email/', 'users/create/'];
  if (!isBackend || publicPaths.some(path => url.pathname === api.pathname + path)) return next(req);

  const session = inject(TokenSessionService);
  const notice = inject(ErrorNoticeService);
  const router = inject(Router);
  const access = session.access;
  const authorized = access ? req.clone({ setHeaders: { Authorization: `Bearer ${access}` } }) : req;
  return next(authorized).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) { notice.show(error); return throwError(() => error); }
      return session.ensureAccessToken(true).pipe(
        switchMap(token => {
          if (!token) { router.navigate(['/']); return throwError(() => error); }
          return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
        }),
        catchError(refreshError => {
          if (!session.access) router.navigate(['/']);
          return throwError(() => refreshError);
        })
      );
    })
  );
};
