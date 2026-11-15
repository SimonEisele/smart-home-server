import { CleaningTask } from '../model/cleaning.model';
import { agoText, dueInfo, dueText, intervalLabel, personShares, recentLogs } from './cleaning-utils';

describe('cleaning utils', () => {
  const today = new Date(2026, 10, 15, 14, 0);
  const task = (lastDoneAt: string | null, intervalDays = 7, extra: Partial<CleaningTask> = {}): CleaningTask =>
    ({ id: 't', name: 'Bad', category: 'bathroom', intervalDays, lastDoneAt, ...extra });

  it('works out when something is due, like the calendar', () => {
    expect(dueInfo(task(null), today)).toMatchObject({ bucket: 'today', never: true, days: 0 });
    expect(dueInfo(task('2026-11-05'), today)).toMatchObject({ bucket: 'overdue', days: -3, elapsed: 1 });
    expect(dueInfo(task('2026-11-08'), today)).toMatchObject({ bucket: 'today', days: 0 });
    expect(dueInfo(task('2026-11-14'), today)).toMatchObject({ bucket: 'week', days: 6 });
    expect(dueInfo(task('2026-11-15', 30), today)).toMatchObject({ bucket: 'later', days: 30, elapsed: 0 });
    expect(dueInfo(task('2026-11-11', 8), today).elapsed).toBe(0.5);
  });

  it('describes due dates and intervals in plain words', () => {
    expect(dueText(dueInfo(task(null), today))).toBe('Noch nie gemacht');
    expect(dueText(dueInfo(task('2026-11-05'), today))).toBe('Seit 3 Tagen fällig');
    expect(dueText(dueInfo(task('2026-11-07'), today))).toBe('Seit gestern fällig');
    expect(dueText(dueInfo(task('2026-11-09'), today))).toBe('Morgen');
    expect(dueText(dueInfo(task('2026-11-12'), today))).toBe('In 4 Tagen');
    expect(['Täglich', 'Wöchentlich', 'Alle 2 Wochen', 'Monatlich', 'Alle 3 Tage'])
      .toEqual([1, 7, 14, 30, 3].map(intervalLabel));
    expect([agoText('2026-11-15', today), agoText('2026-11-14', today), agoText('2026-11-10', today)])
      .toEqual(['heute', 'gestern', 'vor 5 Tagen']);
  });

  it('counts who cleaned how much lately and whose turn is where', () => {
    const people = [{ id: 's', name: 'Simon', isMe: true }, { id: 'l', name: 'Lisa', isMe: false }];
    const tasks = [
      task('2026-11-14', 7, { id: 'a', assignedTo: 'l', durationMinutes: 30, logs: [
        { id: '1', task: 'a', doneAt: '2026-11-14', doneBy: 'l' },
        { id: '2', task: 'a', doneAt: '2026-11-07', doneBy: 'l' },
        { id: '3', task: 'a', doneAt: '2026-09-01', doneBy: 's' },
      ] }),
      task('2026-11-12', 7, { id: 'b', assignedTo: 'l', logs: [{ id: '4', task: 'b', doneAt: '2026-11-12', doneBy: 's' }] }),
      task(null, 7, { id: 'c', assignedTo: 's', isActive: false }),
    ];
    expect(personShares(tasks, people, 30, today).map(s => [s.id, s.done, s.minutes, s.turns]))
      .toEqual([['l', 2, 60, 2], ['s', 1, 0, 0]]);
    expect(recentLogs(tasks, 2).map(r => r.log.id)).toEqual(['1', '4']);
  });
});
