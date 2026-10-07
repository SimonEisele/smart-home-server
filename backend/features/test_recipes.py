from django.test import TestCase, TransactionTestCase
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from rest_framework.test import APIClient
from users.models import User, Household
from .models import Recipe, Ingredient, RecipeStepIngredient


class RecipeWorkflowTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Recipes')
        self.user = User.objects.create_user('recipes@example.com', 'password', active_household=self.household)
        self.client = APIClient(); self.client.force_authenticate(self.user)
        self.data = {'name':'Testbrot', 'baseServings':4, 'servingType':'Portionen', 'unitsPerPerson':1,
            'sections':[{'id':1,'title':'Teig'}], 'sideNotes':[{'label':'Ofen','value':'180 °C'}],
            'ingredients':[{'name':'Test flour','quantityPerPerson':500,'unit':'g','sectionId':1}],
            'steps':[{'order':1,'description':'Teig mischen','sectionId':1,'ingredients':[{'name':'Test flour','quantityPerPerson':100,'unit':'g'}]},
                     {'order':2,'description':'Backen','sectionId':1,'ingredients':[{'name':'Test flour'}]}]}

    def create(self):
        response = self.client.post('/api/recipes/', self.data, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['data']

    def test_structured_rows_and_stable_amount_identity(self):
        result = self.create(); recipe = Recipe.objects.get(pk=result['id'])
        self.assertEqual(recipe.section_rows.count(), 1); self.assertEqual(recipe.note_rows.count(),1)
        self.assertEqual(recipe.step_rows.count(),2)
        self.assertEqual(recipe.step_rows.first().ingredient_links.first().quantity,100)
        identity = result['ingredients'][0]['id']
        self.assertEqual(result['steps'][1]['ingredients'][0]['recipeIngredientId'],identity)
        self.assertIsNone(result['steps'][1]['ingredients'][0]['quantityPerPerson'])
        result['ingredients'][0]['quantityPerPerson'] = 600
        updated = self.client.patch(f'/api/recipes/{recipe.id}/', {'ingredients':result['ingredients']}, format='json')
        self.assertEqual(updated.status_code,200,updated.data)
        self.assertEqual(updated.data['data']['ingredients'][0]['id'],identity)
        self.assertEqual(updated.data['data']['steps'][0]['ingredients'][0]['quantityPerPerson'],100)

    def test_legacy_name_only_update_preserves_linked_amount_identity(self):
        result = self.create()
        original_id = result['ingredients'][0]['id']
        response = self.client.patch(f'/api/recipes/{result["id"]}/', {'ingredients':[
            {'name':'Test flour','quantityPerPerson':600,'unit':'g','sectionId':1}]}, format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['data']['ingredients'][0]['id'],original_id)
        self.assertEqual(response.data['data']['steps'][0]['ingredients'][0]['quantityPerPerson'],100)

    def test_independent_step_quantities_do_not_change_recipe_total(self):
        result = self.create(); result['steps'][0]['ingredients'][0]['quantityPerPerson'] = 50
        response = self.client.patch(f'/api/recipes/{result["id"]}/', {'steps':result['steps']}, format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['data']['ingredients'][0]['quantityPerPerson'],500)
        self.assertEqual(response.data['data']['steps'][0]['ingredients'][0]['quantityPerPerson'],50)

    def test_reorder_sections_and_steps_retains_links(self):
        result = self.create(); result['steps'].reverse()
        for i,step in enumerate(result['steps']): step['order']=i+1
        result['sections'][0]['title']='Vorbereitung'
        response = self.client.patch(f'/api/recipes/{result["id"]}/', result, format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['data']['steps'][0]['description'],'Backen')
        self.assertEqual(response.data['data']['sections'][0]['title'],'Vorbereitung')

    def test_invalid_references_and_numeric_fields_preserve_existing_data(self):
        result = self.create(); url=f'/api/recipes/{result["id"]}/'
        for patch in [{'baseServings':0},{'durationMinutes':-1},{'unitsPerPerson':'Infinity'}, {'servingType':'unknown'},
                      {'sections':[]}, {'steps':[{'order':1,'description':'', 'ingredients':[]}]},
                      {'steps':[{'order':1,'description':'Invalid','ingredients':[{'recipeIngredientId':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}]}]}]:
            response=self.client.patch(url,patch,format='json');self.assertEqual(response.status_code,400,response.data)
        self.assertEqual(Recipe.objects.get(pk=result['id']).step_rows.count(),2)

    def test_foreign_amount_identity_and_duplicate_links_rejected(self):
        first=self.create(); self.data['name']='Other'; second=self.create()
        second['ingredients'][0]['id']=first['ingredients'][0]['id']
        response=self.client.patch(f'/api/recipes/{second["id"]}/',{'ingredients':second['ingredients']},format='json')
        self.assertEqual(response.status_code,400)
        link=first['steps'][0]['ingredients'][0];first['steps'][0]['ingredients']=[link,dict(link)]
        response=self.client.patch(f'/api/recipes/{first["id"]}/',{'steps':first['steps']},format='json')
        self.assertEqual(response.status_code,400)

    def test_recipe_delete_cascades_content_and_keeps_catalog(self):
        item=Ingredient.objects.create(name='Recipe test flour')
        self.data['ingredients'][0]['name']=item.name
        for step in self.data['steps']:step['ingredients'][0]['name']=item.name
        result=self.create();self.client.delete(f'/api/recipes/{result["id"]}/')
        self.assertFalse(RecipeStepIngredient.objects.filter(step__recipe_id=result['id']).exists())
        self.assertTrue(Ingredient.objects.filter(pk=item.pk).exists())


class RecipeMigrationTests(TransactionTestCase):
    def test_migration_and_reverse_preserve_sections_notes_and_step_amounts(self):
        old=[('features','0024_relational_recipe_ingredients')];new=[('features','0025_structured_recipes')]
        executor=MigrationExecutor(connection);executor.migrate(old);apps=executor.loader.project_state(old).apps
        try:
            household=apps.get_model('users','Household').objects.create(name='Migration')
            recipe=apps.get_model('features','Recipe').objects.create(household=household,name='Cake',sections=[{'id':12,'title':'Teig'}],side_notes=[{'label':'Ofen','value':'180 °C'}],steps=[{'order':4,'description':'Mischen','sectionId':12,'ingredients':[{'name':'Migration Flour','quantityPerPerson':100,'unit':'g'}]}])
            amount=apps.get_model('features','RecipeIngredient').objects.create(recipe=recipe,name='Migration Flour',quantity=500,unit='g',position=0,section_id=12)
            executor=MigrationExecutor(connection);executor.migrate(new);apps=executor.loader.project_state(new).apps
            migrated=apps.get_model('features','RecipeIngredient').objects.get(pk=amount.pk)
            self.assertEqual(migrated.section_ref.key,12);self.assertIsNotNone(migrated.key)
            self.assertEqual(apps.get_model('features','RecipeStepIngredient').objects.get(step__recipe_id=recipe.id).quantity,100)
            executor=MigrationExecutor(connection);executor.migrate(old);apps=executor.loader.project_state(old).apps
            restored=apps.get_model('features','Recipe').objects.get(pk=recipe.pk)
            self.assertEqual(restored.sections,[{'id':12,'title':'Teig'}]);self.assertEqual(restored.side_notes[0]['value'],'180 °C')
            self.assertEqual(restored.steps[0]['ingredients'][0]['quantityPerPerson'],100)
            self.assertEqual(apps.get_model('features','RecipeIngredient').objects.get(pk=amount.pk).section_id,12)
        finally:MigrationExecutor(connection).migrate(new)
