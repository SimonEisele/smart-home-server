"""List endpoints must not run one query per row (N+1)."""
from datetime import date, timedelta

from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from users.models import Household, HouseholdMembership, User
from .models import CleaningLog, CleaningTask, Menu, Recipe, Todo


class QueryCountTests(APITestCase):
    def setUp(self):
        self.hh = Household.objects.create(name='WG')
        self.user = User.objects.create_user('q@example.com', 'testpassword', active_household=self.hh)
        HouseholdMembership.objects.create(user=self.user, household=self.hh, role='owner')
        self.client.force_authenticate(self.user)
        self.day = date(2026, 11, 2)
        self.created = 0

    def _add_rows(self, count):
        for _ in range(count):
            i = self.created
            self.created += 1
            recipes = []
            for meal in ('b', 'l', 'd'):
                recipe = Recipe.objects.create(household=self.hh, name=f'{meal}{i}')
                recipe.ingredients = [{'name': f'Zutat {meal}{i}', 'quantityPerPerson': 100, 'unit': 'g'}]
                recipe.save()
                recipes.append(recipe)
            Menu.objects.create(household=self.hh, date=self.day + timedelta(days=i),
                                breakfast_recipe=recipes[0], lunch_recipe=recipes[1], dinner_recipe=recipes[2])
            Todo.objects.create(household=self.hh, created_by=self.user, title=f'T{i}',
                                global_todo=True, done=True, done_by=self.user)
            task = CleaningTask.objects.create(household=self.hh, name=f'C{i}', interval_days=7)
            CleaningLog.objects.create(task=task, done_at=self.day, done_by=self.user)

    def _queries(self, url):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        return len(ctx.captured_queries)

    def test_query_count_does_not_grow_with_rows(self):
        urls = [f'/api/menus/?weekStart={self.day}&days=14', '/api/todos/', '/api/cleaning-tasks/']
        self._add_rows(2)
        few = {url: self._queries(url) for url in urls}
        self._add_rows(5)
        many = {url: self._queries(url) for url in urls}
        self.assertEqual(few, many)

    def test_household_list_counts_members_in_one_query(self):
        for n in range(3):
            other = User.objects.create_user(f'o{n}@example.com', 'testpassword')
            HouseholdMembership.objects.create(user=other, household=self.hh)
        second = Household.objects.create(name='Zweite WG')
        HouseholdMembership.objects.create(user=self.user, household=second, role='member')

        response = self.client.get('/api/users/households/')
        counts = {h['name']: (h['member_count'], h['role']) for h in response.data['data']}
        self.assertEqual(counts, {'WG': (4, 'owner'), 'Zweite WG': (1, 'member')})
        me = self.client.get('/api/users/').data['data']
        self.assertEqual({h['name']: h['member_count'] for h in me['households']}, {'WG': 4, 'Zweite WG': 1})
