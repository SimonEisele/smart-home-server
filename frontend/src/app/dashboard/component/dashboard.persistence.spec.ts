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
    first.flush({ data: { ...first.request.body, id: 'first-id' } });
    const second = http.expectOne(endpoint);
    expect(second.request.body.widget_type).toBe('weather');
    second.flush({ data: { ...second.request.body, id: 'second-id' } });
    expect(dashboard.dashboard.map(item => item.id)).toEqual(['first-id', 'second-id']);
  });

  it('debounces each changed widget independently', () => {
    vi.useFakeTimers();
    dashboard.addWidget('todos');
    const first = http.expectOne(endpoint);
    first.flush({ data: { ...first.request.body, id: 'first-id' } });
    dashboard.addWidget('weather');
    const second = http.expectOne(endpoint);
    second.flush({ data: { ...second.request.body, id: 'second-id' } });
    const [a, b] = dashboard.dashboard;
    a.x = 1; b.x = 4;
    (dashboard as any).saveItem(a);
    (dashboard as any).saveItem(b);
    vi.advanceTimersByTime(300);
    const patchA = http.expectOne(endpoint + 'first-id/');
    expect(patchA.request.body.x).toBe(1);
    patchA.flush({ data: { ...a } });
    const patchB = http.expectOne(endpoint + 'second-id/');
    expect(patchB.request.body.x).toBe(4);
    patchB.flush({ data: { ...b } });
  });

  it('places new widgets on the first free spot and saves renamed titles', () => {
    vi.useFakeTimers();
    dashboard.addWidget('menuplan');
    const first = http.expectOne(endpoint);
    expect(first.request.body).toMatchObject({ x: 0, y: 0, cols: 9 });
    first.flush({ data: { ...first.request.body, id: 'menu-id' } });
    dashboard.addWidget('datetime');
    const second = http.expectOne(endpoint);
    expect(second.request.body).toMatchObject({ x: 9, y: 0 });
    second.flush({ data: { ...second.request.body, id: 'clock-id' } });

    dashboard.renameWidget(dashboard.dashboard[1], 'Küchenuhr');
    vi.advanceTimersByTime(300);
    const patch = http.expectOne(endpoint + 'clock-id/');
    expect(patch.request.body.title).toBe('Küchenuhr');
    patch.flush({ data: { ...dashboard.dashboard[1] } });
  });

  it('reorders the mobile list without leaving overlapping cards', () => {
    vi.useFakeTimers();
    dashboard.dashboard = [
      { id: 'a', widget_type: 'datetime', x: 0, y: 0, cols: 3, rows: 5, minItemCols: 3, minItemRows: 4 },
      { id: 'b', widget_type: 'menuplan', x: 3, y: 0, cols: 9, rows: 6, minItemCols: 3, minItemRows: 5 },
    ];
    dashboard.moveWidget(dashboard.dashboard[0], 1);
    expect(dashboard.orderedItems.map(item => item.id)).toEqual(['b', 'a']);
    const [b, a] = dashboard.orderedItems;
    expect(a.y).toBeGreaterThanOrEqual(b.y + b.rows);
    vi.advanceTimersByTime(300);
    // Saves run one after another; answer them in whatever order they arrive.
    const saved: string[] = [];
    for (let open = http.match(() => true); open.length; open = http.match(() => true)) {
      for (const request of open) { saved.push(request.request.url.split('/').at(-2)!); request.flush({ data: {} }); }
    }
    expect(saved.sort()).toEqual(['a', 'b']);
  });
});
