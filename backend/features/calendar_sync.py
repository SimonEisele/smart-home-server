"""Subscribed calendars: load an iCal link, expand recurring events, store the occurrences.

Outlook, Google and iCloud all publish a calendar as an iCal (.ics) link. The
app only reads it; changes are made in the original calendar and show up here
after the next refresh (every 15 minutes while someone looks at the calendar,
or right away with "Aktualisieren").
"""
import logging
import threading
from datetime import date, datetime, time, timedelta

import icalendar
import recurring_ical_events
from django.db import connection, transaction
from django.utils import timezone

from assistant.web import FetchError, fetch

from .models import ExternalCalendar, ExternalEvent

logger = logging.getLogger(__name__)

WINDOW_PAST = timedelta(days=62)
WINDOW_FUTURE = timedelta(days=400)
STALE_AFTER = timedelta(minutes=15)
MAX_BYTES = 15_000_000
MAX_FILE_BYTES = 5_000_000
MAX_EVENTS = 5000


class CalendarError(Exception):
    """Shown to the person who linked the calendar."""


def normalize_url(url):
    url = (url or '').strip()
    if url.lower().startswith('webcal://'):
        url = 'https://' + url[len('webcal://'):]
    return url


def _aware(value):
    if isinstance(value, datetime):
        return timezone.make_aware(value) if timezone.is_naive(value) else value
    return timezone.make_aware(datetime.combine(value, time.min))


def _text(component, key, limit):
    value = component.get(key)
    return str(value).strip()[:limit] if value is not None else ''


def parse_ics(text, window_start, window_end):
    """Returns the occurrences between the two dates as plain dicts."""
    try:
        calendar = icalendar.Calendar.from_ical(text)
    except ValueError as error:
        raise CalendarError('Der Link liefert keinen Kalender im iCal-Format.') from error
    if calendar.name != 'VCALENDAR':
        raise CalendarError('Der Link liefert keinen Kalender im iCal-Format.')
    try:
        occurrences = recurring_ical_events.of(calendar).between(window_start, window_end)
    except Exception as error:  # broken recurrence rules in the source calendar
        logger.warning('Could not expand calendar: %s', error)
        raise CalendarError('Der Kalender enthält Wiederholungen, die nicht gelesen werden können.') from error
    events = []
    for component in occurrences:
        if component.name != 'VEVENT' or str(component.get('STATUS', '')).upper() == 'CANCELLED':
            continue
        start = component.decoded('DTSTART')
        all_day = isinstance(start, date) and not isinstance(start, datetime)
        if 'DTEND' in component:
            end = component.decoded('DTEND')
        elif 'DURATION' in component:
            end = start + component.decoded('DURATION')
        else:
            end = start + timedelta(days=1) if all_day else None
        free = str(component.get('TRANSP', '')).upper() == 'TRANSPARENT' or \
            str(component.get('X-MICROSOFT-CDO-BUSYSTATUS', '')).upper() == 'FREE'
        events.append({
            'uid': _text(component, 'UID', 255),
            'title': _text(component, 'SUMMARY', 300),
            'location': _text(component, 'LOCATION', 300),
            'description': _text(component, 'DESCRIPTION', 4000),
            'start': _aware(start),
            'end': _aware(end) if end is not None else None,
            'all_day': all_day,
            'busy': not free,
        })
        if len(events) > MAX_EVENTS:
            raise CalendarError(f'Der Kalender hat zu viele Termine (mehr als {MAX_EVENTS} im Jahr).')
    return events


def load(url):
    """Fetches and parses a calendar link; raises CalendarError with a readable message."""
    url = normalize_url(url)
    try:
        text = fetch(url, max_bytes=MAX_BYTES, accept='text/calendar,*/*;q=0.5')
    except FetchError as error:
        raise CalendarError(str(error).replace('Seite', 'Kalender-Adresse')) from error
    now = timezone.now()
    return parse_ics(text, now - WINDOW_PAST, now + WINDOW_FUTURE)


def read_file(text):
    """Checks an uploaded .ics file (e.g. a timetable) and returns its occurrences."""
    if len(text.encode('utf-8')) > MAX_FILE_BYTES:
        raise CalendarError('Die Datei ist zu gross (höchstens 5 MB).')
    now = timezone.now()
    return parse_ics(text, now - WINDOW_PAST, now + WINDOW_FUTURE)


def sync(calendar):
    """Refreshes one calendar. Errors are stored on it instead of being raised.

    Uploaded files are read again too, so recurring lessons keep reaching into the future.
    """
    now = timezone.now()
    try:
        events = read_file(calendar.ics_data) if calendar.source == 'file' else load(calendar.url)
    except CalendarError as error:
        ExternalCalendar.objects.filter(pk=calendar.pk).update(last_attempt_at=now, last_error=str(error)[:300])
        calendar.last_attempt_at, calendar.last_error = now, str(error)[:300]
        return False
    with transaction.atomic():
        ExternalEvent.objects.filter(calendar=calendar).delete()
        ExternalEvent.objects.bulk_create([ExternalEvent(calendar=calendar, **event) for event in events])
        ExternalCalendar.objects.filter(pk=calendar.pk).update(
            last_attempt_at=now, last_synced_at=now, last_error='', event_count=len(events))
    calendar.last_attempt_at = calendar.last_synced_at = now
    calendar.last_error, calendar.event_count = '', len(events)
    return True


def stale(calendars):
    limit = timezone.now() - STALE_AFTER
    return [c for c in calendars if c.enabled and (c.last_attempt_at is None or c.last_attempt_at < limit)]


_running = set()
_running_lock = threading.Lock()


def refresh_in_background(calendars):
    """Starts one background refresh for calendars that are not being refreshed already."""
    with _running_lock:
        todo = [c for c in calendars if c.pk not in _running]
        _running.update(c.pk for c in todo)
    if not todo:
        return False

    def work():
        try:
            for calendar in todo:
                try:
                    sync(calendar)
                except Exception:  # never let one calendar break the thread
                    logger.exception('Calendar refresh failed for %s', calendar.pk)
        finally:
            with _running_lock:
                _running.difference_update(c.pk for c in todo)
            connection.close()

    threading.Thread(target=work, name='calendar-refresh', daemon=True).start()
    return True
