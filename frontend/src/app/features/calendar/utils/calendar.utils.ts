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

export type CalendarView = 'day' | 'week' | 'month';

export const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September',
  'Oktober', 'November', 'Dezember'];
const LONG_DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** Whole weeks (Monday to Sunday) covering the month of `d`: 4 to 6 rows. */
export function buildMonth(d: Date, today = new Date()): DayEntry[] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const days: DayEntry[] = [];
  let week = buildWeek(first, today);
  while (week.weekStart <= last) {
    days.push(...week.days);
    week = buildWeek(new Date(week.weekStart.getFullYear(), week.weekStart.getMonth(), week.weekStart.getDate() + 7), today);
  }
  return days;
}

/** ISO 8601 calendar week (KW) as used in Switzerland. */
export function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * Heading for the shown period: "Samstag, 14. November 2026", "9.–15. Nov. 2026", "November 2026".
 * `short` (phones) drops the weekday name and the current year: "Sa, 14. Nov.", "9.–15. Nov.".
 */
export function periodLabel(view: CalendarView, anchor: Date, days: DayEntry[], short = false, today = new Date()): string {
  if (view === 'month') return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
  const year = short && anchor.getFullYear() === today.getFullYear() ? '' : ` ${anchor.getFullYear()}`;
  if (view === 'day') {
    if (short) return `${DAY_NAMES[anchor.getDay()]}, ${anchor.getDate()}. ${shortMonth(anchor.getMonth())}${year}`;
    return `${LONG_DAY_NAMES[anchor.getDay()]}, ${anchor.getDate()}. ${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }
  if (!days.length) return '';
  const [s, e] = [days[0].date, days[days.length - 1].date];
  const start = s.getMonth() === e.getMonth() ? `${s.getDate()}.` : `${s.getDate()}. ${shortMonth(s.getMonth())}`;
  const endYear = short && e.getFullYear() === today.getFullYear() ? '' : ` ${e.getFullYear()}`;
  return `${start}–${e.getDate()}. ${shortMonth(e.getMonth())}${endYear}`;
}

function shortMonth(m: number): string {
  return MONTH_NAMES[m].length > 4 ? MONTH_NAMES[m].slice(0, 3) + '.' : MONTH_NAMES[m];
}

/** The same day one step earlier or later: a day, a week or a month (clamped to shorter months). */
export function shiftDate(d: Date, view: CalendarView, step: number): Date {
  if (view === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + step);
  if (view === 'week') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * step);
  const target = new Date(d.getFullYear(), d.getMonth() + step, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay));
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

/** Open todos per day of the given week (one-off todos on their date, recurring ones on each occurrence). */
export function todoOccurrences(todos: Todo[], days: DayEntry[]): Record<string, Todo[]> {
  const occ: Record<string, Todo[]> = {};
  for (const todo of todos) {
    if (todo.done) continue;
    const anchor = todo.startDate || todo.dueDate;
    if (!anchor) continue;
    const base = new Date(anchor);
    if (isNaN(base.getTime())) continue;
    for (const day of days) {
      if (recursOn(todo, base, day.date)) occ[day.dateStr] = [...(occ[day.dateStr] ?? []), todo];
    }
  }
  return occ;
}

/** Something to tick off on a day: a task or a cleaning job. */
export interface DayTask {
  kind: 'todo' | 'cleaning';
  key: string;
  title: string;
  overdue: boolean;
  recurring: boolean;
  todo?: Todo;
  cleaning?: CleaningTask;
}

/** A one-off todo is overdue once its (due or start) day has passed. */
export function todoOverdue(todo: Todo, today = new Date()): boolean {
  const anchor = todo.dueDate || todo.startDate;
  if (todo.done || todo.recurrence || !anchor) return false;
  return daysBetween(new Date(anchor), today) > 0;
}

/**
 * Everything to tick off on `dateStr`: dated and recurring todos plus due cleaning.
 * Overdue one-off todos and cleaning move to today instead of staying on past days.
 */
export function dayTasks(todos: Todo[], cleaning: CleaningTask[], dateStr: string, today = new Date()): DayTask[] {
  const day = parseLocalDate(dateStr);
  const offset = daysBetween(today, day);
  const tasks: DayTask[] = [];
  for (const todo of todos) {
    if (todo.done) continue;
    const anchor = todo.startDate || todo.dueDate;
    const overdue = todoOverdue(todo, today);
    const onDay = !!anchor && !overdue && recursOn(todo, new Date(anchor), day);
    if (onDay || (overdue && offset === 0)) {
      tasks.push({ kind: 'todo', key: `todo:${todo.id}`, title: todo.title, overdue, recurring: !!todo.recurrence, todo });
    }
  }
  for (const entry of cleaningEntriesForDay(cleaning, dateStr, today)) {
    tasks.push({ kind: 'cleaning', key: `cleaning:${entry.task.id}`, title: entry.task.name,
                 overdue: entry.overdue, recurring: true, cleaning: entry.task });
  }
  return tasks.sort((a, b) => Number(b.overdue) - Number(a.overdue));
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

/**
 * Side-by-side columns for overlapping appointments of one day.
 * Returns, per event id, its column and the number of columns in its overlap group.
 */
export function overlapColumns(events: { id: string; start: string; end?: string | null }[]):
    Record<string, { col: number; cols: number }> {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const result: Record<string, { col: number; cols: number }> = {};
  let group: string[] = [];
  let colEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => { for (const id of group) result[id].cols = colEnds.length; group = []; colEnds = []; };
  for (const ev of sorted) {
    const start = new Date(ev.start).getTime();
    const end = ev.end ? new Date(ev.end).getTime() : start + 3_600_000;
    if (start >= groupEnd) close();
    let col = colEnds.findIndex(colEnd => colEnd <= start);
    if (col === -1) { col = colEnds.length; colEnds.push(end); } else colEnds[col] = end;
    result[ev.id] = { col, cols: 1 };
    group.push(ev.id);
    groupEnd = Math.max(groupEnd, end);
  }
  close();
  return result;
}
