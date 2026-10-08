import { FitWidgetContentDirective } from '../../../shared/directives/fit-widget-content.directive';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CalendarEvent } from '../model/calendar.model';
import { CalendarService } from '../service/calendar.service';
import { CleaningTask } from '../../cleaning/model/cleaning.model';

interface CleaningWidgetEntry {
  task: CleaningTask;
  overdue: boolean;
}

interface CalendarWidgetDayGroup {
  label: string;
  dateStr: string;
  events: CalendarEvent[];
  cleaningTasks: CleaningWidgetEntry[];
}

@Component({
  selector: 'calendar-widget',
  standalone: true,
  imports: [FitWidgetContentDirective, CommonModule, RouterLink],
  templateUrl: './calendar.widget.html',
  styleUrl: './calendar.widget.css',
})
export class CalendarWidget implements OnInit {
  events: CalendarEvent[] = [];
  cleaningTasks: CleaningWidgetEntry[] = [];
  today = new Date();

  private readonly rangeDays = 13;

  constructor(private calendarService: CalendarService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    const startDate = new Date();
    const endDate = new Date(Date.now() + this.rangeDays * 24 * 60 * 60 * 1000);
    const start = this.iso(startDate);
    const end = this.iso(endDate);

    this.calendarService.getEvents(start, end).subscribe(evs => {
      this.events = evs
        .filter(ev => !ev.allDay)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      this.cdr.detectChanges();
    });

    this.calendarService.getCleaningTasks().subscribe(tasks => {
      this.cleaningTasks = this.getCleaningEntries(tasks, startDate, endDate);
      this.cdr.detectChanges();
    });
  }

  get groupedEvents(): CalendarWidgetDayGroup[] {
    const groups = new Map<string, CalendarWidgetDayGroup>();

    for (const ev of this.events) {
      const dateStr = ev.start.split('T')[0];
      const group = this.getOrCreateGroup(groups, dateStr);
      group.events.push(ev);
    }

    for (const entry of this.cleaningTasks) {
      const dueDate = this.cleaningDisplayDate(entry);
      const group = this.getOrCreateGroup(groups, dueDate);
      group.cleaningTasks.push(entry);
    }

    return Array.from(groups.values())
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
      .slice(0, 5);
  }

  get hasEntries(): boolean {
    return this.groupedEvents.length > 0;
  }

  timeStr(iso: string): string {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  isNow(ev: CalendarEvent): boolean {
    const now = Date.now();
    return new Date(ev.start).getTime() <= now && (!ev.end || new Date(ev.end).getTime() >= now);
  }

  evClass(ev: CalendarEvent): string {
    const base = 'ev-item ev-' + (ev.calendarType ?? 'household');
    return ev.todoRefId ? base + ' ev-todo' : base;
  }

  private getOrCreateGroup(groups: Map<string, CalendarWidgetDayGroup>, dateStr: string): CalendarWidgetDayGroup {
    let group = groups.get(dateStr);
    if (!group) {
      group = {
        label: this.dayLabel(dateStr),
        dateStr,
        events: [],
        cleaningTasks: [],
      };
      groups.set(dateStr, group);
    }
    return group;
  }

  private getCleaningEntries(tasks: CleaningTask[], startDate: Date, endDate: Date): CleaningWidgetEntry[] {
    const today = this.startOfDay(new Date());
    const start = this.startOfDay(startDate);
    const end = this.startOfDay(endDate);
    const entries: CleaningWidgetEntry[] = [];

    for (const task of tasks) {
      if (!task.isActive) continue;

      const due = this.cleaningNextDue(task);
      if (!due) continue;

      const dueDay = this.startOfDay(due);
      const overdue = dueDay.getTime() < today.getTime();
      const displayDay = overdue ? today : dueDay;

      if (displayDay < start || displayDay > end) continue;
      entries.push({ task, overdue });
    }

    return entries.sort((a, b) => {
      const dateDiff = this.cleaningDisplayDate(a).localeCompare(this.cleaningDisplayDate(b));
      return dateDiff || a.task.name.localeCompare(b.task.name);
    });
  }

  private cleaningDisplayDate(entry: CleaningWidgetEntry): string {
    if (entry.overdue) return this.iso(new Date());
    return this.iso(this.cleaningNextDue(entry.task) ?? new Date());
  }

  private cleaningNextDue(task: CleaningTask): Date | null {
    if (!task.lastDoneAt) return new Date();

    const last = this.startOfDay(new Date(task.lastDoneAt));
    const due = new Date(last);
    due.setDate(due.getDate() + task.intervalDays);
    return due;
  }

  private dayLabel(ds: string): string {
    const d = new Date(ds + 'T00:00:00');
    const today = this.iso(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = this.iso(tomorrowDate);

    if (ds === today) return 'Heute';
    if (ds === tomorrow) return 'Morgen';
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private iso(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
