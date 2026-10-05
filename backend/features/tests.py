from datetime import date, timedelta
from django.utils import timezone
from django.test import TestCase
from rest_framework.test import APIClient
from users.models import Household, User
from .models import CalendarEvent, HouseholdMember, MemberAvailability, Menu, Recipe, ShoppingItem, Todo, UserMealAttendance
from .views import recalculate_menu_persons_for_range


class FeatureRegressionTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Test household')
        self.other_household = Household.objects.create(name='Other household')
        self.owner = User.objects.create_user('owner@example.com', 'testpassword', active_household=self.household)
        self.member = User.objects.create_user('member@example.com', 'testpassword', active_household=self.household)
        self.client = APIClient()
        self.client.force_authenticate(self.member)
        self.day = date(2026, 10, 4)

    def test_private_todo_is_hidden_on_all_detail_actions(self):
        todo = Todo.objects.create(household=self.household, created_by=self.owner, title='Private', global_todo=False)
        url = f'/api/todos/{todo.id}/'
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.patch(url, {'done': True}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(url).status_code, 404)
        todo.refresh_from_db()
        self.assertFalse(todo.done)

    def test_shared_todo_can_be_completed_and_reopened(self):
        todo = Todo.objects.create(household=self.household, created_by=self.owner, title='Shared', global_todo=True)
        url = f'/api/todos/{todo.id}/'
        self.assertEqual(self.client.patch(url, {'done': True}, format='json').status_code, 200)
        todo.refresh_from_db()
        self.assertEqual(todo.done_by, self.member)
        self.client.patch(url, {'done': False}, format='json')
        todo.refresh_from_db()
        self.assertIsNone(todo.done_by)

    def test_invalid_todo_update_does_not_change_completion_author(self):
        todo = Todo.objects.create(household=self.household, created_by=self.member, title='Task')
        response = self.client.patch(f'/api/todos/{todo.id}/', {'done': True, 'title': ''}, format='json')
        self.assertEqual(response.status_code, 400)
        todo.refresh_from_db()
        self.assertFalse(todo.done)
        self.assertIsNone(todo.done_by)

    def test_explicit_absence_overrides_legacy_presence(self):
        menu = Menu.objects.create(household=self.household, date=self.day)
        member = HouseholdMember.objects.create(household=self.household, name='Legacy')
        MemberAvailability.objects.create(member=member, date=self.day, lunch_present=True, dinner_present=True)
        UserMealAttendance.objects.create(user=self.member, household=self.household, date=self.day,
                                         breakfast_present=False, lunch_present=False, dinner_present=False)
        recalculate_menu_persons_for_range(self.household, self.day, self.day)
        menu.refresh_from_db()
        self.assertEqual((menu.breakfast_persons, menu.lunch_persons, menu.dinner_persons), (0, 0, 0))

    def test_legacy_presence_remains_fallback_without_modern_records(self):
        menu = Menu.objects.create(household=self.household, date=self.day)
        member = HouseholdMember.objects.create(household=self.household, name='Legacy')
        MemberAvailability.objects.create(member=member, date=self.day, lunch_present=True, dinner_present=False)
        recalculate_menu_persons_for_range(self.household, self.day, self.day)
        menu.refresh_from_db()
        self.assertEqual((menu.lunch_persons, menu.dinner_persons), (1, 0))

    def test_menu_cannot_reference_another_households_recipe(self):
        recipe = Recipe.objects.create(household=self.other_household, name='Private recipe')
        for payload in ({'lunchRecipeId': str(recipe.id)}, {'extraRecipeIds': [str(recipe.id)]}, {'extraRecipeIds': ['bad-uuid']}):
            response = self.client.post('/api/menus/', {'date': str(self.day), **payload}, format='json')
            self.assertEqual(response.status_code, 400)
        self.assertFalse(Menu.objects.exists())

    def test_menu_accepts_local_recipe_and_extra_recipe_list(self):
        recipe = Recipe.objects.create(household=self.household, name='Recipe')
        response = self.client.post('/api/menus/', {'date': str(self.day), 'lunchRecipeId': str(recipe.id), 'extraRecipeIds': [str(recipe.id)]}, format='json')
        self.assertEqual(response.status_code, 201)

    def test_export_deduplicates_meals_and_replaces_only_target_week(self):
        recipe = Recipe.objects.create(household=self.household, name='Pasta', base_servings=2,
                                       ingredients=[{'name': 'Pasta', 'quantityPerPerson': 200, 'unit': 'g'}])
        Menu.objects.create(household=self.household, date=self.day, lunch_recipe=recipe, lunch_persons=2)
        old = ShoppingItem.objects.create(household=self.household, name='Old', list_type='menuplan', week_tag='2026-W40')
        manual = ShoppingItem.objects.create(household=self.household, name='Manual')
        other_week = ShoppingItem.objects.create(household=self.household, name='Other week', list_type='menuplan', week_tag='2026-W41')
        ref = f'{self.day}:lunch'
        response = self.client.post('/api/shopping-items/export-week/', {'meals': [ref, ref], 'weekTag': '2026-W40', 'resetExisting': True}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data'][0]['quantity'], 200)
        self.assertFalse(ShoppingItem.objects.filter(id=old.id).exists())
        self.assertTrue(ShoppingItem.objects.filter(id=manual.id).exists())
        self.assertTrue(ShoppingItem.objects.filter(id=other_week.id).exists())

    def test_explicit_zero_persons_does_not_export_ingredients(self):
        recipe = Recipe.objects.create(household=self.household, name='Pasta', ingredients=[{'name': 'Pasta', 'quantityPerPerson': 200}])
        Menu.objects.create(household=self.household, date=self.day, lunch_recipe=recipe)
        ref = f'{self.day}:lunch'
        response = self.client.post('/api/shopping-items/export-week/', {'meals': [ref], 'personCounts': {ref: 0}}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 0)
        self.assertFalse(ShoppingItem.objects.exists())

    def test_invalid_person_count_returns_validation_error(self):
        Menu.objects.create(household=self.household, date=self.day)
        ref = f'{self.day}:lunch'
        response = self.client.post('/api/shopping-items/export-week/', {'meals': [ref], 'personCounts': {ref: 'invalid'}}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_calendar_includes_overlapping_multi_day_event(self):
        now = timezone.now()
        event = CalendarEvent.objects.create(household=self.household, title='Trip', start=now-timedelta(days=3), end=now+timedelta(days=2))
        response = self.client.get('/api/calendar-events/', {'start': now.date().isoformat(), 'end': now.date().isoformat()})
        self.assertEqual(response.status_code, 200)
        self.assertIn(str(event.id), [e['id'] for e in response.data['data']])

    def test_calendar_rejects_end_before_start(self):
        now = timezone.now()
        response = self.client.post('/api/calendar-events/', {'title': 'Invalid', 'start': now.isoformat(), 'end': (now-timedelta(hours=1)).isoformat()}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_household_features_require_an_active_household(self):
        self.member.active_household = None
        self.member.save(update_fields=['active_household'])
        for endpoint in ('todos', 'recipes', 'menus', 'shopping-items', 'calendar-events', 'cleaning-tasks'):
            self.assertEqual(self.client.post(f'/api/{endpoint}/', {}, format='json').status_code, 403)


class TaskInputTests(TestCase):
    def setUp(self):
        household = Household.objects.create(name='Test')
        user = User.objects.create_user('task@example.com', 'testpassword', active_household=household)
        self.client = APIClient()
        self.client.force_authenticate(user)
        self.task = Todo.objects.create(household=household, created_by=user, title='Task', global_todo=True, duration_minutes=90,
                                        start_date=timezone.now(), due_date=timezone.now() + timedelta(days=2))
        self.url = f'/api/todos/{self.task.id}/'

    def test_dates_and_duration_can_be_cleared(self):
        response = self.client.patch(self.url, {'startDate': None, 'dueDate': None, 'durationMinutes': None}, format='json')
        self.assertEqual(response.status_code, 200)
        self.task.refresh_from_db()
        self.assertIsNone(self.task.start_date)
        self.assertIsNone(self.task.due_date)
        self.assertIsNone(self.task.duration_minutes)

    def test_partial_update_cannot_reverse_existing_dates(self):
        response = self.client.patch(self.url, {'startDate': (timezone.now() + timedelta(days=3)).isoformat()}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_invalid_numeric_and_recurrence_values_are_rejected(self):
        for patch in [{'durationMinutes': -1}, {'progress': 101}, {'recurrenceInterval': 0}, {'recurrence': 'hourly'}]:
            with self.subTest(patch=patch):
                self.assertEqual(self.client.patch(self.url, patch, format='json').status_code, 400)


class RecipeShoppingTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Cooking')
        user = User.objects.create_user('cook@example.com', 'testpassword', active_household=self.household)
        self.client = APIClient()
        self.client.force_authenticate(user)
        self.recipe = Recipe.objects.create(household=self.household, name='Recipe', base_servings=2,
            ingredients=[{'name': 'Pasta', 'quantityPerPerson': 200, 'unit': 'g'}, {'name': 'Optional', 'quantityPerPerson': 0, 'unit': 'g'}])

    def test_unplanned_recipe_exports_the_visible_portions(self):
        response = self.client.post('/api/shopping-items/add-recipe/', {'recipeId': str(self.recipe.id), 'persons': 3, 'unitsPerPerson': 1.5}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ShoppingItem.objects.get(name='Pasta').quantity, 450)
        self.assertEqual(ShoppingItem.objects.get(name='Optional').quantity, 0)

    def test_invalid_portions_do_not_create_items(self):
        response = self.client.post('/api/shopping-items/add-recipe/', {'recipeId': str(self.recipe.id), 'persons': 3, 'unitsPerPerson': -1}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ShoppingItem.objects.count(), 0)
