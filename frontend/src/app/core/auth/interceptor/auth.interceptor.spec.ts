import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { environment } from '../../../../environments/environment';

describe('authInterceptor', () => {
  let http: HttpClient;
  let requests: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpClient);
    requests = TestBed.inject(HttpTestingController);
    localStorage.setItem('access', 'access-token');
  });
  afterEach(() => requests.verify());

  it('sends credentials to the configured backend', () => {
    http.get(`${environment.apiUrl}/todos/`).subscribe();
    const request = requests.expectOne(`${environment.apiUrl}/todos/`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer access-token');
    request.flush({ data: [] });
  });
  it('never sends backend tokens to external services', () => {
    http.get('https://example.com/api/todos/').subscribe();
    const request = requests.expectOne('https://example.com/api/todos/');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });
  it('does not attach access tokens to the refresh endpoint', () => {
    http.post(`${environment.apiUrl}/users/token/refresh/`, { refresh: 'refresh-token' }).subscribe();
    const request = requests.expectOne(`${environment.apiUrl}/users/token/refresh/`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({ access: 'new-access' });
  });
});
