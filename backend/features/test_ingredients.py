from django.test import TestCase
from rest_framework.test import APIClient
from users.models import Household, User
from .models import Ingredient, Recipe, RecipeIngredient


class IngredientWorkflowTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Kitchen')
        self.user = User.objects.create_user('kitchen@example.com', 'password', active_household=self.household)
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.flour, _ = Ingredient.objects.get_or_create(normalized_name='weizenmehl', defaults={'name': 'Weizenmehl', 'category': 'getreide', 'default_unit': 'g'})

    def recipe(self, **kwargs):
        return Recipe.objects.create(household=self.household, name='Brot', ingredients=[
            {'name': 'Weizenmehl', 'quantityPerPerson': 250, 'unit': 'g', 'sectionId': 2},
            {'name': 'Wasser', 'unit': 'ml'}], **kwargs)

    def test_case_whitespace_and_unicode_duplicates_rejected(self):
        response = self.client.post('/api/ingredients/', {'name': '  WEIZENMEHL  '}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('bereits', str(response.data))
        response = self.client.post('/api/ingredients/', {'name': 'Ｗｅｉｚｅｎｍｅｈｌ'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_unit_aliases_and_unknown_unit_validation(self):
        response = self.client.post('/api/ingredients/', {'name': 'Test-Ei', 'defaultUnit': 'Stk.'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['data']['defaultUnit'], 'Stück')
        self.assertEqual(self.client.patch(f'/api/ingredients/{self.flour.id}/', {'defaultUnit': 'random'}, format='json').status_code, 400)

    def test_recipe_rows_are_relational_and_preserve_optional_quantity_and_sections(self):
        recipe = self.recipe()
        row = recipe.ingredient_rows.get(position=0)
        self.assertEqual(row.ingredient, self.flour)
        self.assertEqual(row.quantity, 250)
        self.assertEqual(row.section_id, 2)
        response = self.client.get(f'/api/recipes/{recipe.id}/')
        self.assertEqual(response.data['data']['ingredients'][0]['ingredientId'], self.flour.id)
        self.assertIsNone(response.data['data']['ingredients'][1]['quantityPerPerson'])

    def test_rename_resolves_recipe_and_step_names_without_changing_quantities(self):
        recipe = self.recipe(steps=[{'order': 1, 'description': 'Mischen', 'ingredients': [{'name': 'Weizenmehl', 'quantityPerPerson': 250, 'unit': 'g'}]}])
        response = self.client.patch(f'/api/ingredients/{self.flour.id}/', {'name': 'Mehl', 'defaultUnit': 'kg'}, format='json')
        self.assertEqual(response.status_code, 200)
        result = self.client.get(f'/api/recipes/{recipe.id}/').data['data']
        self.assertEqual(result['ingredients'][0]['name'], 'Mehl')
        self.assertEqual(result['ingredients'][0]['quantityPerPerson'], 250)
        self.assertEqual(result['ingredients'][0]['unit'], 'g')
        self.assertEqual(result['steps'][0]['ingredients'][0]['name'], 'Mehl')

    def test_used_ingredient_delete_is_protected_and_archive_keeps_existing_recipe(self):
        recipe = self.recipe()
        url = f'/api/ingredients/{self.flour.id}/'
        self.assertEqual(self.client.delete(url).status_code, 409)
        self.assertEqual(self.client.patch(url, {'archived': True}, format='json').status_code, 200)
        result = self.client.get(f'/api/recipes/{recipe.id}/').data['data']
        self.assertEqual(self.client.patch(f'/api/recipes/{recipe.id}/', {'ingredients': result['ingredients']}, format='json').status_code, 200)
        new = self.client.post('/api/recipes/', {'name': 'Neu', 'ingredients': result['ingredients']}, format='json')
        self.assertEqual(new.status_code, 400)
        self.assertEqual(recipe.ingredient_rows.count(), 2)

    def test_usage_counts_distinct_recipes_and_unused_deletion(self):
        self.recipe()
        catalog = self.client.get('/api/ingredients/').data['data']
        self.assertEqual(next(i for i in catalog if i['id'] == self.flour.id)['usageCount'], 1)
        unused = Ingredient.objects.create(name='Unused')
        self.assertEqual(self.client.delete(f'/api/ingredients/{unused.id}/').status_code, 200)

    def test_catalog_creation_links_existing_free_text_recipe_rows(self):
        recipe = self.recipe()
        self.assertIsNone(recipe.ingredient_rows.get(position=1).ingredient_id)
        water = self.client.post('/api/ingredients/', {'name': 'Wasser', 'defaultUnit': 'ml'}, format='json').data['data']
        self.assertEqual(recipe.ingredient_rows.get(position=1).ingredient_id, water['id'])
        self.assertEqual(water['usageCount'], 1)

    def test_invalid_recipe_quantities_and_identity_do_not_overwrite_rows(self):
        recipe = self.recipe()
        for value in (-1, 'Infinity'):
            response = self.client.patch(f'/api/recipes/{recipe.id}/', {'ingredients': [{'name': 'Mehl', 'quantityPerPerson': value}]}, format='json')
            self.assertEqual(response.status_code, 400)
        response = self.client.patch(f'/api/recipes/{recipe.id}/', {'ingredients': [{'name': 'Unknown', 'ingredientId': 999999}]}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(recipe.ingredient_rows.get(position=0).quantity, 250)

    def test_zero_quantity_and_recipe_delete_cascade(self):
        recipe = self.recipe()
        response = self.client.patch(f'/api/recipes/{recipe.id}/', {'ingredients': [{'name': 'Weizenmehl', 'quantityPerPerson': 0, 'unit': 'g'}]}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['ingredients'][0]['quantityPerPerson'], 0)
        self.client.delete(f'/api/recipes/{recipe.id}/')
        self.assertFalse(RecipeIngredient.objects.filter(recipe_id=recipe.id).exists())
        self.assertTrue(Ingredient.objects.filter(id=self.flour.id).exists())

    def test_linked_identity_survives_stale_names_and_invalid_step_references(self):
        recipe = self.recipe()
        response = self.client.patch(f'/api/recipes/{recipe.id}/', {'ingredients': [
            {'ingredientId': self.flour.id, 'name': 'Alter Name', 'quantityPerPerson': 10, 'unit': 'g'}]}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['data']['ingredients'][0]['name'], self.flour.name)
        response = self.client.patch(f'/api/recipes/{recipe.id}/', {'steps': [
            {'order': 1, 'description': 'Mischen', 'ingredients': [{'name': 'Unbekannte Schrittzutat'}]}]}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_export_uses_current_catalog_name_and_preserves_recipe_unit(self):
        from datetime import date
        from .menu_export import build_export
        from .models import Menu
        recipe = self.recipe()
        Menu.objects.create(household=self.household, date=date(2026, 10, 5), dinner_recipe=recipe, dinner_persons=2)
        self.flour.name = 'Brotmehl'; self.flour.default_unit = 'kg'; self.flour.save()
        preview = build_export(self.household, {'weekStart': '2026-10-05', 'meals': ['2026-10-05:dinner']})
        row = next(row for row in preview['data'] if row['name'] == 'Brotmehl')
        self.assertEqual(row['unit'], 'g')
        self.assertEqual(row['quantity'], 125)


from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class IngredientMigrationTests(TransactionTestCase):
    def test_old_json_is_preserved_and_duplicate_catalog_names_share_one_identity(self):
        old = [('features', '0023_menu_breakfast_persons')]
        latest = [('features', '0024_relational_recipe_ingredients')]
        executor = MigrationExecutor(connection)
        executor.migrate(old)
        apps = executor.loader.project_state(old).apps
        try:
            Household = apps.get_model('users', 'Household')
            Ingredient = apps.get_model('features', 'Ingredient')
            Recipe = apps.get_model('features', 'Recipe')
            household = Household.objects.create(name='Migration')
            canonical = Ingredient.objects.create(name='Migration Flour', category='getreide', default_unit='g')
            Ingredient.objects.create(name='MIGRATION  FLOUR', category='getreide', default_unit='g')
            recipe = Recipe.objects.create(household=household, name='Bread', ingredients=[
                {'name': 'MIGRATION  FLOUR', 'quantityPerPerson': 250, 'unit': 'g', 'sectionId': 5},
                {'name': 'Free water', 'unit': 'ml'}, {'name': 'Salt', 'quantityPerPerson': 0}])
            executor = MigrationExecutor(connection); executor.migrate(latest)
            apps = executor.loader.project_state(latest).apps
            rows = list(apps.get_model('features', 'RecipeIngredient').objects.filter(recipe_id=recipe.id).order_by('position'))
            self.assertEqual(len(rows), 3)
            self.assertEqual(rows[0].ingredient_id, canonical.id)
            self.assertEqual(rows[0].quantity, 250)
            self.assertEqual(rows[0].section_id, 5)
            self.assertIsNone(rows[1].quantity)
            self.assertEqual(rows[2].quantity, 0)
            self.assertEqual(apps.get_model('features', 'Ingredient').objects.filter(normalized_name='migration flour').count(), 1)
            executor = MigrationExecutor(connection); executor.migrate(old)
            restored = executor.loader.project_state(old).apps.get_model('features', 'Recipe').objects.get(pk=recipe.id)
            self.assertEqual(restored.ingredients[0]['quantityPerPerson'], 250)
            self.assertEqual(restored.ingredients[0]['sectionId'], 5)
        finally:
            MigrationExecutor(connection).migrate(latest)
