"""Handling improvements: unit-aware totals, merged shopping rows, catalog upkeep, menu cleanup."""
from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from users.models import Household, HouseholdMembership, User

from .ingredient_units import readable, to_base
from .models import Ingredient, Menu, Recipe, ShoppingItem


class UnitConversionTests(TestCase):
    def test_same_dimension_units_share_a_base(self):
        self.assertEqual(to_base(1.5, 'kg'), (1500.0, 'g'))
        self.assertEqual(to_base(2, 'dl'), (200.0, 'ml'))
        self.assertEqual(to_base(3, 'EL'), (3, 'EL'))
        self.assertEqual(to_base(None, 'l'), (None, 'ml'))
        self.assertEqual(readable(1500, 'g'), (1.5, 'kg'))
        self.assertEqual(readable(250, 'ml'), (250, 'ml'))


class HandlingApiTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='WG')
        self.user = User.objects.create_user('cook@example.com', 'password', active_household=self.household)
        self.membership = HouseholdMembership.objects.create(user=self.user, household=self.household, role='owner')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def recipe(self, name, ingredients, base=2):
        response = self.client.post('/api/recipes/', {
            'name': name, 'baseServings': base, 'ingredients': ingredients}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['data']

    def test_week_export_sums_g_and_kg_into_one_row(self):
        bread = self.recipe('Brot', [{'name': 'Mehl', 'quantityPerPerson': 600, 'unit': 'g'}])
        cake = self.recipe('Kuchen', [{'name': 'Mehl', 'quantityPerPerson': 0.6, 'unit': 'kg'}])
        Menu.objects.create(household=self.household, date=date(2026, 11, 9),
                            lunch_recipe_id=bread['id'], lunch_persons=2)
        Menu.objects.create(household=self.household, date=date(2026, 11, 10),
                            dinner_recipe_id=cake['id'], dinner_persons=2)
        response = self.client.post('/api/shopping-items/export-week/', {
            'meals': ['2026-11-09:lunch', '2026-11-10:dinner'], 'dryRun': True}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([(i['name'], i['quantity'], i['unit']) for i in response.data['data']], [('Mehl', 1.2, 'kg')])

    def test_recipe_without_ingredients_does_not_block_export(self):
        soup = self.recipe('Suppe', [{'name': 'Karotte', 'quantityPerPerson': 4, 'unit': 'Stück'}])
        empty = self.recipe('Ohne Zutaten', [])
        Menu.objects.create(household=self.household, date=date(2026, 11, 9), lunch_recipe_id=soup['id'],
                            dinner_recipe_id=empty['id'], lunch_persons=2, dinner_persons=2)
        response = self.client.post('/api/shopping-items/export-week/', {
            'meals': ['2026-11-09:lunch', '2026-11-09:dinner'], 'dryRun': True}, format='json')
        self.assertFalse(response.data['blocked'])
        self.assertEqual(response.data['warnings'], [])
        self.assertIn('Ohne Zutaten', response.data['notices'][0])

    def test_adding_a_recipe_twice_raises_quantities_instead_of_duplicating(self):
        recipe = self.recipe('Pasta', [{'name': 'Nudeln', 'quantityPerPerson': 400, 'unit': 'g'},
                                       {'name': 'Salz', 'unit': ''}])
        for _ in range(3):
            response = self.client.post('/api/shopping-items/add-recipe/', {
                'recipeId': recipe['id'], 'persons': 2}, format='json')
            self.assertEqual(response.status_code, 201, response.data)
        noodles = ShoppingItem.objects.get(name='Nudeln')
        self.assertEqual((noodles.quantity, noodles.unit), (1.2, 'kg'))
        self.assertEqual(ShoppingItem.objects.filter(household=self.household).count(), 2)
        self.assertTrue(ShoppingItem.objects.get(name='Salz').quantity_incomplete)

    def test_checked_items_are_not_reused(self):
        recipe = self.recipe('Pasta', [{'name': 'Nudeln', 'quantityPerPerson': 400, 'unit': 'g'}])
        self.client.post('/api/shopping-items/add-recipe/', {'recipeId': recipe['id'], 'persons': 2}, format='json')
        ShoppingItem.objects.update(checked=True)
        self.client.post('/api/shopping-items/add-recipe/', {'recipeId': recipe['id'], 'persons': 2}, format='json')
        self.assertEqual(ShoppingItem.objects.filter(name='Nudeln').count(), 2)

    def test_deleting_a_recipe_clears_extras_and_leftovers(self):
        main = self.recipe('Curry', [{'name': 'Reis', 'quantityPerPerson': 200, 'unit': 'g'}])
        dessert = self.recipe('Mousse', [])
        cooked = Menu.objects.create(household=self.household, date=date(2026, 11, 9), dinner_recipe_id=main['id'],
                                     extra_recipe_ids=[dessert['id'], main['id']])
        later = Menu.objects.create(household=self.household, date=date(2026, 11, 10),
                                    lunch_leftovers_ref='2026-11-09:dinner')
        response = self.client.delete(f"/api/recipes/{main['id']}/")
        self.assertEqual(response.status_code, 200)
        cooked.refresh_from_db()
        later.refresh_from_db()
        self.assertIsNone(cooked.dinner_recipe_id)
        self.assertEqual(cooked.extra_recipe_ids, [dessert['id']])
        self.assertIsNone(later.lunch_leftovers_ref)

    def test_extra_recipes_keep_their_planned_order(self):
        first = self.recipe('Erstes', [])
        second = self.recipe('Zweites', [])
        response = self.client.post('/api/menus/', {
            'date': '2026-11-09', 'extraRecipeIds': [second['id'], first['id']]}, format='json')
        self.assertEqual([r['name'] for r in response.data['data']['extraRecipes']], ['Zweites', 'Erstes'])

    def test_negative_persons_and_out_of_range_ratings_are_rejected(self):
        menu = Menu.objects.create(household=self.household, date=date(2026, 11, 9))
        for patch in ({'lunchPersons': -1}, {'rating': {'tasteRating': 6}}, {'rating': {'easeRating': 0}}):
            response = self.client.patch(f'/api/menus/{menu.id}/', patch, format='json')
            self.assertEqual(response.status_code, 400, patch)

    def test_unlinked_ingredients_are_listed_per_household(self):
        self.recipe('Pesto', [{'name': 'Bärlauch', 'quantityPerPerson': 1, 'unit': 'Bund'},
                              {'name': 'Pinienkerne', 'quantityPerPerson': 30, 'unit': 'g'}])
        self.recipe('Brot', [{'name': 'Bärlauch', 'quantityPerPerson': 2, 'unit': 'Bund'}])
        other = Household.objects.create(name='Andere')
        Recipe.objects.create(household=other, name='Fremd', ingredients=[{'name': 'Geheimzutat'}])
        response = self.client.get('/api/ingredients/unlinked/')
        self.assertEqual(response.status_code, 200)
        names = [(i['name'], i['usageCount'], i['suggestedUnit']) for i in response.data['data']]
        self.assertEqual(names, [('Bärlauch', 2, 'Bund'), ('Pinienkerne', 1, 'g')])
        self.client.post('/api/ingredients/', {'name': 'Bärlauch', 'category': 'gewuerze'}, format='json')
        response = self.client.get('/api/ingredients/unlinked/')
        self.assertEqual([i['name'] for i in response.data['data']], ['Pinienkerne'])

    def test_merge_moves_recipe_rows_to_target(self):
        onion = Ingredient.objects.create(name='Testzwiebel', category='gemuese')
        onions = Ingredient.objects.create(name='Testzwiebeln', category='gemuese')
        recipe = self.recipe('Rösti', [{'name': 'Testzwiebeln', 'quantityPerPerson': 2, 'unit': 'Stück'}])
        response = self.client.post(f'/api/ingredients/{onions.id}/merge/', {'targetId': onion.id}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['movedCount'], 1)
        self.assertFalse(Ingredient.objects.filter(pk=onions.pk).exists())
        detail = self.client.get(f"/api/recipes/{recipe['id']}/").data['data']
        self.assertEqual(detail['ingredients'][0]['name'], 'Testzwiebel')
        self.assertEqual(detail['ingredients'][0]['ingredientId'], onion.id)

    def test_merge_needs_admin_and_a_valid_target(self):
        onion = Ingredient.objects.create(name='Testzwiebel')
        response = self.client.post(f'/api/ingredients/{onion.id}/merge/', {'targetId': onion.id}, format='json')
        self.assertEqual(response.status_code, 400)
        self.membership.role = 'member'
        self.membership.save()
        other = Ingredient.objects.create(name='Testschalotte')
        response = self.client.post(f'/api/ingredients/{onion.id}/merge/', {'targetId': other.id}, format='json')
        self.assertEqual(response.status_code, 403)
