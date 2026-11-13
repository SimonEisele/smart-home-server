"""Linked calendars: iCal subscriptions with per-calendar visibility, and the WG calendar as a feed."""
from datetime import datetime
from unittest import mock

import icalendar
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Household, HouseholdMembership, User

from . import calendar_sync
from .models import CalendarEvent, CalendarFeedToken, ExternalCalendar, ExternalEvent

OUTLOOK = """BEGIN:VCALENDAR
PRODID:Microsoft Exchange Server 2010
VERSION:2.0
BEGIN:VTIMEZONE
TZID:W. Europe Standard Time
BEGIN:STANDARD
DTSTART:16010101T030000
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=10
END:STANDARD
BEGIN:DAYLIGHT
DTSTART:16010101T020000
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
RRULE:FREQ=YEARLY;INTERVAL=1;BYDAY=-1SU;BYMONTH=3
END:DAYLIGHT
END:VTIMEZONE
BEGIN:VEVENT
UID:weekly
SUMMARY:Team-Meeting
LOCATION:Büro
DTSTART;TZID=W. Europe Standard Time:{monday}T090000
DTEND;TZID=W. Europe Standard Time:{monday}T100000
RRULE:FREQ=WEEKLY;COUNT=3
EXDATE;TZID=W. Europe Standard Time:{next_monday}T090000
END:VEVENT
BEGIN:VEVENT
UID:free
SUMMARY:Ferienidee
DTSTART;VALUE=DATE:{monday}
DTEND;VALUE=DATE:{wednesday}
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
UID:cancelled
SUMMARY:Abgesagt
STATUS:CANCELLED
DTSTART;TZID=W. Europe Standard Time:{monday}T120000
DTEND;TZID=W. Europe Standard Time:{monday}T130000
END:VEVENT
END:VCALENDAR
"""


def ics_for(day):
    from datetime import timedelta
    fmt = '%Y%m%d'
    return OUTLOOK.format(monday=day.strftime(fmt), next_monday=(day + timedelta(days=7)).strftime(fmt),
                          wednesday=(day + timedelta(days=2)).strftime(fmt))


class LinkedCalendarTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Sonnenhof')
        self.simon = self.member('simon@example.com', 'Simon')
        self.lisa = self.member('lisa@example.com', 'Lisa')
        self.client = self.login(self.simon)
        today = timezone.localdate()
        self.monday = today - timezone.timedelta(days=today.weekday())
        self.ics = ics_for(self.monday)
        patcher = mock.patch.object(calendar_sync, 'fetch', side_effect=lambda *a, **k: self.ics)
        self.fetch = patcher.start()
        self.addCleanup(patcher.stop)
        background = mock.patch.object(calendar_sync, 'refresh_in_background', return_value=False)
        self.background = background.start()
        self.addCleanup(background.stop)

    def member(self, email, name):
        user = User.objects.create_user(email, 'pw', active_household=self.household, first_name=name)
        HouseholdMembership.objects.create(user=user, household=self.household, role='member')
        return user

    def login(self, user):
        client = APIClient()
        client.force_authenticate(user)
        return client

    def link(self, client, **extra):
        return client.post('/api/calendar/external/', {
            'name': 'Arbeit', 'url': 'webcal://outlook.office365.com/owa/calendar/abc/calendar.ics', **extra},
            format='json')

    def week(self, client):
        end = self.monday + timezone.timedelta(days=13)
        return client.get(f'/api/calendar/external-events/?start={self.monday}&end={end}').data['data']

    def test_linking_checks_the_link_and_expands_recurring_events(self):
        response = self.link(self.client, color='#0ea5e9')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.fetch.call_args.args[0], 'https://outlook.office365.com/owa/calendar/abc/calendar.ics')
        data = response.data['data']
        self.assertEqual((data['eventCount'], data['lastError'], data['isOwner']), (3, '', True))
        events = self.week(self.client)
        meetings = [e for e in events if e['title'] == 'Team-Meeting']
        self.assertEqual(len(meetings), 1)  # second week excluded, third one outside the range
        self.assertIn('T09:00:00', meetings[0]['start'])
        holiday = next(e for e in events if e['title'] == 'Ferienidee')
        self.assertEqual((holiday['allDay'], holiday['busy']), (True, False))
        self.assertNotIn('Abgesagt', [e['title'] for e in events])

    def test_wrong_links_are_refused_with_a_reason(self):
        self.ics = '<html>Login</html>'
        response = self.link(self.client)
        self.assertEqual(response.status_code, 400)
        self.assertIn('iCal', response.data['error']['message'])
        self.assertFalse(ExternalCalendar.objects.exists())
        response = self.link(self.client, url='ftp://example.com/x.ics')
        self.assertEqual(response.status_code, 400)

    def test_visibility_private_busy_and_shared(self):
        self.link(self.client)
        calendar = ExternalCalendar.objects.get()
        lisa = self.login(self.lisa)
        self.assertEqual(lisa.get('/api/calendar/external/').data['data'], [])
        self.assertEqual(self.week(lisa), [])

        self.client.patch(f'/api/calendar/external/{calendar.id}/', {'visibility': 'busy'}, format='json')
        shown = lisa.get('/api/calendar/external/').data['data'][0]
        self.assertEqual((shown['ownerName'], shown['isOwner']), ('Simon', False))
        self.assertNotIn('url', shown)  # the link stays secret
        busy = self.week(lisa)
        self.assertEqual([(e['title'], e['location'], e['busyOnly']) for e in busy], [('Belegt', '', True)])

        self.client.patch(f'/api/calendar/external/{calendar.id}/', {'visibility': 'shared'}, format='json')
        self.assertIn('Team-Meeting', [e['title'] for e in self.week(lisa)])
        # Only the owner may change or delete it.
        self.assertEqual(lisa.delete(f'/api/calendar/external/{calendar.id}/').status_code, 404)
        self.assertEqual(lisa.post(f'/api/calendar/external/{calendar.id}/sync/').status_code, 404)

    def test_refresh_keeps_the_old_events_when_the_source_fails(self):
        self.link(self.client)
        calendar = ExternalCalendar.objects.get()
        self.fetch.side_effect = calendar_sync.FetchError('Die Seite antwortet mit Fehler 404.')
        data = self.client.post(f'/api/calendar/external/{calendar.id}/sync/').data['data']
        self.assertIn('404', data['lastError'])
        self.assertEqual(ExternalEvent.objects.count(), 3)

    def test_stale_calendars_are_refreshed_in_the_background(self):
        self.link(self.client)
        ExternalCalendar.objects.update(last_attempt_at=timezone.now() - timezone.timedelta(hours=1))
        self.week(self.client)
        self.assertEqual([c.name for c in self.background.call_args.args[0]], ['Arbeit'])

    def test_feed_contains_wg_and_own_private_events_only(self):
        start = timezone.make_aware(datetime.combine(self.monday, datetime.min.time())) + timezone.timedelta(hours=19)
        CalendarEvent.objects.create(household=self.household, title='WG-Sitzung', start=start,
                                     end=start + timezone.timedelta(hours=1))
        CalendarEvent.objects.create(household=self.household, title='Zahnarzt', start=start,
                                     calendar_type='private', created_by=self.simon)
        CalendarEvent.objects.create(household=self.household, title='Lisas Geheimnis', start=start,
                                     calendar_type='private', created_by=self.lisa)
        CalendarEvent.objects.create(household=self.household, title='Ausflug', start=start, all_day=True)
        path = self.client.get('/api/calendar/feed/').data['data']['path']
        response = APIClient().get(path)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response['Content-Type'].startswith('text/calendar'))
        feed = icalendar.Calendar.from_ical(response.content)
        events = {str(e['SUMMARY']): e for e in feed.walk('VEVENT')}
        self.assertEqual(set(events), {'WG-Sitzung', 'Zahnarzt', 'Ausflug'})
        self.assertEqual(str(events['Zahnarzt']['CLASS']), 'PRIVATE')
        trip = events['Ausflug']
        self.assertEqual((trip.decoded('DTEND') - trip.decoded('DTSTART')).days, 1)

    def test_new_feed_link_replaces_the_old_one_and_leaving_the_wg_closes_it(self):
        old = self.client.get('/api/calendar/feed/').data['data']['path']
        new = self.client.post('/api/calendar/feed/').data['data']['path']
        self.assertNotEqual(old, new)
        self.assertEqual(APIClient().get(old).status_code, 404)
        HouseholdMembership.objects.filter(user=self.simon).delete()
        self.assertEqual(APIClient().get(new).status_code, 404)
        self.assertEqual(CalendarFeedToken.objects.count(), 1)
