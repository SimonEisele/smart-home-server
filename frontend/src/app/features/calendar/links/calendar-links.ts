import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import { ExternalCalendar, ExternalCalendarVisibility, VISIBILITY_LABELS } from '../model/calendar.model';
import { CalendarService } from '../service/calendar.service';

export const CALENDAR_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];

interface LinkForm { name: string; url: string; color: string; visibility: ExternalCalendarVisibility; }

/**
 * "Kalender verbinden": subscribe to Outlook/Google/iCloud calendars by their iCal link,
 * choose who in the WG sees them, and get the link to show the WG calendar elsewhere.
 */
@Component({
  selector: 'app-calendar-links',
  standalone: true,
  imports: [DialogDirective, DatePipe, FormsModule],
  templateUrl: './calendar-links.html',
  styleUrl: './calendar-links.css',
})
export class CalendarLinks implements OnInit {
  @Output() closed = new EventEmitter<void>();
  /** Calendars were added, changed or removed: the page reloads its appointments. */
  @Output() changed = new EventEmitter<ExternalCalendar[]>();
  private readonly service = inject(CalendarService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly COLORS = CALENDAR_COLORS;
  readonly VISIBILITY_LABELS = VISIBILITY_LABELS;
  readonly VISIBILITIES: Array<{ value: ExternalCalendarVisibility; hint: string }> = [
    { value: 'private', hint: 'Nur du siehst die Termine.' },
    { value: 'busy', hint: 'Die anderen sehen, wann du belegt bist – ohne Titel und Ort.' },
    { value: 'shared', hint: 'Die anderen sehen die Termine mit Titel und Ort.' },
  ];

  calendars: ExternalCalendar[] = [];
  loading = true;
  showForm = false;
  form: LinkForm = this.emptyForm();
  saving = false;
  formError = '';
  busy = new Set<string>();
  confirmRemove: string | null = null;
  rowError: Record<string, string> = {};

  feedUrl = '';
  feedError = '';
  copied = false;
  confirmRenew = false;

  get mine(): ExternalCalendar[] { return this.calendars.filter(c => c.isOwner); }
  get others(): ExternalCalendar[] { return this.calendars.filter(c => !c.isOwner); }
  get webcalUrl(): string { return this.feedUrl.replace(/^https?:\/\//, 'webcal://'); }

  ngOnInit(): void {
    this.service.getExternalCalendars().pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); })).subscribe({
      next: calendars => {
        this.calendars = calendars;
        this.showForm = !calendars.some(c => c.isOwner);
      },
      error: () => { this.formError = 'Die Kalender konnten nicht geladen werden.'; },
    });
    this.service.getFeedLink().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: url => { this.feedUrl = url; this.cdr.markForCheck(); },
      error: () => { this.feedError = 'Der Abo-Link konnte nicht geladen werden.'; this.cdr.markForCheck(); },
    });
  }

  close(): void { if (!this.saving) this.closed.emit(); }

  openForm(): void {
    this.form = this.emptyForm();
    this.formError = '';
    this.showForm = true;
  }

  add(): void {
    if (this.saving) return;
    const name = this.form.name.trim(), url = this.form.url.trim();
    if (!name || !url) { this.formError = 'Bitte Namen und Link angeben.'; return; }
    this.saving = true; this.formError = '';
    this.service.createExternalCalendar({ ...this.form, name, url }).pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.saving = false; this.cdr.markForCheck(); })).subscribe({
      next: calendar => {
        this.setCalendars([...this.calendars, calendar]);
        this.showForm = false;
        this.form = this.emptyForm();
      },
      error: error => {
        this.formError = error?.error?.error?.message || 'Der Kalender konnte nicht verbunden werden.';
      },
    });
  }

  update(calendar: ExternalCalendar, patch: Partial<ExternalCalendar>): void {
    this.run(calendar, this.service.updateExternalCalendar(calendar.id, patch), 'Speichern fehlgeschlagen.');
  }

  refresh(calendar: ExternalCalendar): void {
    this.run(calendar, this.service.syncExternalCalendar(calendar.id), 'Aktualisieren fehlgeschlagen.');
  }

  remove(calendar: ExternalCalendar): void {
    if (this.confirmRemove !== calendar.id) { this.confirmRemove = calendar.id; return; }
    this.confirmRemove = null;
    this.busy.add(calendar.id);
    this.service.deleteExternalCalendar(calendar.id).pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.busy.delete(calendar.id); this.cdr.markForCheck(); })).subscribe({
      next: () => this.setCalendars(this.calendars.filter(c => c.id !== calendar.id)),
      error: () => { this.rowError = { ...this.rowError, [calendar.id]: 'Entfernen fehlgeschlagen.' }; },
    });
  }

  copyFeed(input: HTMLInputElement): void {
    const done = () => { this.copied = true; this.cdr.markForCheck(); setTimeout(() => { this.copied = false; this.cdr.markForCheck(); }, 2500); };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(this.feedUrl).then(done, () => { input.select(); });
    } else {
      input.select();
    }
  }

  renewFeed(): void {
    if (!this.confirmRenew) { this.confirmRenew = true; return; }
    this.confirmRenew = false;
    this.service.getFeedLink(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: url => { this.feedUrl = url; this.feedError = ''; this.cdr.markForCheck(); },
      error: () => { this.feedError = 'Es konnte kein neuer Link erzeugt werden.'; this.cdr.markForCheck(); },
    });
  }

  private run(calendar: ExternalCalendar, request: Observable<ExternalCalendar>, message: string): void {
    if (this.busy.has(calendar.id)) return;
    this.busy.add(calendar.id);
    const { [calendar.id]: _, ...rest } = this.rowError;
    this.rowError = rest;
    request.pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.busy.delete(calendar.id); this.cdr.markForCheck(); })).subscribe({
      next: updated => this.setCalendars(this.calendars.map(c => c.id === updated.id ? updated : c)),
      error: error => { this.rowError = { ...this.rowError, [calendar.id]: error?.error?.error?.message || message }; },
    });
  }

  private setCalendars(calendars: ExternalCalendar[]): void {
    this.calendars = calendars;
    this.changed.emit(calendars);
  }

  private emptyForm(): LinkForm {
    const used = new Set(this.calendars?.map(c => c.color) ?? []);
    return { name: '', url: '', color: CALENDAR_COLORS.find(c => !used.has(c)) ?? CALENDAR_COLORS[0], visibility: 'private' };
  }
}
