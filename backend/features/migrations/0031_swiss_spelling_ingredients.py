"""Catalog names in Swiss spelling ("Weisswein" instead of "Weißwein"), like the rest of the app.

The normalized name stays the same (casefold already treats ß as ss), so matching is unaffected.
"""
from django.db import migrations


def to_swiss(apps, schema_editor):
    Ingredient = apps.get_model('features', 'Ingredient')
    RecipeIngredient = apps.get_model('features', 'RecipeIngredient')
    for entry in Ingredient.objects.filter(name__contains='ß'):
        name = entry.name.replace('ß', 'ss')
        Ingredient.objects.filter(pk=entry.pk).update(name=name)
        RecipeIngredient.objects.filter(ingredient=entry).update(name=name)


class Migration(migrations.Migration):
    dependencies = [('features', '0030_cleaning_assignee_rotation_checklist')]
    operations = [migrations.RunPython(to_swiss, migrations.RunPython.noop)]
