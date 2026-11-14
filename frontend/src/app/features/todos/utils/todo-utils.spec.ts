import { describe, expect, it } from 'vitest';
import { checklistProgress, dueBucket, dueLabel, formatDuration, initials, quickDates } from './todo-utils';

describe('task helpers', () => {
  const now = new Date(2026, 10, 14, 16, 0); // Saturday
  const at = (d: number, h = 23) => new Date(2026, 10, d, h, 59).toISOString();

  it('sorts tasks into due groups', () => {
    expect(dueBucket({ id: 'a', title: '', done: false, dueDate: at(13) }, now)).toBe('overdue');
    expect(dueBucket({ id: 'a', title: '', done: false, dueDate: at(14, 9) }, now)).toBe('today');
    expect(dueBucket({ id: 'a', title: '', done: false, dueDate: at(15) }, now)).toBe('tomorrow');
    expect(dueBucket({ id: 'a', title: '', done: false, dueDate: at(16) }, now)).toBe('later');
    expect(dueBucket({ id: 'a', title: '', done: false }, now)).toBe('none');
    const wednesday = new Date(2026, 10, 11, 9);
    expect(dueBucket({ id: 'a', title: '', done: false, dueDate: at(14) }, wednesday)).toBe('week');
  });

  it('names due dates relative to today', () => {
    expect([at(14), at(15), at(13), at(10), at(19), at(30)].map(d => dueLabel(d, now)))
      .toEqual(['Heute', 'Morgen', 'Gestern', 'vor 4 Tagen', 'Do 19.11.', '30.11.']);
    expect(dueLabel(new Date(2027, 0, 5).toISOString(), now)).toBe('5.1.2027');
  });

  it('offers quick dates from a Saturday', () => {
    expect(quickDates(now).map(q => q.date)).toEqual(['2026-11-14', '2026-11-15', '2026-11-21', '2026-11-16']);
    expect(quickDates(new Date(2026, 10, 11)).map(q => q.date)[2]).toBe('2026-11-14');
    expect(quickDates(now)[2].label).toBe('Nächstes Wochenende');
    expect(quickDates(new Date(2026, 10, 15)).map(q => q.label)).toEqual(['Heute', 'Morgen', 'Nächstes Wochenende']);
  });

  it('counts the checklist and formats people and durations', () => {
    expect(checklistProgress([{ text: 'a', done: true }, { text: 'b', done: false }])).toEqual({ done: 1, total: 2 });
    expect([initials('Lisa'), initials('Anna Muster'), initials('')]).toEqual(['LI', 'AM', '?']);
    expect([formatDuration(45), formatDuration(120), formatDuration(90), formatDuration(null)])
      .toEqual(['45 Min.', '2 Std.', '1 Std. 30 Min.', '']);
  });
});
