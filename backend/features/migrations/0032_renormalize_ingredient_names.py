"""Recompute the duplicate-check key of every catalog ingredient.

Entries created by older code (or imported) can carry a stale key, so a new ingredient with the same
name passed the check but then hit the database's unique name and was refused as "bereits vorhanden".
"""
import unicodedata

from django.db import migrations


def _key(value):
    return unicodedata.normalize('NFKC', ' '.join(str(value).split())).casefold()


def renormalize(apps, schema_editor):
    Ingredient = apps.get_model('features', 'Ingredient')
    taken = set(Ingredient.objects.values_list('normalized_name', flat=True))
    for entry in Ingredient.objects.all().order_by('pk'):
        name = ' '.join(entry.name.split())
        key = _key(name)
        if key == entry.normalized_name and name == entry.name:
            continue
        if key != entry.normalized_name and key in taken:
            continue  # a real duplicate pair; left for merging in the catalog
        taken.discard(entry.normalized_name)
        taken.add(key)
        Ingredient.objects.filter(pk=entry.pk).update(name=name, normalized_name=key)


class Migration(migrations.Migration):
    dependencies = [('features', '0031_swiss_spelling_ingredients')]
    operations = [migrations.RunPython(renormalize, migrations.RunPython.noop)]
