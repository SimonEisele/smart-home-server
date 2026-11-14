import { localIsoDate } from '../../../shared/utils/date-utils';
import { ChecklistItem, Todo } from '../model/todos.model';

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none';

export const BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: 'Überfällig', today: 'Heute', tomorrow: 'Morgen', week: 'Diese Woche', later: 'Später', none: 'Ohne Datum',
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function startOfDay(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function dayDiff(date: Date, now: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

/** Where a task belongs in the list: overdue, today, tomorrow, rest of this week, later, no date. */
export function dueBucket(todo: Todo, now = new Date()): DueBucket {
  if (!todo.dueDate) return 'none';
  const due = new Date(todo.dueDate);
  if (!todo.done && due < now && dayDiff(due, now) < 0) return 'overdue';
  const diff = dayDiff(due, now);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  const daysToSunday = (7 - now.getDay()) % 7;
  return diff <= daysToSunday ? 'week' : 'later';
}

/** "Heute", "Morgen", "Gestern", "vor 3 Tagen", "Fr 20.11.", "20.11.2027". */
export function dueLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  const diff = dayDiff(date, now);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff < -1 && diff > -14) return `vor ${-diff} Tagen`;
  const short = `${date.getDate()}.${date.getMonth() + 1}.`;
  if (date.getFullYear() !== now.getFullYear()) return `${short}${date.getFullYear()}`;
  return diff > 0 && diff < 7 ? `${WEEKDAYS[date.getDay()]} ${short}` : short;
}

/** Quick picks for the due date (local yyyy-mm-dd). */
export function quickDates(now = new Date()): Array<{ key: string; label: string; date: string }> {
  const add = (days: number) => localIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
  const toSaturday = (6 - now.getDay() + 7) % 7 || 7;
  const toMonday = (8 - now.getDay()) % 7 || 7;
  const picks = [
    { key: 'today', label: 'Heute', date: add(0) },
    { key: 'tomorrow', label: 'Morgen', date: add(1) },
    { key: 'weekend', label: now.getDay() === 6 || now.getDay() === 0 ? 'Nächstes Wochenende' : 'Wochenende',
      date: add(toSaturday) },
    { key: 'next-week', label: 'Nächste Woche', date: add(toMonday) },
  ];
  // On a Sunday "Nächste Woche" is tomorrow: show each date only once.
  return picks.filter((pick, i) => picks.findIndex(other => other.date === pick.date) === i);
}

export function checklistProgress(items: ChecklistItem[] | undefined): { done: number; total: number } {
  const list = items ?? [];
  return { done: list.filter(item => item.done).length, total: list.length };
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

/** A stable colour per person, so everyone recognises "their" tasks. */
export function personColor(id: string | null | undefined): string {
  const palette = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e', '#ef4444'];
  if (!id) return '#64748b';
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? (m ? `${h} Std. ${m} Min.` : `${h} Std.`) : `${m} Min.`;
}
