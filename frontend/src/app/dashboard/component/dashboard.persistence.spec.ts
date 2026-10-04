import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';
import { Dashboard } from './dashboard';
import { AuthService } from '../../core/auth/service/auth.service';
import { environment } from '../../../environments/environment';

const endpoint = `${environment.apiUrl}/users/dashboard/`;

describe('Dashboard persistence', () => {
  let dashboard: Dashboard;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Dashboard], providers: [
      { provide: AuthService, useValue: { user: { id: 'test-user' }, user$: new BehaviorSubject({ id: 'test-user' }) } }
    ] });
    dashboard = TestBed.createComponent(Dashboard).componentInstance;
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { vi.useRealTimers(); http.verify(); });

  it('persists both widgets when added in rapid succession', () => {
    dashboard.addWidget('todos');
    dashboard.addWidget('weather');
    const first = http.expectOne(endpoint);
    expect(first.request.body.widget_type).toBe('todos');
    first.flush({ ...first.request.body, id: 'first-id' });
    const second = http.expectOne(endpoint);
    expect(second.request.body.widget_type).toBe('weather');
    second.flush({ ...second.request.body, id: 'second-id' });
    expect(dashboard.dashboard.map(item => item.id)).toEqual(['first-id', 'second-id']);
  });

  it('debounces each changed widget independently', () => {
    vi.useFakeTimers();
    dashboard.addWidget('todos');
    const first = http.expectOne(endpoint);
    first.flush({ ...first.request.body, id: 'first-id' });
    dashboard.addWidget('weather');
    const second = http.expectOne(endpoint);
    second.flush({ ...second.request.body, id: 'second-id' });
    const [a, b] = dashboard.dashboard;
    a.x = 1; b.x = 4;
    (dashboard as any).saveItem(a);
    (dashboard as any).saveItem(b);
    vi.advanceTimersByTime(300);
    const patchA = http.expectOne(endpoint + 'first-id/');
    expect(patchA.request.body.x).toBe(1);
    patchA.flush({ ...a });
    const patchB = http.expectOne(endpoint + 'second-id/');
    expect(patchB.request.body.x).toBe(4);
    patchB.flush({ ...b });
  });
});
