import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CleaningPage } from './cleaning.page';
import { CleaningService } from '../service/cleaning.service';
import { AuthService } from '../../../core/auth/service/auth.service';
import { CleaningPerson, CleaningTask } from '../model/cleaning.model';
import { localIsoDate } from '../../../shared/utils/date-utils';

describe('Cleaning plan', () => {
  const people: CleaningPerson[] = [{ id: 's', name: 'Simon Muster', isMe: true }, { id: 'l', name: 'Lisa', isMe: false }];
  const service = {
    getTasks: vi.fn(() => of([] as CleaningTask[])), getPeople: vi.fn(() => of(people)),
    complete: vi.fn(), undo: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn(),
  };
  const ago = (days: number) => { const d = new Date(); d.setDate(d.getDate() - days); return localIsoDate(d); };
  const task = (id: string, lastDoneAt: string | null, extra: Partial<CleaningTask> = {}): CleaningTask =>
    ({ id, name: id, category: 'kitchen', intervalDays: 7, isActive: true, lastDoneAt, logs: [], ...extra });
  let page: CleaningPage;

  beforeEach(async () => {
    vi.clearAllMocks();
    sessionStorage.clear();
    await TestBed.configureTestingModule({ imports: [CleaningPage], providers: [
      provideRouter([]),
      { provide: CleaningService, useValue: service },
      { provide: AuthService, useValue: { ensureAccessToken: () => of('token') } },
    ] }).compileComponents();
    page = TestBed.createComponent(CleaningPage).componentInstance;
    page.ngOnInit();
  });

  it('groups jobs by urgency and filters by status, person and room', () => {
    page.tasks = [
      task('later', ago(0), { intervalDays: 30 }),
      task('week', ago(4), { assignedTo: 's', category: 'bathroom' }),
      task('never', null, { assignedTo: 'l' }),
      task('late', ago(10), { assignedTo: 's' }),
      task('paused', null, { isActive: false }),
    ];
    expect(page.groups.map(g => [g.key, g.rows.map(r => r.task.id)])).toEqual([
      ['overdue', ['late']], ['today', ['never']], ['week', ['week']], ['later', ['later']],
    ]);
    expect([page.dueCount, page.myTurnCount, page.paused.length]).toEqual([2, 1, 1]);
    page.setFilter({ status: 'due' });
    expect(page.groups.flatMap(g => g.rows.map(r => r.task.id))).toEqual(['late', 'never']);
    page.toggle('person', 's');
    expect(page.groups.flatMap(g => g.rows.map(r => r.task.id))).toEqual(['late']);
    page.resetFilters();
    page.toggle('room', 'bathroom');
    expect(page.groups.flatMap(g => g.rows.map(r => r.task.id))).toEqual(['week']);
    expect(JSON.parse(sessionStorage.getItem('filters:cleaning')!).room).toBe('bathroom');
  });

  it('ticks a job off in one tap, names who is next and can undo it', () => {
    const bath = task('Bad', ago(9), { rotation: ['s', 'l'], assignedTo: 's', assignedToName: 'Simon Muster' });
    page.tasks = [bath];
    const after = { ...bath, lastDoneAt: ago(0), assignedTo: 'l', assignedToName: 'Lisa' };
    service.complete.mockReturnValue(of({ log: { id: 'log', task: 'Bad', doneAt: ago(0), doneBy: 's' }, task: after }));
    service.undo.mockReturnValue(of(bath));
    page.quickDone(bath);
    expect(service.complete).toHaveBeenCalledWith('Bad', { doneAt: ago(0), doneBy: 's', note: '' });
    expect(page.tasks[0].assignedTo).toBe('l');
    expect(page.undoAction?.message).toBe('„Bad“ erledigt · als Nächstes Lisa');
    page.undo();
    expect(service.undo).toHaveBeenCalledWith('log');
    expect(page.tasks[0].assignedTo).toBe('s');
    expect(page.undoAction).toBeNull();
  });

  it('logs a completion with details for someone else and keeps the dialog open on errors', () => {
    const kitchen = task('Küche', ago(8));
    page.tasks = [kitchen];
    page.openComplete(kitchen);
    service.complete.mockReturnValueOnce(throwError(() => new Error('offline')));
    page.confirmComplete({ doneAt: ago(1), doneBy: 'l', note: 'gründlich' });
    expect(page.completing).toBe(kitchen);
    expect(page.completeError).toContain('nicht gespeichert');
    service.complete.mockReturnValueOnce(of({ log: { id: 'x', task: 'Küche', doneAt: ago(1), doneBy: 'l', doneByName: 'Lisa' },
                                              task: { ...kitchen, lastDoneAt: ago(1) } }));
    page.confirmComplete({ doneAt: ago(1), doneBy: 'l', note: 'gründlich' });
    expect(page.completing).toBeNull();
    expect(page.undoAction?.message).toBe('„Küche“ erledigt von Lisa');
  });
});
