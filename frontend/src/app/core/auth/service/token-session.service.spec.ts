import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TokenSessionService } from './token-session.service';
import { environment } from '../../../../environments/environment';

describe('TokenSessionService', () => {
  let session: TokenSessionService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    session = TestBed.inject(TokenSessionService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shares one refresh across parallel callers and stores rotated session tokens', () => {
    sessionStorage.setItem('refresh', 'old-refresh');
    const tokens: Array<string | null> = [];
    session.ensureAccessToken(true).subscribe(token => tokens.push(token));
    session.ensureAccessToken(true).subscribe(token => tokens.push(token));
    const request = http.expectOne(`${environment.apiUrl}/users/token/refresh/`);
    request.flush({ access: 'new-access', refresh: 'new-refresh' });
    expect(tokens).toEqual(['new-access', 'new-access']);
    expect(sessionStorage.getItem('refresh')).toBe('new-refresh');
    expect(localStorage.getItem('access')).toBeNull();
  });

  it('does not restore a session after logout while a refresh is pending', () => {
    localStorage.setItem('refresh', 'old-refresh');
    let result: string | null = 'unset';
    session.ensureAccessToken(true).subscribe(token => result = token);
    const request = http.expectOne(`${environment.apiUrl}/users/token/refresh/`);
    session.expire();
    request.flush({ access: 'new-access', refresh: 'new-refresh' });
    expect(result).toBeNull();
    expect(localStorage.getItem('access')).toBeNull();
  });

  it('keeps the session after a temporary server failure', () => {
    localStorage.setItem('refresh', 'old-refresh');
    session.ensureAccessToken(true).subscribe({ error: () => {} });
    http.expectOne(`${environment.apiUrl}/users/token/refresh/`).flush({}, { status: 503, statusText: 'Offline' });
    expect(localStorage.getItem('refresh')).toBe('old-refresh');
  });

  it('clears rejected refresh credentials and signals expiration', () => {
    localStorage.setItem('refresh', 'old-refresh');
    let expired = false;
    session.expired$.subscribe(() => expired = true);
    session.ensureAccessToken(true).subscribe({ error: () => {} });
    http.expectOne(`${environment.apiUrl}/users/token/refresh/`).flush({}, { status: 401, statusText: 'Expired' });
    expect(expired).toBe(true);
    expect(localStorage.getItem('refresh')).toBeNull();
  });
  it('does not clear a new login when an older refresh request is rejected', () => {
    localStorage.setItem('refresh', 'old-refresh');
    session.ensureAccessToken(true).subscribe({ error: () => {} });
    const request = http.expectOne(`${environment.apiUrl}/users/token/refresh/`);
    localStorage.setItem('refresh', 'new-login-refresh');
    localStorage.setItem('access', 'new-login-access');
    request.flush({}, { status: 401, statusText: 'Expired' });
    expect(localStorage.getItem('access')).toBe('new-login-access');
  });

});
