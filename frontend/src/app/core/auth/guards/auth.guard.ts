import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { AuthService } from '../service/auth.service';

/** Restore the session even when only refresh tokens, rather than cached user data, remain. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ensureAccessToken().pipe(
    switchMap(token => token ? (auth.user ? of(true) : auth.fetchUser().pipe(map(() => true))) : of(router.createUrlTree(['/']))),
    catchError(() => of(router.createUrlTree(['/'])))
  );
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.ensureAccessToken().pipe(
    switchMap(token => token ? (auth.user ? of(router.createUrlTree(['/home'])) : auth.fetchUser().pipe(map(() => router.createUrlTree(['/home'])))) : of(true)),
    catchError(() => of(true))
  );
};
