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


class TaskCalendarLinkTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Tasks')
        self.other_household = Household.objects.create(name='Other')
        self.member = User.objects.create_user('planner@example.com','testpassword',active_household=self.household)
        self.owner = User.objects.create_user('other@example.com','testpassword',active_household=self.household)
        self.client = APIClient()
        self.client.force_authenticate(self.member)
        self.task = Todo.objects.create(household=self.household, created_by=self.member, title='Plan task', description='Task details', duration_minutes=180)
        self.start = timezone.now()

    def payload(self, todo_id=None):
        return {'title':'Stale title','start':self.start.isoformat(),'end':(self.start+timedelta(hours=1)).isoformat(),'calendarType':'household','todoRefId':str(todo_id or self.task.id)}

    def test_task_controls_title_description_and_visibility(self):
        response = self.client.post('/api/calendar-events/',self.payload(),format='json')
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.data['data']['title'],self.task.title)
        self.assertEqual(response.data['data']['description'],self.task.description)
        self.assertEqual(response.data['data']['calendarType'],'private')

    def test_cannot_link_inaccessible_tasks(self):
        private = Todo.objects.create(household=self.household,created_by=self.owner,title='Private')
        foreign = Todo.objects.create(household=self.other_household,created_by=self.member,title='Foreign',global_todo=True)
        for task in (private,foreign):
            self.assertEqual(self.client.post('/api/calendar-events/',self.payload(task.id),format='json').status_code,400)

    def test_task_edit_updates_all_blocks_preserving_split_labels(self):
        event = CalendarEvent.objects.create(household=self.household,created_by=self.member,title='Plan task (1/2)',start=self.start,todo_ref_id=self.task.id)
        self.client.patch(f'/api/todos/{self.task.id}/',{'title':'Updated task','description':'New details'},format='json')
        event.refresh_from_db()
        self.assertEqual(event.title,'Updated task (1/2)')
        self.assertEqual(event.description,'New details')
        self.assertEqual(event.calendar_type,'private')

    def test_removing_one_block_keeps_task_and_other_block(self):
        ids = [self.client.post('/api/calendar-events/',self.payload(),format='json').data['data']['id'] for _ in range(2)]
        self.assertEqual(self.client.delete(f'/api/calendar-events/{ids[0]}/').status_code,200)
        self.assertTrue(Todo.objects.filter(id=self.task.id).exists())
        self.assertTrue(CalendarEvent.objects.filter(id=ids[1]).exists())
        self.task.refresh_from_db()
        self.assertEqual(self.task.duration_minutes,180)
        self.assertFalse(self.task.done)


