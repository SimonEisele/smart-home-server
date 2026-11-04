import { localIsoDate } from '../../../shared/utils/date-utils';
import { Todo } from '../../todos/model/todos.model';
import { CleaningTask } from '../../cleaning/model/cleaning.model';

/** Pure calendar logic: week layout, grid geometry, recurring todos, cleaning due dates. */

export interface DayEntry { date: Date; dateStr: string; isToday: boolean; dayName: string; dayNum: number; month: number; }

export const DAY_NAMES = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const START_HOUR = 6;
export const END_HOUR = 23;
export const HOUR_PX = 64; // px per hour in the week grid

export function pad(n: number): string { return String(n).padStart(2, '0'); }

/** 'YYYY-MM-DD' as a local date. `new Date('YYYY-MM-DD')` would be UTC midnight. */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Whole calendar days between two dates, ignoring time of day and DST shifts. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** Monday-based week containing `d`. */
export function buildWeek(d: Date, today = new Date()): { weekStart: Date; days: DayEntry[] } {
  const day = d.getDay();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (day === 0 ? -6 : 1 - day));
  const todayStr = localIsoDate(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const di = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const dateStr = localIsoDate(di);
    return { date: di, dateStr, isToday: dateStr === todayStr,
             dayName: DAY_NAMES[di.getDay()], dayNum: di.getDate(), month: di.getMonth() + 1 };
  });
  return { weekStart: monday, days };
}

export function weekLabel(days: DayEntry[]): string {
  if (!days.length) return '';
  const [s, e] = [days[0].date, days[days.length - 1].date];
  const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.`;
  return `${fmt(s)} – ${fmt(e)}${e.getFullYear()}`;
}

/** Does a todo anchored at `base` recur on `day`? */
function recursOn(todo: Todo, base: Date, day: Date): boolean {
  const diff = daysBetween(base, day);
  if (diff < 0) return false;
  const interval = Math.max(1, todo.recurrenceInterval ?? 1);
  switch (todo.recurrence) {
    case 'daily': return diff % interval === 0;
    case 'weekly': return diff % (7 * interval) === 0;
    case 'monthly': {
      const months = (day.getFullYear() - base.getFullYear()) * 12 + day.getMonth() - base.getMonth();
      // Months without that day (e.g. the 31st) fall on their last day.
      const lastDay = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
      return months % interval === 0 && day.getDate() === Math.min(base.getDate(), lastDay);
    }
    default: return diff === 0;
  }
}

/** Titles of open todos per day of the given week. */
export function todoOccurrences(todos: Todo[], days: DayEntry[]): Record<string, string[]> {
  const occ: Record<string, string[]> = {};
  for (const todo of todos) {
    if (todo.done) continue;
    const anchor = todo.startDate || todo.dueDate;
    if (!anchor) continue;
    const base = new Date(anchor);
    if (isNaN(base.getTime())) continue;
    for (const day of days) {
      if (recursOn(todo, base, day.date)) occ[day.dateStr] = [...(occ[day.dateStr] ?? []), todo.title];
    }
  }
  return occ;
}

/** Next due day of a cleaning task; never done means due today. */
export function cleaningNextDue(task: CleaningTask, today = new Date()): Date {
  const start = task.lastDoneAt ? parseLocalDate(task.lastDoneAt) : today;
  const offset = task.lastDoneAt ? task.intervalDays : 0;
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
}

/** Active tasks due on `dateStr`; overdue tasks are listed on today. */
export function cleaningEntriesForDay(tasks: CleaningTask[], dateStr: string, today = new Date()):
    { task: CleaningTask; overdue: boolean }[] {
  const day = parseLocalDate(dateStr);
  const isToday = daysBetween(today, day) === 0;
  const active = tasks.filter(task => task.isActive);
  const due = active.filter(task => daysBetween(cleaningNextDue(task, today), day) === 0)
    .map(task => ({ task, overdue: false }));
  const overdue = isToday
    ? active.filter(task => daysBetween(cleaningNextDue(task, today), today) > 0).map(task => ({ task, overdue: true }))
    : [];
  return [...due, ...overdue];
}

/** Vertical position in the week grid for a point in time. */
export function gridTop(d: Date): number {
  const mins = (d.getHours() - START_HOUR) * 60 + d.getMinutes();
  return Math.max(0, mins * (HOUR_PX / 60));
}

/** Height in the week grid for an event; at least 20px, one hour without an end. */
export function gridHeight(start: string, end?: string | null): number {
  if (!end) return HOUR_PX;
  const mins = (new Date(end).getTime() - new Date(start).getTime()) / 60000;
  return Math.max(20, mins * (HOUR_PX / 60));
}

export function formatDuration(min?: number | null): string {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${m}` : `${h}h`;
}
