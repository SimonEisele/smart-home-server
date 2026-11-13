import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CalendarLinks } from './calendar-links';
import { CalendarService } from '../service/calendar.service';
import { ExternalCalendar, SharedCalendar } from '../model/calendar.model';

describe('Kalender verbinden', () => {
  const created: ExternalCalendar = { id: 'n', name: 'Arbeit', color: '#6366f1', visibility: 'busy', enabled: true,
    ownerName: 'Simon', isOwner: true, eventCount: 12 };
  const service = {
    getExternalCalendars: vi.fn(() => of([] as ExternalCalendar[])),
    getFeedLink: vi.fn((renew?: boolean) => of(renew ? 'https://wg.example/api/calendar/feed/neu.ics'
      : 'https://wg.example/api/calendar/feed/abc.ics')),
    createExternalCalendar: vi.fn(),
    updateExternalCalendar: vi.fn(),
    deleteExternalCalendar: vi.fn(() => of(undefined)),
    getSharedCalendars: vi.fn(() => of([] as SharedCalendar[])),
    createSharedCalendar: vi.fn(),
    updateSharedCalendar: vi.fn(),
    getCalendarPeople: vi.fn(() => of([{ id: 'me', name: 'Simon', isMe: true }, { id: 'lisa', name: 'Lisa', isMe: false },
      { id: 'mia', name: 'Mia', isMe: false }])),
  };
  let links: CalendarLinks;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ imports: [CalendarLinks], providers: [{ provide: CalendarService, useValue: service }] });
    links = TestBed.createComponent(CalendarLinks).componentInstance;
    links.ngOnInit();
  });

  it('opens the form when nothing is linked yet and offers the feed as webcal link', () => {
    expect(links.showForm).toBe(true);
    expect(links.webcalUrl).toBe('webcal://wg.example/api/calendar/feed/abc.ics');
  });

  it('links a calendar and reports the server reason when the link is wrong', () => {
    const changed = vi.fn();
    links.changed.subscribe(changed);
    service.createExternalCalendar.mockReturnValueOnce(throwError(() => ({
      error: { error: { message: 'Der Link liefert keinen Kalender im iCal-Format.' } } })));
    links.form = { ...links.form, name: 'Arbeit', url: 'https://x.example/cal', visibility: 'busy' };
    links.add();
    expect(links.formError).toContain('iCal');
    service.createExternalCalendar.mockReturnValueOnce(of(created));
    links.add();
    expect(service.createExternalCalendar).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: 'busy' }));
    expect(links.mine).toEqual([created]);
    expect(links.showForm).toBe(false);
    expect(changed).toHaveBeenCalledWith([created]);
  });

  it('asks before removing a calendar and before replacing the feed link', () => {
    links.calendars = [created];
    links.remove(created);
    expect(service.deleteExternalCalendar).not.toHaveBeenCalled();
    links.remove(created);
    expect(links.calendars).toEqual([]);
    links.renewFeed();
    expect(service.getFeedLink).toHaveBeenCalledTimes(1);
    links.renewFeed();
    expect(links.feedUrl).toContain('neu.ics');
  });

  it('imports a timetable file and shares it with chosen people only', async () => {
    links.openForm('file');
    const file = new File(['BEGIN:VCALENDAR\nEND:VCALENDAR'], 'Stundenplan HS26.ics', { type: 'text/calendar' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    links.pickFile({ target: input } as unknown as Event);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(links.form.name).toBe('Stundenplan HS26');
    links.form = { ...links.form, visibility: 'shared', audience: 'people' };
    links.add();
    expect(links.formError).toContain('Person');
    links.form.sharedWith = links.togglePerson(links.form.sharedWith, 'lisa');
    service.createExternalCalendar.mockReturnValueOnce(of({ ...created, source: 'file', sharedWith: ['lisa'] }));
    links.add();
    expect(service.createExternalCalendar).toHaveBeenCalledWith(expect.objectContaining({
      icsContent: 'BEGIN:VCALENDAR\nEND:VCALENDAR', fileName: 'Stundenplan HS26.ics', sharedWith: ['lisa'],
    }));
    expect(service.createExternalCalendar.mock.calls.at(-1)![0]).not.toHaveProperty('url');
  });

  it('never turns a "chosen people" calendar into a whole-WG one by unticking the last person', () => {
    const calendar = { ...created, visibility: 'shared' as const, sharedWith: ['lisa'] };
    links.calendars = [calendar];
    links.toggleShare(calendar, 'lisa');
    expect(service.updateExternalCalendar).not.toHaveBeenCalled();
    expect(links.rowError['n']).toContain('Ganze WG');
  });

  it('creates a shared calendar with the chosen people', () => {
    const sharedChanged = vi.fn();
    links.sharedChanged.subscribe(sharedChanged);
    links.newShared();
    links.sharedForm!.name = 'Paar';
    links.sharedForm!.memberIds = ['lisa'];
    const paar: SharedCalendar = { id: 'p', name: 'Paar', color: '#6366f1', memberIds: ['me', 'lisa'],
      memberNames: ['Simon', 'Lisa'] };
    service.createSharedCalendar.mockReturnValueOnce(of(paar));
    links.saveShared();
    expect(service.createSharedCalendar).toHaveBeenCalledWith(expect.objectContaining({ name: 'Paar', memberIds: ['lisa'] }));
    expect(sharedChanged).toHaveBeenCalledWith([paar]);
    // Editing keeps oneself in the list.
    links.editShared(paar);
    expect(links.sharedForm!.memberIds).toEqual(['lisa']);
    service.updateSharedCalendar.mockReturnValueOnce(of(paar));
    links.saveShared();
    expect(service.updateSharedCalendar).toHaveBeenCalledWith('p', expect.objectContaining({ memberIds: ['lisa', 'me'] }));
  });
});
