import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DayEntry } from '../utils/calendar.utils';

/** Phone day view: the week as a row of days with dots for appointments; tap to switch day. */
@Component({
  selector: 'app-calendar-day-strip',
  standalone: true,
  template: `
    <div class="strip" role="tablist" aria-label="Tag der Woche">
      @for (day of days; track day.dateStr) {
        @let count = countFor(day.dateStr);
        <button type="button" role="tab" class="strip-day" [class.today]="day.isToday"
          [class.selected]="day.dateStr === selected" [attr.aria-selected]="day.dateStr === selected"
          [attr.aria-label]="day.dayName + ' ' + day.dayNum + '.' + day.month + '.' + (count ? ', ' + count + ' Einträge' : '')"
          (click)="pick.emit(day.dateStr)">
          <span class="name">{{ day.dayName }}</span>
          <span class="num">{{ day.dayNum }}</span>
          <span class="dot" [class.on]="count > 0" aria-hidden="true"></span>
        </button>
      }
    </div>`,
  styles: [`
    .strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
    .strip-day {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      min-height: 58px; padding: 6px 0 5px; border-radius: 12px;
      border: 1px solid transparent; background: none; color: var(--color-text); cursor: pointer;
    }
    .name { font-size: .66rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--color-muted); }
    .num { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; font-size: .9rem; font-weight: 650; }
    .today .num { color: var(--color-accent); }
    .selected { background: var(--color-surface); border-color: var(--color-card-border); }
    .selected .num { background: var(--color-accent); color: var(--color-on-accent, #0b1f1a); }
    .dot { width: 5px; height: 5px; border-radius: 50%; }
    .dot.on { background: var(--color-muted); }
    .strip-day:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
  `],
})
export class CalendarDayStrip {
  @Input({ required: true }) days: DayEntry[] = [];
  @Input() selected = '';
  @Input() countFor: (dateStr: string) => number = () => 0;
  @Output() pick = new EventEmitter<string>();
}