class MenuExportWorkflowTests(TestCase):
    def setUp(self):
        self.household=Household.objects.create(name='Export')
        self.user=User.objects.create_user('export@example.com','testpassword',active_household=self.household)
        self.client=APIClient();self.client.force_authenticate(self.user)
        self.monday=date(2026,10,5)
        self.recipe=Recipe.objects.create(household=self.household,name='Pasta',base_servings=4,units_per_person=2,ingredients=[{'name':'Pasta','quantityPerPerson':200,'unit':'g'}])
        self.menu=Menu.objects.create(household=self.household,date=self.monday,dinner_recipe=self.recipe)
        UserMealAttendance.objects.create(household=self.household,user=self.user,date=self.monday,dinner_present=True)
        self.ref=f'{self.monday}:dinner'
        self.payload={'weekStart':str(self.monday),'meals':[self.ref],'strict':True,'resetExisting':True}
        self.url='/api/shopping-items/export-week/'

    def preview(self,payload=None):
        return self.client.post(self.url,{**(payload or self.payload),'dryRun':True},format='json')

    def test_preview_and_export_have_identical_scaled_quantities(self):
        preview=self.preview();self.assertEqual(preview.status_code,200);self.assertEqual(preview.data['data'][0]['quantity'],100)
        self.assertFalse(ShoppingItem.objects.exists())
        response=self.client.post(self.url,{**self.payload,'previewToken':preview.data['previewToken']},format='json')
        self.assertEqual(response.status_code,200);self.assertEqual(response.data['data'][0]['quantity'],100)

    def test_repeated_export_updates_instead_of_duplicating_and_preserves_checked(self):
        self.client.post(self.url,self.payload,format='json')
        item=ShoppingItem.objects.get();item.checked=True;item.save()
        manual=ShoppingItem.objects.create(household=self.household,name='Manual')
        other=ShoppingItem.objects.create(household=self.household,name='Other',list_type='menuplan',week_tag='2026-W42')
        self.client.post(self.url,self.payload,format='json');item.refresh_from_db()
        self.assertTrue(item.checked);self.assertEqual(ShoppingItem.objects.count(),3)
        self.recipe.ingredients=[{'name':'Pasta','quantityPerPerson':400,'unit':'g'}];self.recipe.save()
        self.client.post(self.url,self.payload,format='json');item.refresh_from_db()
        self.assertFalse(item.checked);self.assertEqual(item.quantity,200)
        self.assertTrue(ShoppingItem.objects.filter(id=manual.id).exists());self.assertTrue(ShoppingItem.objects.filter(id=other.id).exists())

    def test_absent_people_do_not_get_a_default_of_two(self):
        UserMealAttendance.objects.filter(household=self.household).update(dinner_present=False)
        preview=self.preview();self.assertTrue(preview.data['blocked']);self.assertEqual(preview.data['count'],0)
        self.assertEqual(self.client.post(self.url,self.payload,format='json').status_code,400)
        self.assertFalse(ShoppingItem.objects.exists())

    def test_cross_week_leftovers_are_counted_on_the_original_cooking_day(self):
        sunday=self.monday+timedelta(days=6);next_monday=sunday+timedelta(days=1)
        Menu.objects.create(household=self.household,date=sunday,dinner_recipe=self.recipe)
        Menu.objects.create(household=self.household,date=next_monday,lunch_leftovers_ref=f'{sunday}:dinner')
        UserMealAttendance.objects.create(household=self.household,user=self.user,date=sunday,dinner_present=True)
        UserMealAttendance.objects.create(household=self.household,user=self.user,date=next_monday,lunch_present=True)
        payload={**self.payload,'meals':[f'{sunday}:dinner']};preview=self.preview(payload)
        self.assertEqual(preview.data['data'][0]['quantity'],200);self.assertEqual(preview.data['meals'][0]['leftoverPersons'],1)

    def test_extras_use_chosen_recipe_units_without_multiplying_units_per_person(self):
        extra=Recipe.objects.create(household=self.household,name='Cookies',base_servings=12,units_per_person=3,serving_type='Stücke',ingredients=[{'name':'Flour','quantityPerPerson':120,'unit':'g'}])
        self.menu.extra_recipe_ids=[str(extra.id)];self.menu.save()
        ref=f'{self.monday}:extra:{extra.id}'
        preview=self.preview({**self.payload,'meals':[ref],'extraServings':{ref:6}})
        self.assertEqual(preview.data['data'][0]['quantity'],60)
        self.assertEqual(preview.data['meals'][0]['servings'],6)

    def test_changed_plan_rejects_stale_preview_without_changing_shopping(self):
        preview=self.preview();self.recipe.ingredients=[{'name':'Pasta','quantityPerPerson':800,'unit':'g'}];self.recipe.save()
        response=self.client.post(self.url,{**self.payload,'previewToken':preview.data['previewToken']},format='json')
        self.assertEqual(response.status_code,409);self.assertFalse(ShoppingItem.objects.exists())

    def test_zero_and_missing_quantities_are_distinct(self):
        self.recipe.ingredients=[{'name':'Salt','quantityPerPerson':0,'unit':'g'},{'name':'Pepper','unit':'g'}];self.recipe.save()
        preview=self.preview();items={i['name']:i for i in preview.data['data']}
        self.assertEqual(items['Salt']['quantity'],0);self.assertIsNone(items['Pepper']['quantity']);self.assertTrue(items['Pepper']['quantityIncomplete'])

    def test_invalid_inputs_do_not_clear_existing_export(self):
        item=ShoppingItem.objects.create(household=self.household,name='Keep',list_type='menuplan',week_tag='2026-W41')
        for patch in ({'meals':['2026-02-31:dinner']},{'personCounts':{self.ref:1.5}},{'personCounts':{self.ref:'NaN'}},{'weekTag':'2026-W42'}):
            self.assertEqual(self.client.post(self.url,{**self.payload,**patch},format='json').status_code,400)
        self.assertTrue(ShoppingItem.objects.filter(id=item.id).exists())

    def test_iso_week_year_is_calculated_on_server(self):
        monday=date(2018,12,31);Menu.objects.create(household=self.household,date=monday,dinner_recipe=self.recipe)
        UserMealAttendance.objects.create(household=self.household,user=self.user,date=monday,dinner_present=True)
        preview=self.preview({**self.payload,'weekStart':str(monday),'meals':[f'{monday}:dinner']})
        self.assertEqual(preview.data['weekTag'],'2019-W01')

    def test_leftovers_must_reference_an_earlier_cooked_meal(self):
        response=self.client.patch(f'/api/menus/{self.menu.id}/',{'lunchLeftoversRef':self.ref},format='json')
        self.assertEqual(response.status_code,400)
        response=self.client.post('/api/menus/',{'date':str(self.monday+timedelta(days=1)),'lunchLeftoversRef':self.ref},format='json')
        self.assertEqual(response.status_code,201)

    def test_new_menu_immediately_returns_current_attendance(self):
        UserMealAttendance.objects.create(household=self.household,user=self.user,date=self.monday+timedelta(days=2),lunch_present=True)
        response=self.client.post('/api/menus/',{'date':str(self.monday+timedelta(days=2)),'lunchRecipeId':str(self.recipe.id)},format='json')
        self.assertEqual(response.data['data']['lunchPersons'],1)

    def test_original_cooking_meal_cannot_be_removed_while_leftovers_depend_on_it(self):
        Menu.objects.create(household=self.household,date=self.monday+timedelta(days=1),lunch_leftovers_ref=self.ref)
        response=self.client.patch(f'/api/menus/{self.menu.id}/',{'dinnerRecipeId':None},format='json')
        self.assertEqual(response.status_code,400)
        self.menu.refresh_from_db();self.assertEqual(self.menu.dinner_recipe,self.recipe)
