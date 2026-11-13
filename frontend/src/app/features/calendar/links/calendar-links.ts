import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, finalize } from 'rxjs';
import { DialogDirective } from '../../../shared/directives/dialog.directive';
import {
  CalendarPerson, ExternalCalendar, ExternalCalendarVisibility, SharedCalendar, VISIBILITY_LABELS,
} from '../model/calendar.model';
import { CalendarService } from '../service/calendar.service';

export const CALENDAR_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#64748b'];
const MAX_FILE_BYTES = 5_000_000;

/** FileReader works in every browser (File.text() is missing in older Safari). */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export type CalendarLinksTab = 'shared' | 'linked' | 'feed';

interface LinkForm {
  mode: 'url' | 'file';
  name: string;
  url: string;
  icsContent: string;
  fileName: string;
  color: string;
  visibility: ExternalCalendarVisibility;
  audience: 'wg' | 'people';
  sharedWith: string[];
}

interface SharedForm { id?: string; name: string; color: string; memberIds: string[]; }

/**
 * Everything about calendars beyond the WG calendar: shared calendars for some members,
 * Outlook/Google/iCloud calendars and timetables (.ics files) shown here, and the link
 * to show the WG calendar elsewhere.
 */
@Component({
  selector: 'app-calendar-links',
  standalone: true,
  imports: [DialogDirective, DatePipe, FormsModule],
  templateUrl: './calendar-links.html',
  styleUrl: './calendar-links.css',
})
export class CalendarLinks implements OnInit {
  @Input() tab: CalendarLinksTab = 'linked';
  @Output() closed = new EventEmitter<void>();
  /** Linked calendars were added, changed or removed: the page reloads their appointments. */
  @Output() changed = new EventEmitter<ExternalCalendar[]>();
  /** Shared calendars changed: the page updates its calendar choice and colours. */
  @Output() sharedChanged = new EventEmitter<SharedCalendar[]>();
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
  shared: SharedCalendar[] = [];
  people: CalendarPerson[] = [];
  loading = true;
  loadError = '';

  // Linked calendars and timetables
  showForm = false;
  form: LinkForm = this.emptyForm();
  saving = false;
  formError = '';
  busy = new Set<string>();
  confirmRemove: string | null = null;
  rowError: Record<string, string> = {};
  /** Rows switched to "Bestimmte Personen" before anyone was picked. */
  peopleMode = new Set<string>();

  // Shared calendars
  sharedForm: SharedForm | null = null;
  sharedSaving = false;
  sharedError = '';
  confirmDeleteShared: string | null = null;

  // Subscription link
  feedUrl = '';
  feedError = '';
  copied = false;
  confirmRenew = false;

