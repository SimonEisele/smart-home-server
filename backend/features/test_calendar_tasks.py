"""Ticking off tasks from the calendar, planned blocks on tasks, private event scoping."""
from datetime import date, datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from users.models import Household, HouseholdMembership, User

from .models import CalendarEvent, Todo
from .views.todos import next_occurrence


def local(year, month, day, hour=9):
    return timezone.make_aware(datetime(year, month, day, hour), timezone.get_current_timezone())


class NextOccurrenceTests(TestCase):
    def todo(self, recurrence, start, interval=1):
        return Todo(recurrence=recurrence, recurrence_interval=interval, start_date=start)

    def test_daily_weekly_and_monthly_steps(self):
        self.assertEqual(next_occurrence(self.todo('daily', local(2026, 11, 9), 2), date(2026, 11, 9)),
                         date(2026, 11, 11))
        self.assertEqual(next_occurrence(self.todo('weekly', local(2026, 11, 2)), date(2026, 11, 10)),
                         date(2026, 11, 16))
        self.assertEqual(next_occurrence(self.todo('monthly', local(2026, 1, 31)), date(2026, 1, 31)),
                         date(2026, 2, 28))
        self.assertEqual(next_occurrence(self.todo('monthly', local(2026, 1, 31), 3), date(2026, 2, 5)),
                         date(2026, 4, 30))


class CalendarTaskApiTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='WG')
        self.user = User.objects.create_user('cal@example.com', 'password', active_household=self.household)
        HouseholdMembership.objects.create(user=self.user, household=self.household)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_one_off_task_is_marked_done(self):
        todo = Todo.objects.create(household=self.household, title='Velo', created_by=self.user)
        response = self.client.post(f'/api/todos/{todo.id}/complete/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['data']['done'])
        self.assertIsNone(response.data['advancedTo'])
        self.assertFalse(response.data['previous']['done'])
        todo.refresh_from_db()
        self.assertEqual(todo.done_by, self.user)

    def test_recurring_task_moves_to_next_occurrence_and_keeps_time(self):
        todo = Todo.objects.create(household=self.household, title='Altpapier', created_by=self.user, global_todo=True,
                                   recurrence='weekly', start_date=local(2026, 11, 9, 7),
                                   due_date=local(2026, 11, 9, 8))
        response = self.client.post(f'/api/todos/{todo.id}/complete/', {'date': '2026-11-09'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['advancedTo'], date(2026, 11, 16))
        self.assertFalse(response.data['data']['done'])
        todo.refresh_from_db()
        self.assertEqual(timezone.localtime(todo.start_date), local(2026, 11, 16, 7))
        self.assertEqual(timezone.localtime(todo.due_date), local(2026, 11, 16, 8))

    def test_complete_rejects_bad_dates_and_foreign_tasks(self):
        todo = Todo.objects.create(household=self.household, title='Velo', created_by=self.user)
        self.assertEqual(self.client.post(f'/api/todos/{todo.id}/complete/', {'date': 'morgen'}, format='json')
                         .status_code, 400)
        other = User.objects.create_user('other@example.com', 'password', active_household=self.household)
        private = Todo.objects.create(household=self.household, title='Geheim', created_by=other)
        self.assertEqual(self.client.post(f'/api/todos/{private.id}/complete/', {}, format='json').status_code, 404)

    def test_tasks_list_their_planned_blocks(self):
        todo = Todo.objects.create(household=self.household, title='Keller', created_by=self.user, global_todo=True)
        CalendarEvent.objects.create(household=self.household, created_by=self.user, title='Keller',
                                     start=local(2026, 11, 13, 14), end=local(2026, 11, 13, 15), todo_ref_id=todo.id)
        listed = self.client.get('/api/todos/').data['data'][0]
        self.assertEqual(len(listed['plannedSlots']), 1)
        self.assertTrue(listed['plannedSlots'][0]['start'].startswith('2026-11-13'))
        detail = self.client.get(f'/api/todos/{todo.id}/').data['data']
        self.assertEqual(detail['plannedSlots'], listed['plannedSlots'])

    def test_private_events_of_another_household_are_hidden(self):
        other = Household.objects.create(name='Alt')
        CalendarEvent.objects.create(household=other, created_by=self.user, title='Alter Termin',
                                     start=local(2026, 11, 10), calendar_type='private')
        CalendarEvent.objects.create(household=self.household, created_by=self.user, title='Mein Termin',
                                     start=local(2026, 11, 10), calendar_type='private')
        titles = [e['title'] for e in self.client.get('/api/calendar-events/').data['data']]
        self.assertEqual(titles, ['Mein Termin'])
