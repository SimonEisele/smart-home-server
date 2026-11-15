"""Mechanical catalog matching used for recipe proposals."""
from django.test import TestCase

from .ingredient_match import Catalog, base_name
from .models import Ingredient


class IngredientMatchTests(TestCase):
    def setUp(self):
        names = ['Testzwiebel', 'Testtomate', 'Testei', 'Testsosse', 'Testrahm', 'Testrahmquark']
        self.catalog = Catalog([Ingredient(name=n, normalized_name=n.casefold()) for n in names])

    def test_spelling_preparation_notes_and_plurals(self):
        match = lambda name: getattr(self.catalog.match(name), 'name', None)  # noqa: E731
        self.assertEqual(match('TESTZWIEBELN, in Ringen'), 'Testzwiebel')
        self.assertEqual(match('Testtomaten (gewürfelt)'), 'Testtomate')
        self.assertEqual(match('Testeier'), 'Testei')
        self.assertEqual(match('Testsoße'), 'Testsosse')
        self.assertEqual(match('Testrahm'), 'Testrahm')
        self.assertIsNone(match('Testpfeffer'))
        self.assertEqual(base_name(' Salz ,  Pfeffer'), 'Salz')
