from django.test import TestCase, TransactionTestCase
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from rest_framework.test import APIClient
from users.models import Household, User
from .models import Recipe, ShoppingItem
from .serializers import ShoppingItemSerializer


class ShoppingWorkflowTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Shopping')
        self.other = Household.objects.create(name='Other')
        self.user = User.objects.create_user('shopping@example.com', 'password', active_household=self.household)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_create_normalizes_name_unit_and_preserves_zero(self):
        response = self.client.post('/api/shopping-items/', {'name':'  Milch  frisch ', 'quantity':0, 'unit':'Liter'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['data']['name'], 'Milch frisch')
        self.assertEqual(response.data['data']['unit'], 'l')
        self.assertEqual(response.data['data']['quantity'], 0)
        self.assertFalse(response.data['data']['quantityIncomplete'])

    def test_empty_quantity_can_be_set_and_incomplete_can_be_resolved(self):
        item = ShoppingItem.objects.create(household=self.household, name='Salt', quantity=2)
        url = f'/api/shopping-items/{item.id}/'
        response = self.client.patch(url, {'quantity':None}, format='json')
        self.assertIsNone(response.data['data']['quantity'])
        self.assertTrue(response.data['data']['quantityIncomplete'])
        response = self.client.patch(url, {'quantity':5, 'quantityIncomplete':False}, format='json')
        self.assertFalse(response.data['data']['quantityIncomplete'])
        self.assertEqual(response.data['data']['quantity'], 5)

    def test_invalid_quantities_and_sources_are_rejected_without_changes(self):
        for data in [{'quantity':-1}, {'quantity':'NaN'}, {'quantity':'Infinity'}, {'name':'   '}, {'listType':'wrong'}, {'listType':'menuplan','weekTag':'2026-W99'}]:
            response = self.client.post('/api/shopping-items/', {'name':'Salt', **data}, format='json')
            self.assertEqual(response.status_code, 400, data)
        self.assertFalse(ShoppingItem.objects.exists())
        for value in [float('nan'),float('inf'),-1]:
            serializer = ShoppingItemSerializer(data={'name':'Salt','quantity':value})
            self.assertFalse(serializer.is_valid())

    def test_legacy_menu_items_without_week_remain_editable(self):
        item = ShoppingItem.objects.create(household=self.household, name='Legacy', list_type='menuplan')
        response = self.client.patch(f'/api/shopping-items/{item.id}/', {'checked': True, 'quantity': 2}, format='json')
        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        self.assertTrue(item.checked)
        self.assertEqual(item.quantity, 2)

    def test_clear_only_selected_completed_items_in_current_household(self):
        selected=ShoppingItem.objects.create(household=self.household,name='Selected',checked=True)
        open_item=ShoppingItem.objects.create(household=self.household,name='Open')
        hidden=ShoppingItem.objects.create(household=self.household,name='Hidden',checked=True)
        foreign=ShoppingItem.objects.create(household=self.other,name='Foreign',checked=True)
        response=self.client.post('/api/shopping-items/clear-checked/',{'ids':[str(selected.id),str(open_item.id),str(foreign.id)]},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data['deletedIds'],[str(selected.id)])
        self.assertSetEqual(set(ShoppingItem.objects.values_list('name',flat=True)),{'Open','Hidden','Foreign'})
        response=self.client.post('/api/shopping-items/clear-checked/',{'ids':['bad']},format='json')
        self.assertEqual(response.status_code,400)
        self.assertEqual(ShoppingItem.objects.count(),3)

    def test_foreign_detail_actions_are_hidden(self):
        item=ShoppingItem.objects.create(household=self.other,name='Foreign')
        url=f'/api/shopping-items/{item.id}/'
        self.assertEqual(self.client.get(url).status_code,404)
        self.assertEqual(self.client.patch(url,{'checked':True},format='json').status_code,404)
        self.assertEqual(self.client.delete(url).status_code,404)

    def test_piece_recipe_export_scales_exact_batch_and_retains_optional_zero(self):
        recipe=Recipe.objects.create(household=self.household,name='Muffins',base_servings=12,serving_type='Stücke',units_per_person=2,ingredients=[{'name':'Flour','quantityPerPerson':240,'unit':'g'},{'name':'Salt','quantityPerPerson':0,'unit':'g'},{'name':'Pepper'}])
        response=self.client.post('/api/shopping-items/add-recipe/',{'recipeId':str(recipe.id),'persons':1,'unitsPerPerson':6},format='json')
        self.assertEqual(response.status_code,201)
        amounts={row['name']:row for row in response.data['data']}
        self.assertEqual(amounts['Flour']['quantity'],120)
        self.assertEqual(amounts['Salt']['quantity'],0)
        self.assertIsNone(amounts['Pepper']['quantity'])
        self.assertTrue(amounts['Pepper']['quantityIncomplete'])

    def test_invalid_recipe_export_input_never_creates_items(self):
        recipe=Recipe.objects.create(household=self.household,name='Bread',ingredients=[{'name':'Flour','quantityPerPerson':500}])
        for data in [{'persons':0},{'persons':1.5},{'persons':True},{'persons':'oops'},{'unitsPerPerson':True},{'unitsPerPerson':0},{'unitsPerPerson':'Infinity'},{'persons':100,'unitsPerPerson':1e308},{'recipeId':'invalid'}]:
            response=self.client.post('/api/shopping-items/add-recipe/',{'recipeId':str(recipe.id),**data},format='json')
            self.assertIn(response.status_code,[400,404],data)
        self.assertFalse(ShoppingItem.objects.exists())

    def test_menu_export_preserves_incomplete_quantity_metadata_and_reopens_changed_amount(self):
        from .menu_export import commit_export
        plan={'weekTag':'2026-W41','data':[{'name':'Salt','quantity':2,'unit':'g','category':'Sonstiges','sources':['Soup'],'quantityIncomplete':True}]}
        first=commit_export(self.household,plan,True)[0]
        first.checked=True;first.save()
        same=commit_export(self.household,plan,True)[0]
        self.assertTrue(same.checked)
        self.assertTrue(same.quantity_incomplete)
        plan['data'][0]['quantityIncomplete']=False
        changed=commit_export(self.household,plan,True)[0]
        self.assertEqual(changed.id,first.id)
        self.assertFalse(changed.checked)
        self.assertFalse(changed.quantity_incomplete)


class ShoppingMigrationTests(TransactionTestCase):
    def test_existing_unknown_and_partial_quantities_are_marked_and_roundtrip_safe(self):
        old=[('features','0025_structured_recipes')]
        new=[('features','0026_shopping_quantity_completeness')]
        executor=MigrationExecutor(connection);executor.migrate(old)
        apps=executor.loader.project_state(old).apps
        try:
            household=apps.get_model('users','Household').objects.create(name='Migration Shopping')
            Item=apps.get_model('features','ShoppingItem')
            unknown=Item.objects.create(household=household,name='Unknown')
            partial=Item.objects.create(household=household,name='Partial',quantity=3,suggestion='Soup · Menge im Rezept prüfen',checked=True)
            complete=Item.objects.create(household=household,name='Zero',quantity=0)
            executor=MigrationExecutor(connection);executor.migrate(new)
            Item=executor.loader.project_state(new).apps.get_model('features','ShoppingItem')
            self.assertTrue(Item.objects.get(pk=unknown.pk).quantity_incomplete)
            self.assertTrue(Item.objects.get(pk=partial.pk).quantity_incomplete)
            self.assertTrue(Item.objects.get(pk=partial.pk).checked)
            self.assertFalse(Item.objects.get(pk=complete.pk).quantity_incomplete)
            executor=MigrationExecutor(connection);executor.migrate(old)
            Item=executor.loader.project_state(old).apps.get_model('features','ShoppingItem')
            self.assertEqual(Item.objects.get(pk=partial.pk).quantity,3)
            self.assertEqual(Item.objects.count(),3)
        finally:
            MigrationExecutor(connection).migrate(new)
