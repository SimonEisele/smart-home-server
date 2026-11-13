import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { CalendarLinks } from './calendar-links';
import { CalendarService } from '../service/calendar.service';
import { ExternalCalendar } from '../model/calendar.model';

describe('Kalender verbinden', () => {
  const created: ExternalCalendar = { id: 'n', name: 'Arbeit', color: '#6366f1', visibility: 'busy', enabled: true,
    ownerName: 'Simon', isOwner: true, eventCount: 12 };
  const service = {
    getExternalCalendars: vi.fn(() => of([] as ExternalCalendar[])),
    getFeedLink: vi.fn((renew?: boolean) => of(renew ? 'https://wg.example/api/calendar/feed/neu.ics'
      : 'https://wg.example/api/calendar/feed/abc.ics')),
    createExternalCalendar: vi.fn(),
    deleteExternalCalendar: vi.fn(() => of(undefined)),
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
    links.form = { name: 'Arbeit', url: 'https://x.example/cal', color: '#6366f1', visibility: 'busy' };
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
});
