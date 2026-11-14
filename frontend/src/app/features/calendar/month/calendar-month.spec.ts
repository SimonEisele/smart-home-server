import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { CalendarMonth, MonthEntry } from './calendar-month';
import { buildMonth } from '../utils/calendar.utils';

describe('Month grid', () => {
  const entry = (id: string, time = '10:00'): MonthEntry =>
    ({ id, title: `Termin ${id}`, time, color: 'red', movable: true, event: { id, title: id, start: '' } });

  function render(compact = false) {
    const fixture = TestBed.createComponent(CalendarMonth);
    const month = fixture.componentInstance;
    month.days = buildMonth(new Date(2026, 10, 14), new Date(2026, 10, 14));
    month.month = 10;
    month.selected = '2026-11-14';
    month.compact = compact;
    month.entriesFor = d => d === '2026-11-14' ? ['a', 'b', 'c', 'd', 'e', 'f'].map(id => entry(id)) : [];
    month.taskCountFor = d => d === '2026-11-19' ? 2 : 0;
    fixture.detectChanges();
    return { fixture, month, el: fixture.nativeElement as HTMLElement };
  }

  it('shows whole weeks with calendar weeks, dims other months and folds long days', () => {
    const { el } = render();
    expect(el.querySelectorAll('.month-row').length).toBe(6);
    expect(el.querySelector('.kw')?.textContent?.trim()).toBe('44');
    expect(el.querySelectorAll('.cell.other-month').length).toBe(12);
    const today = el.querySelector('.cell.today')!;
    expect(today.querySelectorAll('.entry').length).toBe(2); // 3 lines without measured height: 2 + "weitere"
    expect(today.querySelector('.more')?.textContent).toContain('4 weitere');
    expect(el.querySelector('[aria-label^="Do 19.11."]')?.getAttribute('aria-label')).toContain('2 Aufgaben');
  });

  it('shows dots on phones and reports picks and drops', () => {
    const { el, month } = render(true);
    expect(el.querySelector('.cell.today .dots')?.children.length).toBe(4);
    expect(el.querySelector('.entry')).toBeNull();
    const pick = vi.fn(), drop = vi.fn();
    month.pickDay.subscribe(pick);
    month.dropOnDay.subscribe(drop);
    (el.querySelector('.cell.today .cell-hit') as HTMLButtonElement).click();
    expect(pick).toHaveBeenCalledWith('2026-11-14');
    month.onDrop({ preventDefault: () => undefined } as DragEvent, month.days[3]);
    expect(drop).toHaveBeenCalledWith('2026-10-29');
  });
});
