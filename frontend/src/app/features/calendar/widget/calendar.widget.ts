import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarEvent } from '../model/calendar.model';
import { CalendarService } from '../service/calendar.service';

@Component({
  selector: 'calendar-widget',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './calendar.widget.html',
  styleUrl: './calendar.widget.css',
})
export class CalendarWidget implements OnInit {
  events: CalendarEvent[] = [];
  today = new Date();

  constructor(private calendarService: CalendarService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    const start = this.iso(new Date());
    const end   = this.iso(new Date(Date.now() + 13 * 24 * 60 * 60 * 1000)); // +13 days
    this.calendarService.getEvents(start, end).subscribe(evs => {
      this.events = evs
        .filter(ev => !ev.allDay)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      this.cdr.detectChanges();
    });
  }

  get groupedEvents(): { label: string; dateStr: string; events: CalendarEvent[] }[] {
    const groups: Map<string, CalendarEvent[]> = new Map();
    for (const ev of this.events) {
      const ds = ev.start.split('T')[0];
      if (!groups.has(ds)) groups.set(ds, []);
      groups.get(ds)!.push(ev);
    }
    const result: { label: string; dateStr: string; events: CalendarEvent[] }[] = [];
    groups.forEach((evs, ds) => {
      result.push({ label: this.dayLabel(ds), dateStr: ds, events: evs });
    });
    return result.slice(0, 5); // show max 5 days
  }

  private dayLabel(ds: string): string {
    const d = new Date(ds + 'T00:00:00');
    const today = this.iso(new Date());
    const tomorrow = this.iso(new Date(Date.now() + 86400000));
    if (ds === today)    return 'Heute';
    if (ds === tomorrow) return 'Morgen';
    return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
  }

  timeStr(iso: string): string {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  durationMin(ev: CalendarEvent): number {
    if (!ev.end) return 0;
    return Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000);
  }

  isNow(ev: CalendarEvent): boolean {
    const now = Date.now();
    return new Date(ev.start).getTime() <= now && (!ev.end || new Date(ev.end).getTime() >= now);
  }

  evClass(ev: CalendarEvent): string {
    const base = 'ev-item ev-' + (ev.calendarType ?? 'household');
    return ev.todoRefId ? base + ' ev-todo' : base;
  }

  private iso(d: Date): string { return d.toISOString().split('T')[0]; }
}
