import { Todo } from '../../todos/model/todos.model';
import { CleaningTask } from '../../cleaning/model/cleaning.model';
import {
  HOUR_PX, buildWeek, cleaningEntriesForDay, cleaningNextDue, daysBetween, formatDuration, gridHeight, gridTop,
  parseLocalDate, todoOccurrences, weekLabel,
} from './calendar.utils';

const todo = (over: Partial<Todo>): Todo => ({ id: 't', title: 'Müll', done: false, ...over } as Todo);
const task = (over: Partial<CleaningTask>): CleaningTask =>
  ({ id: 'c', name: 'Bad', category: 'bathroom', intervalDays: 7, isActive: true, ...over });

describe('calendar utils', () => {
  it('builds a Monday-based week, also from a Sunday', () => {
    const { weekStart, days } = buildWeek(new Date(2026, 10, 8), new Date(2026, 10, 4)); // Sunday 8.11.
    expect(weekStart.getDate()).toBe(2);
    expect(days.map(d => d.dateStr)).toEqual([
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
    ]);
    expect(days.filter(d => d.isToday).map(d => d.dayName)).toEqual(['Mi']);
    expect(weekLabel(days)).toBe('2.11. – 8.11.2026');
  });

  it('counts calendar days across the DST change', () => {
    expect(daysBetween(new Date(2026, 9, 24, 23, 0), new Date(2026, 9, 26, 0, 30))).toBe(2);
    expect(parseLocalDate('2026-11-04').getDate()).toBe(4);
  });

  it('shows recurring todos that start during the day on every occurrence', () => {
    const { days } = buildWeek(new Date(2026, 10, 2));
    const occ = todoOccurrences([
      todo({ id: 'w', title: 'Weekly', recurrence: 'weekly', startDate: new Date(2026, 9, 26, 9, 0).toISOString() }),
      todo({ id: 'd', title: 'Every 2 days', recurrence: 'daily', recurrenceInterval: 2, startDate: new Date(2026, 10, 2, 18, 30).toISOString() }),
      todo({ id: 'o', title: 'Once', startDate: new Date(2026, 10, 5, 10, 0).toISOString() }),
      todo({ id: 'x', title: 'Done', done: true, recurrence: 'daily', startDate: new Date(2026, 10, 2).toISOString() }),
    ], days);
    expect(occ).toEqual({
      '2026-11-02': ['Weekly', 'Every 2 days'],
      '2026-11-04': ['Every 2 days'],
      '2026-11-05': ['Once'],
      '2026-11-06': ['Every 2 days'],
      '2026-11-08': ['Every 2 days'],
    });
  });

  it('places monthly todos on the same day, or the last day of shorter months', () => {
    const monthly = todo({ title: 'Miete', recurrence: 'monthly', startDate: new Date(2026, 0, 31, 8, 0).toISOString() });
    const nov = buildWeek(new Date(2026, 10, 30)).days; // 30.11. is the last day of November
    expect(todoOccurrences([monthly], nov)).toEqual({ '2026-11-30': ['Miete'] });
    const bimonthly = { ...monthly, recurrenceInterval: 2 };
    expect(todoOccurrences([bimonthly], nov)).toEqual({ '2026-11-30': ['Miete'] }); // Jan → Nov: 10 months
    expect(todoOccurrences([bimonthly], buildWeek(new Date(2026, 11, 31)).days)).toEqual({}); // Dec: 11 months
  });

  it('computes cleaning due days and lists overdue tasks on today', () => {
    const today = new Date(2026, 10, 4, 15, 0);
    const weekly = task({ id: 'w', lastDoneAt: '2026-11-01' });
    const overdue = task({ id: 'o', lastDoneAt: '2026-10-20' });
    const never = task({ id: 'n', lastDoneAt: null });
    const paused = task({ id: 'p', lastDoneAt: null, isActive: false });
    expect(cleaningNextDue(weekly, today).getDate()).toBe(8);
    const tasks = [weekly, overdue, never, paused];
    expect(cleaningEntriesForDay(tasks, '2026-11-08', today).map(e => e.task.id)).toEqual(['w']);
    expect(cleaningEntriesForDay(tasks, '2026-11-04', today)).toEqual([
      { task: never, overdue: false }, { task: overdue, overdue: true },
    ]);
    expect(cleaningEntriesForDay(tasks, '2026-11-05', today)).toEqual([]);
  });

  it('maps times to grid pixels', () => {
    expect(gridTop(new Date(2026, 10, 4, 5, 0))).toBe(0);
    expect(gridTop(new Date(2026, 10, 4, 7, 30))).toBe(1.5 * HOUR_PX);
    expect(gridHeight('2026-11-04T08:00:00', null)).toBe(HOUR_PX);
    expect(gridHeight('2026-11-04T08:00:00', '2026-11-04T08:05:00')).toBe(20);
    expect(formatDuration(90)).toBe('1h30');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(null)).toBe('');
  });
});
