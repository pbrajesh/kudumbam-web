import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { environment } from '../environments/environment';
import { AuthService } from './auth.service';

/** Adds `Authorization: Bearer <Supabase access token>` to calls to our API, and only those. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(`${environment.apiUrl}/api/`)) return next(req);
  const auth = inject(AuthService);
  return from(auth.accessToken()).pipe(
    switchMap(token => next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req)),
  );
};
