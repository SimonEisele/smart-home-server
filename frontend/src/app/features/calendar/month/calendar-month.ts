import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, Output,
  ViewChild, inject,
} from '@angular/core';
import { CalendarEvent } from '../model/calendar.model';
import { DayEntry, isoWeek } from '../utils/calendar.utils';

/** One appointment as the month grid shows it. */
export interface MonthEntry {
  id: string;
  title: string;
  /** 'HH:mm', empty for all-day appointments. */
  time: string;
  color: string;
  /** Appointments of other calendars that can't be moved here (linked calendars). */
  movable: boolean;
  busyOnly?: boolean;
  event: CalendarEvent;
}

export const MONTH_ENTRY_TYPE = 'application/x-calendar-month-entry';

/**
 * Month overview: whole weeks, a few appointments per day and "+ n weitere".
 * On phones (`compact`) every day only shows coloured dots; the chosen day is listed below the grid.
 */
@Component({
  selector: 'app-calendar-month',
  standalone: true,
  templateUrl: './calendar-month.html',
  styleUrl: './calendar-month.css',
  changeDetection: ChangeDetectionStrategy.Default,
})
export class CalendarMonth implements AfterViewInit, OnDestroy {
  @Input({ required: true }) days: DayEntry[] = [];
  /** Month shown (0–11); days of the neighbouring months are dimmed. */
  @Input({ required: true }) month = 0;
  @Input() selected = '';
  @Input() compact = false;
  @Input({ required: true }) entriesFor: (dateStr: string) => MonthEntry[] = () => [];
  /** Open tasks and cleaning due on a day. */
  @Input() taskCountFor: (dateStr: string) => number = () => 0;

  @Output() pickDay = new EventEmitter<string>();
  @Output() openEntry = new EventEmitter<CalendarEvent>();
  @Output() addEvent = new EventEmitter<string>();
  @Output() dragEntry = new EventEmitter<CalendarEvent>();
  @Output() dropOnDay = new EventEmitter<string>();

  readonly WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  dragOver = '';

  get weeks(): DayEntry[][] {
    const rows: DayEntry[][] = [];
    for (let i = 0; i < this.days.length; i += 7) rows.push(this.days.slice(i, i + 7));
    return rows;
  }

  @ViewChild('body') private body?: ElementRef<HTMLElement>;
  private readonly cdr = inject(ChangeDetectorRef);
  private resize?: ResizeObserver;
  private bodyHeight = 0;

  /** As many lines per day as fit: the day number takes ~32px, each appointment ~20px. */
  get maxEntries(): number {
    if (!this.bodyHeight || !this.weeks.length) return this.weeks.length > 5 ? 3 : 4;
    return Math.max(1, Math.min(8, Math.floor((this.bodyHeight / this.weeks.length - 38) / 20)));
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined' || !this.body) return;
    this.resize = new ResizeObserver(([entry]) => {
      const height = Math.round(entry.contentRect.height);
      if (height !== this.bodyHeight) { this.bodyHeight = height; this.cdr.detectChanges(); }
    });
    this.resize.observe(this.body.nativeElement);
  }

  ngOnDestroy(): void { this.resize?.disconnect(); }

  week(row: DayEntry[]): number { return isoWeek(row[0].date); }

  dayLabel(day: DayEntry, entries: number, tasks: number): string {
    const parts = [`${day.dayName} ${day.dayNum}.${day.month}.`];
    if (day.isToday) parts.push('heute');
    parts.push(entries ? `${entries} ${entries === 1 ? 'Termin' : 'Termine'}` : 'keine Termine');
    if (tasks) parts.push(`${tasks} ${tasks === 1 ? 'Aufgabe' : 'Aufgaben'}`);
    return parts.join(', ');
  }

  onEntryDragStart(e: DragEvent, entry: MonthEntry): void {
    if (!entry.movable || this.compact) { e.preventDefault(); return; }
    e.dataTransfer?.setData(MONTH_ENTRY_TYPE, entry.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    this.dragEntry.emit(entry.event);
  }

  onDragOver(e: DragEvent, day: DayEntry): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    this.dragOver = day.dateStr;
  }

  onDrop(e: DragEvent, day: DayEntry): void {
    e.preventDefault();
    this.dragOver = '';
    this.dropOnDay.emit(day.dateStr);
  }
}
