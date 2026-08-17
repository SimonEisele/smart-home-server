import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AnalyticsService } from '../services/analytics.service';
import { environment } from '../../environments/environment';

export const dashboardGuard: CanActivateFn = () => {
  const analytics = inject(AnalyticsService);
  const router = inject(Router);

  return analytics.getAuthStatus().pipe(
    map(() => true),
    catchError(() => {
      const base = environment.apiBaseUrl?.trim() || 'http://localhost:8000';
      window.location.href = `${base.replace(/\/+$/, '')}/admin/login/`;
      return of(false);
    })
  );
};
