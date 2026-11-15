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


class CalendarTestCase(TestCase):
    """A WG with Simon and Lisa; every iCal link returns the sample Outlook calendar."""

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


class LinkedCalendarTests(CalendarTestCase):
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


class TimetableAndSharingTests(CalendarTestCase):
    """Timetables as .ics files, calendars shared with chosen people, and shared calendars in the app."""

    def setUp(self):
        super().setUp()
        self.mia = self.member('mia@example.com', 'Mia')

    def test_timetable_file_becomes_a_calendar_and_can_be_replaced(self):
        response = self.client.post('/api/calendar/external/', {
            'name': 'Stundenplan', 'icsContent': self.ics, 'fileName': 'stundenplan.ics'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        data = response.data['data']
        self.assertEqual((data['source'], data['fileName'], data['eventCount'], data['url']),
                         ('file', 'stundenplan.ics', 3, ''))
        self.fetch.assert_not_called()
        calendar = ExternalCalendar.objects.get()
        self.assertTrue(calendar_sync.sync(calendar))  # files are expanded again on refresh
        broken = self.client.patch(f'/api/calendar/external/{calendar.id}/', {'icsContent': 'kaputt'}, format='json')
        self.assertEqual(broken.status_code, 400)
        newer = self.ics.replace('Team-Meeting', 'Mathematik')
        self.client.patch(f'/api/calendar/external/{calendar.id}/', {'icsContent': newer}, format='json')
        self.assertIn('Mathematik', [e['title'] for e in self.week(self.client)])

    def test_files_and_links_are_required_and_limited(self):
        response = self.client.post('/api/calendar/external/', {'name': 'Leer'}, format='json')
        self.assertEqual(response.status_code, 400)
        huge = 'X' * (calendar_sync.MAX_FILE_BYTES + 1)
        response = self.client.post('/api/calendar/external/', {'name': 'Gross', 'icsContent': huge}, format='json')
        self.assertIn('zu gross', response.data['error']['message'])

    def test_own_calendars_follow_the_account_into_every_wg(self):
        self.link(self.client, visibility='shared')
        calendar = ExternalCalendar.objects.get()
        other = Household.objects.create(name='Ferienhaus')
        HouseholdMembership.objects.create(user=self.simon, household=other, role='member')
        tom = User.objects.create_user('tom@example.com', 'pw', active_household=other, first_name='Tom')
        HouseholdMembership.objects.create(user=tom, household=other, role='member')
        self.simon.active_household = other
        self.simon.save()
        mine = self.client.get('/api/calendar/external/').data['data'][0]
        self.assertEqual((mine['sharedHere'], mine['householdName']), (False, 'Sonnenhof'))
        self.assertIn('Team-Meeting', [e['title'] for e in self.week(self.client)])
        # Still shared with the WG where it was linked, not with the other WG.
        self.assertEqual(self.week(self.login(tom)), [])
        self.assertIn('Team-Meeting', [e['title'] for e in self.week(self.login(self.lisa))])
        # Name and colour can change anywhere; who sees it only in its own WG.
        url = f'/api/calendar/external/{calendar.id}/'
        self.assertEqual(self.client.patch(url, {'color': '#22c55e'}, format='json').status_code, 200)
        refused = self.client.patch(url, {'visibility': 'private'}, format='json')
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(self.client.post(f'{url}sync/').status_code, 200)

    def test_sharing_with_chosen_people_only(self):
        self.link(self.client, visibility='shared', sharedWith=[str(self.lisa.id), str(self.simon.id)])
        calendar = ExternalCalendar.objects.get()
        self.assertEqual(list(calendar.shared_with.all()), [self.lisa])  # the owner is never in the list
        lisa, mia = self.login(self.lisa), self.login(self.mia)
        self.assertIn('Team-Meeting', [e['title'] for e in self.week(lisa)])
        self.assertEqual(self.week(mia), [])
        self.assertEqual(self.client.get('/api/calendar/external/').data['data'][0]['sharedWith'], [str(self.lisa.id)])
        self.assertNotIn('sharedWith', lisa.get('/api/calendar/external/').data['data'][0])
        outsider = User.objects.create_user('x@example.com', 'pw', active_household=Household.objects.create(name='X'))
        response = self.client.patch(f'/api/calendar/external/{calendar.id}/', {'sharedWith': [str(outsider.id)]},
                                     format='json')
        self.assertEqual(response.status_code, 400)
        self.client.patch(f'/api/calendar/external/{calendar.id}/', {'sharedWith': []}, format='json')
        self.assertIn('Team-Meeting', [e['title'] for e in self.week(mia)])  # empty list: whole WG

    def test_shared_calendar_in_the_app(self):
        created = self.client.post('/api/calendar/shared/', {
            'name': 'Paar', 'color': '#ec4899', 'memberIds': [str(self.lisa.id)]}, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        shared = created.data['data']
        self.assertEqual(sorted(shared['memberNames']), ['Lisa', 'Simon'])
        start = timezone.now().replace(microsecond=0)
        event = self.client.post('/api/calendar-events/', {
            'title': 'Jahrestag', 'start': start.isoformat(), 'calendarType': 'group',
            'sharedCalendarId': shared['id']}, format='json')
        self.assertEqual(event.status_code, 201, event.data)
        day = timezone.localdate()
        lisa, mia = self.login(self.lisa), self.login(self.mia)
        titles = lambda client: [e['title'] for e in client.get(  # noqa: E731
            f'/api/calendar-events/?start={day}&end={day}').data['data']]
        self.assertEqual((titles(lisa), titles(mia)), (['Jahrestag'], []))
        # Members may change the events; others cannot even see them.
        event_id = event.data['data']['id']
        self.assertEqual(lisa.patch(f'/api/calendar-events/{event_id}/', {'title': 'Jahrestag 🎉'},
                                    format='json').status_code, 200)
        self.assertEqual(mia.patch(f'/api/calendar-events/{event_id}/', {'title': 'x'}, format='json').status_code, 404)
        refused = mia.post('/api/calendar-events/', {'title': 'Rein', 'start': start.isoformat(),
                                                     'calendarType': 'group', 'sharedCalendarId': shared['id']},
                           format='json')
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(mia.get('/api/calendar/shared/').data['data'], [])
        # The feed of a member contains it, labelled with the calendar.
        path = lisa.get('/api/calendar/feed/').data['data']['path']
        feed = icalendar.Calendar.from_ical(APIClient().get(path).content)
        self.assertEqual([str(e['CATEGORIES'].cats[0]) for e in feed.walk('VEVENT')], ['Paar'])
        # Leaving it hides it; deleting removes its events.
        lisa.patch(f"/api/calendar/shared/{shared['id']}/", {'memberIds': [str(self.simon.id)]}, format='json')
        self.assertEqual(titles(lisa), [])
        self.assertEqual(self.client.delete(f"/api/calendar/shared/{shared['id']}/").status_code, 200)
        self.assertFalse(CalendarEvent.objects.exists())

    def test_people_lists_the_wg(self):
        people = self.client.get('/api/calendar/people/').data['data']
        self.assertEqual([(p['name'], p['isMe']) for p in people], [('Lisa', False), ('Mia', False), ('Simon', True)])
