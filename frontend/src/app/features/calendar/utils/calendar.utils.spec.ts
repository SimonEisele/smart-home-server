import { Todo } from '../../todos/model/todos.model';
import { CleaningTask } from '../../cleaning/model/cleaning.model';
import {
  HOUR_PX, buildWeek, overlapColumns, cleaningEntriesForDay, cleaningNextDue, dayTasks, daysBetween, formatDuration, gridHeight, gridTop,
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
    const titles = Object.fromEntries(Object.entries(occ).map(([day, list]) => [day, list.map(t => t.title)]));
    expect(titles).toEqual({
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
    expect(todoOccurrences([monthly], nov)).toEqual({ '2026-11-30': [monthly] });
    const bimonthly = { ...monthly, recurrenceInterval: 2 };
    expect(todoOccurrences([bimonthly], nov)).toEqual({ '2026-11-30': [bimonthly] }); // Jan → Nov: 10 months
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

  it('lists tasks and cleaning per day and moves overdue one-off tasks to today', () => {
    const today = new Date(2026, 10, 11, 10, 0);
    const late = todo({ id: 'late', title: 'Steuern', dueDate: new Date(2026, 10, 9, 18).toISOString() });
    const soon = todo({ id: 'soon', title: 'Velo', dueDate: new Date(2026, 10, 13, 18).toISOString() });
    const weekly = todo({ id: 'w', title: 'Altpapier', recurrence: 'weekly', startDate: new Date(2026, 10, 9, 7).toISOString() });
    const undated = todo({ id: 'u', title: 'Irgendwann' });
    const bath = task({ id: 'bad', name: 'Bad', lastDoneAt: '2026-11-01' });
    const all = [late, soon, weekly, undated];
    expect(dayTasks(all, [bath], '2026-11-09', today).map(t => t.key)).toEqual(['todo:w']);
    expect(dayTasks(all, [bath], '2026-11-11', today).map(t => [t.key, t.overdue])).toEqual([
      ['todo:late', true], ['cleaning:bad', true],
    ]);
    expect(dayTasks(all, [bath], '2026-11-13', today).map(t => t.key)).toEqual(['todo:soon']);
    expect(dayTasks(all, [bath], '2026-11-16', today).map(t => [t.key, t.recurring])).toEqual([['todo:w', true]]);
  });

  it('puts overlapping appointments side by side', () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 11, h, m).toISOString();
    expect(overlapColumns([
      { id: 'a', start: at(16), end: at(17, 30) },
      { id: 'b', start: at(17, 45), end: at(19, 15) },
      { id: 'c', start: at(19), end: at(20, 30) },
      { id: 'd', start: at(21), end: at(22) },
    ])).toEqual({ a: { col: 0, cols: 1 }, b: { col: 0, cols: 2 }, c: { col: 1, cols: 2 }, d: { col: 0, cols: 1 } });
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
