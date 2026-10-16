import base64
import io

from PIL import Image
from django.test import TestCase
from rest_framework.test import APIClient
from users.models import Household, User
from .image_data import ArticleImageField
from .menu_export import build_export, commit_export
from .models import Ingredient, Menu, Recipe, ShoppingItem


def picture(color='green'):
    stream = io.BytesIO()
    Image.new('RGB', (16, 16), color).save(stream, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode()


class ArticleImageTests(TestCase):
    def setUp(self):
        self.household = Household.objects.create(name='Images')
        self.user = User.objects.create_user('images@example.com', 'password', active_household=self.household)
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_shopping_image_persists_can_be_replaced_and_removed(self):
        image = picture()
        response = self.client.post('/api/shopping-items/', {'name': 'Bildartikel', 'imageUrl': image}, format='json')
        self.assertEqual(response.status_code, 201)
        item = ShoppingItem.objects.get(pk=response.data['data']['id'])
        self.assertEqual(item.image_url, image)
        url = f'/api/shopping-items/{item.pk}/'
        self.assertEqual(self.client.get(url).data['data']['imageUrl'], image)
        replacement = picture('red')
        self.assertEqual(self.client.patch(url, {'imageUrl': replacement}, format='json').status_code, 200)
        item.refresh_from_db()
        self.assertEqual(item.image_url, replacement)
        self.client.patch(url, {'checked': True}, format='json')
        item.refresh_from_db()
        self.assertEqual(item.image_url, replacement)
        self.client.patch(url, {'imageUrl': ''}, format='json')
        item.refresh_from_db()
        self.assertEqual(item.image_url, '')

    def test_invalid_images_never_overwrite_existing_picture(self):
        item = ShoppingItem.objects.create(household=self.household, name='Keep', image_url=picture())
        invalid = [
            'data:image/png;base64,not-base64',
            'data:image/png;base64,' + base64.b64encode(b'not an image').decode(),
            picture().replace('image/png', 'image/jpeg'),
            'data:image/svg+xml;base64,' + base64.b64encode(b'<svg/>').decode(),
            'data:image/png;base64,' + base64.b64encode(b'x' * (ArticleImageField.MAX_BYTES + 1)).decode(),
        ]
        stream = io.BytesIO()
        Image.new('RGB', (4097, 1)).save(stream, format='PNG')
        invalid.append('data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode())
        for value in invalid:
            response = self.client.patch(f'/api/shopping-items/{item.pk}/', {'imageUrl': value}, format='json')
            self.assertEqual(response.status_code, 400)
        item.refresh_from_db()
        self.assertEqual(item.image_url, picture())

    def test_existing_urls_remain_supported(self):
        response = self.client.post('/api/shopping-items/', {'name': 'Legacy', 'imageUrl': 'https://example.com/image.jpg'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['data']['imageUrl'], 'https://example.com/image.jpg')

    def test_foreign_household_cannot_read_or_replace_picture(self):
        other = Household.objects.create(name='Other')
        item = ShoppingItem.objects.create(household=other, name='Private', image_url=picture())
        url = f'/api/shopping-items/{item.pk}/'
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.patch(url, {'imageUrl': picture('red')}, format='json').status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get('/api/shopping-items/').status_code, 401)

    def test_catalog_picture_persists_and_is_inherited_by_recipe_and_menu_exports(self):
        image = picture()
        response = self.client.post('/api/ingredients/', {'name': 'Bildzutat', 'imageUrl': image}, format='json')
        self.assertEqual(response.status_code, 201)
        ingredient = Ingredient.objects.get(pk=response.data['data']['id'])
        self.assertEqual(ingredient.image_url, image)
        recipe = Recipe.objects.create(household=self.household, name='Soup', ingredients=[{'name': ingredient.name, 'quantityPerPerson': 10, 'unit': 'g'}])
        response = self.client.post('/api/shopping-items/add-recipe/', {'recipeId': str(recipe.pk), 'persons': 2}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['data'][0]['imageUrl'], image)
        Menu.objects.create(household=self.household, date='2026-10-16', dinner_recipe=recipe, dinner_persons=2)
        plan = build_export(self.household, {'meals': ['2026-10-16:dinner']})
        self.assertEqual(commit_export(self.household, plan, True)[0].image_url, image)
        url = f'/api/ingredients/{ingredient.pk}/'
        self.client.patch(url, {'imageUrl': ''}, format='json')
        ingredient.refresh_from_db()
        self.assertEqual(ingredient.image_url, '')
