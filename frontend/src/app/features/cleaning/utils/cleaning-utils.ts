import { CleaningCategory, CleaningLog, CleaningPerson, CleaningTask } from '../model/cleaning.model';

/** Pure cleaning-plan logic: rooms, intervals, when something is due and who did how much. */

export interface Room { key: CleaningCategory; label: string; icon: string; }

export const ROOMS: Room[] = [
  { key: 'kitchen', label: 'Küche', icon: '🍳' },
  { key: 'bathroom', label: 'Bad', icon: '🚿' },
  { key: 'living_room', label: 'Wohnzimmer', icon: '🛋️' },
  { key: 'bedroom', label: 'Schlafzimmer', icon: '🛏️' },
  { key: 'hallway', label: 'Flur / Eingang', icon: '🚪' },
  { key: 'other', label: 'Sonstiges', icon: '🧹' },
];

export function room(key: CleaningCategory | string | undefined): Room {
  return ROOMS.find(r => r.key === key) ?? ROOMS[ROOMS.length - 1];
}

export const INTERVAL_PRESETS: { days: number; label: string }[] = [
  { days: 1, label: 'Täglich' },
  { days: 3, label: 'Alle 3 Tage' },
  { days: 7, label: 'Wöchentlich' },
  { days: 14, label: 'Alle 2 Wochen' },
  { days: 30, label: 'Monatlich' },
];

export function intervalLabel(days: number): string {
  if (days === 1) return 'Täglich';
  if (days === 7) return 'Wöchentlich';
  if (days === 30 || days === 31) return 'Monatlich';
  if (days % 30 === 0) return `Alle ${days / 30} Monate`;
  if (days % 7 === 0) return `Alle ${days / 7} Wochen`;
  return `Alle ${days} Tage`;
}

export type DueBucket = 'overdue' | 'today' | 'week' | 'later';

export interface DueInfo {
  next: Date;
  /** Days from today until due; negative when overdue. */
  days: number;
  bucket: DueBucket;
  never: boolean;
  /** How much of the interval has passed, 0–1 (full once due). */
  elapsed: number;
}

const DAY = 86_400_000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 'yyyy-mm-dd' as a local date (new Date('yyyy-mm-dd') would be UTC midnight). */
export function parseDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY);
}

/** Same rule as the calendar: due `intervalDays` after the last time; never done means due today. */
export function dueInfo(task: CleaningTask, today = new Date()): DueInfo {
  const now = startOfDay(today);
  if (!task.lastDoneAt) return { next: now, days: 0, bucket: 'today', never: true, elapsed: 1 };
  const last = parseDay(task.lastDoneAt);
  const next = new Date(last);
  next.setDate(next.getDate() + task.intervalDays);
  const days = daysBetween(now, next);
  const bucket: DueBucket = days < 0 ? 'overdue' : days === 0 ? 'today' : days < 7 ? 'week' : 'later';
  const elapsed = Math.min(1, Math.max(0, daysBetween(last, now) / Math.max(1, task.intervalDays)));
  return { next, days, bucket, never: false, elapsed };
}

export function shortDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseDay(date) : date;
  return d.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

export function dueText(info: DueInfo): string {
  if (info.never) return 'Noch nie gemacht';
  if (info.days < -1) return `Seit ${-info.days} Tagen fällig`;
  if (info.days === -1) return 'Seit gestern fällig';
  if (info.days === 0) return 'Heute fällig';
  if (info.days === 1) return 'Morgen';
  if (info.days < 7) return `In ${info.days} Tagen`;
  return `Am ${shortDate(info.next)}`;
}

/** "vor 3 Tagen" style text for the last completion. */
export function agoText(value: string, today = new Date()): string {
  const days = daysBetween(parseDay(value), today);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 14) return `vor ${days} Tagen`;
  return shortDate(value);
}

export interface PersonShare {
  id: string;
  name: string;
  isMe: boolean;
  /** Completions in the period. */
  done: number;
  minutes: number;
  /** Tasks where it is this person's turn. */
  turns: number;
}

/** Who cleaned how much in the last `days` days, and whose turn is where. */
export function personShares(tasks: CleaningTask[], people: CleaningPerson[], days = 30, today = new Date()): PersonShare[] {
  const since = startOfDay(today);
  since.setDate(since.getDate() - days);
  const shares = new Map<string, PersonShare>(
    people.map(p => [p.id, { id: p.id, name: p.name, isMe: p.isMe, done: 0, minutes: 0, turns: 0 }]));
  for (const task of tasks) {
    if (task.isActive === false) continue;
    const turn = task.assignedTo ? shares.get(task.assignedTo) : undefined;
    if (turn) turn.turns += 1;
    for (const log of task.logs ?? []) {
      const share = log.doneBy ? shares.get(log.doneBy) : undefined;
      if (!share || parseDay(log.doneAt) < since) continue;
      share.done += 1;
      share.minutes += task.durationMinutes ?? 0;
    }
  }
  return [...shares.values()].sort((a, b) => b.done - a.done || a.name.localeCompare(b.name, 'de'));
}

export interface RecentLog { log: CleaningLog; task: CleaningTask; }

/** The latest completions over all tasks, newest first. */
export function recentLogs(tasks: CleaningTask[], limit = 6): RecentLog[] {
  return tasks
    .flatMap(task => (task.logs ?? []).map(log => ({ log, task })))
    .sort((a, b) => b.log.doneAt.localeCompare(a.log.doneAt) || (b.log.created_at ?? '').localeCompare(a.log.created_at ?? ''))
    .slice(0, limit);
}
