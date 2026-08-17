import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const isRelativeApiOrMedia = req.url.startsWith('/api/') || req.url.startsWith('/media/');
  const base = environment.apiBaseUrl?.trim();

  if (!isRelativeApiOrMedia || !base) {
    return next(req);
  }

  const normalizedBase = base.replace(/\/+$/, '');
  const nextReq = req.clone({
    url: `${normalizedBase}${req.url}`
  });

  return next(nextReq);
};