  get mine(): ExternalCalendar[] { return this.calendars.filter(c => c.isOwner); }
  get others(): ExternalCalendar[] { return this.calendars.filter(c => !c.isOwner); }
  get otherPeople(): CalendarPerson[] { return this.people.filter(p => !p.isMe); }
  get webcalUrl(): string { return this.feedUrl.replace(/^https?:\/\//, 'webcal://'); }

  ngOnInit(): void {
    this.service.getExternalCalendars().pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.loading = false; this.cdr.markForCheck(); })).subscribe({
      next: calendars => {
        this.calendars = calendars;
        this.showForm = !calendars.some(c => c.isOwner);
      },
      error: () => { this.loadError = 'Die Kalender konnten nicht geladen werden.'; },
    });
    this.service.getSharedCalendars().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: shared => { this.shared = shared; this.cdr.markForCheck(); },
      error: () => { this.loadError = 'Die Kalender konnten nicht geladen werden.'; },
    });
    this.service.getCalendarPeople().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: people => { this.people = people; this.cdr.markForCheck(); },
      error: () => { /* sharing with single people is then not offered */ },
    });
    this.service.getFeedLink().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: url => { this.feedUrl = url; this.cdr.markForCheck(); },
      error: () => { this.feedError = 'Der Abo-Link konnte nicht geladen werden.'; this.cdr.markForCheck(); },
    });
  }

  close(): void { if (!this.saving && !this.sharedSaving) this.closed.emit(); }

  personName(id: string): string { return this.people.find(p => p.id === id)?.name ?? '?'; }

  // ── Linked calendars and timetables ───────────────────────────────────────
  openForm(mode: 'url' | 'file' = 'url'): void {
    this.form = { ...this.emptyForm(), mode };
    this.formError = '';
    this.showForm = true;
  }

  /** Reads a chosen .ics file in the browser; the server checks it on saving. */
  pickFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.formError = '';
    if (file.size > MAX_FILE_BYTES) { this.formError = 'Die Datei ist zu gross (höchstens 5 MB).'; return; }
    readText(file).then(text => {
      if (!/BEGIN:VCALENDAR/i.test(text)) {
        this.formError = 'Das ist keine Kalenderdatei (.ics).';
      } else {
        this.form = { ...this.form, icsContent: text, fileName: file.name,
          name: this.form.name || file.name.replace(/\.ics$/i, '') };
      }
      this.cdr.markForCheck();
    }, () => { this.formError = 'Die Datei konnte nicht gelesen werden.'; this.cdr.markForCheck(); });
  }

  togglePerson(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter(p => p !== id) : [...list, id];
  }

  add(): void {
    if (this.saving) return;
    const f = this.form, name = f.name.trim();
    if (!name) { this.formError = 'Bitte einen Namen angeben.'; return; }
    if (f.mode === 'url' && !f.url.trim()) { this.formError = 'Bitte den iCal-Link einfügen.'; return; }
    if (f.mode === 'file' && !f.icsContent) { this.formError = 'Bitte eine .ics-Datei wählen.'; return; }
    if (f.visibility !== 'private' && f.audience === 'people' && !f.sharedWith.length) {
      this.formError = 'Bitte mindestens eine Person wählen.'; return;
    }
    const payload: Partial<ExternalCalendar> = {
      name, color: f.color, visibility: f.visibility,
      sharedWith: f.visibility !== 'private' && f.audience === 'people' ? f.sharedWith : [],
      ...(f.mode === 'url' ? { url: f.url.trim() } : { icsContent: f.icsContent, fileName: f.fileName }),
    };
    this.saving = true; this.formError = '';
    this.service.createExternalCalendar(payload).pipe(takeUntilDestroyed(this.destroyRef),
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

  audienceOf(calendar: ExternalCalendar): 'wg' | 'people' {
    return calendar.sharedWith?.length || this.peopleMode.has(calendar.id) ? 'people' : 'wg';
  }

  setAudience(calendar: ExternalCalendar, audience: 'wg' | 'people'): void {
    if (audience === 'people') { this.peopleMode.add(calendar.id); return; }
    this.peopleMode.delete(calendar.id);
    if (calendar.sharedWith?.length) this.update(calendar, { sharedWith: [] });
  }

  toggleShare(calendar: ExternalCalendar, personId: string): void {
    const next = this.togglePerson(calendar.sharedWith ?? [], personId);
    if (!next.length) {
      // An empty list would mean the whole WG; that needs the explicit choice.
      this.rowError = { ...this.rowError, [calendar.id]: 'Mindestens eine Person – oder «Ganze WG» wählen.' };
      return;
    }
    this.update(calendar, { sharedWith: next });
  }

  /** A new version of an imported timetable replaces the old one. */
  replaceFile(calendar: ExternalCalendar, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { this.rowError = { ...this.rowError, [calendar.id]: 'Die Datei ist zu gross.' }; return; }
    readText(file).then(text => this.update(calendar, { icsContent: text, fileName: file.name }),
      () => { this.rowError = { ...this.rowError, [calendar.id]: 'Die Datei konnte nicht gelesen werden.' }; });
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

  // ── Shared calendars ──────────────────────────────────────────────────────
  newShared(): void {
    this.sharedForm = { name: '', color: this.freeColor(CALENDAR_COLORS[4]), memberIds: [] };
    this.sharedError = '';
  }

  editShared(calendar: SharedCalendar): void {
    this.sharedForm = { id: calendar.id, name: calendar.name, color: calendar.color,
      memberIds: calendar.memberIds.filter(id => !this.people.find(p => p.id === id)?.isMe) };
    this.sharedError = '';
  }

  saveShared(): void {
    const form = this.sharedForm;
    if (!form || this.sharedSaving) return;
    const name = form.name.trim();
    if (!name) { this.sharedError = 'Bitte einen Namen angeben.'; return; }
    const me = this.people.find(p => p.isMe)?.id;
    const memberIds = form.id && me ? [...form.memberIds, me] : form.memberIds;
    const request = form.id
      ? this.service.updateSharedCalendar(form.id, { name, color: form.color, memberIds })
      : this.service.createSharedCalendar({ name, color: form.color, memberIds });
    this.sharedSaving = true; this.sharedError = '';
    request.pipe(takeUntilDestroyed(this.destroyRef),
      finalize(() => { this.sharedSaving = false; this.cdr.markForCheck(); })).subscribe({
      next: calendar => {
        this.setShared(form.id ? this.shared.map(c => c.id === calendar.id ? calendar : c) : [...this.shared, calendar]);
        this.sharedForm = null;
      },
      error: error => { this.sharedError = error?.error?.error?.message || 'Speichern fehlgeschlagen.'; },
    });
  }

  /** Leaving takes the person out; the calendar stays for the others. */
  leaveShared(calendar: SharedCalendar): void {
    const me = this.people.find(p => p.isMe)?.id;
    const rest = calendar.memberIds.filter(id => id !== me);
    if (!rest.length) { this.deleteShared(calendar); return; }
    this.service.updateSharedCalendar(calendar.id, { memberIds: rest }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.setShared(this.shared.filter(c => c.id !== calendar.id)),
        error: () => { this.sharedError = 'Austreten fehlgeschlagen.'; this.cdr.markForCheck(); },
      });
  }

  deleteShared(calendar: SharedCalendar): void {
    if (this.confirmDeleteShared !== calendar.id) { this.confirmDeleteShared = calendar.id; return; }
    this.confirmDeleteShared = null;
    this.service.deleteSharedCalendar(calendar.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.setShared(this.shared.filter(c => c.id !== calendar.id)),
      error: () => { this.sharedError = 'Löschen fehlgeschlagen.'; this.cdr.markForCheck(); },
    });
  }

  // ── Subscription link ─────────────────────────────────────────────────────
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
      next: updated => {
        if (updated.sharedWith?.length) this.peopleMode.delete(updated.id);
        this.setCalendars(this.calendars.map(c => c.id === updated.id ? updated : c));
      },
      error: error => { this.rowError = { ...this.rowError, [calendar.id]: error?.error?.error?.message || message }; },
    });
  }

  private setCalendars(calendars: ExternalCalendar[]): void {
    this.calendars = calendars;
    this.changed.emit(calendars);
  }

  private setShared(shared: SharedCalendar[]): void {
    this.shared = shared;
    this.sharedChanged.emit(shared);
  }

  /** A colour no other calendar uses yet, so the week stays readable. */
  private freeColor(fallback: string): string {
    const used = new Set([...(this.calendars ?? []), ...(this.shared ?? [])].map(c => c.color));
    return CALENDAR_COLORS.find(c => !used.has(c)) ?? fallback;
  }

  private emptyForm(): LinkForm {
    return {
      mode: 'url', name: '', url: '', icsContent: '', fileName: '',
      color: this.freeColor(CALENDAR_COLORS[0]),
      visibility: 'private', audience: 'wg', sharedWith: [],
    };
  }
}
