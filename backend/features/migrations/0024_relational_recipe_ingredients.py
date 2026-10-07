import math
import unicodedata
from django.db import migrations, models
import django.db.models.deletion


def key(value):
    return unicodedata.normalize('NFKC', ' '.join(str(value).split())).casefold()


def forward(apps, schema_editor):
    Ingredient = apps.get_model('features', 'Ingredient')
    Recipe = apps.get_model('features', 'Recipe')
    Row = apps.get_model('features', 'RecipeIngredient')
    catalog = {}
    for item in Ingredient.objects.order_by('id'):
        normalized = key(item.name)
        if normalized in catalog:
            item.delete()
        else:
            catalog[normalized] = item
    # Remove all duplicates before trimming names to avoid the old name uniqueness constraint.
    for normalized, item in catalog.items():
        item.normalized_name = normalized
        item.name = ' '.join(item.name.split())
        item.save(update_fields=['normalized_name', 'name'])
    for recipe in Recipe.objects.iterator():
        rows = []
        for position, value in enumerate(recipe.ingredients or []):
            if not isinstance(value, dict):
                raise ValueError(f'Rezept {recipe.id}: ungültige Zutatenstruktur. Bitte vor der Migration korrigieren.')
            quantity = value.get('quantityPerPerson', value.get('quantity_per_person'))
            try:
                quantity = None if quantity in (None, '') else float(quantity)
            except (TypeError, ValueError):
                raise ValueError(f'Rezept {recipe.id}: ungültige Zutatenmenge.')
            if quantity is not None and (not math.isfinite(quantity) or quantity < 0):
                raise ValueError(f'Rezept {recipe.id}: ungültige Zutatenmenge.')
            name = str(value.get('name') or '').strip()
            rows.append(Row(recipe=recipe, position=position, ingredient=catalog.get(key(name)),
                            name=name, quantity=quantity, unit=value.get('unit') or '', section_id=value.get('sectionId')))
        Row.objects.bulk_create(rows)
        for step in recipe.steps or []:
            if isinstance(step, dict):
                for value in step.get('ingredients') or []:
                    if isinstance(value, dict):
                        entry = catalog.get(key(value.get('name', '')))
                        if entry:
                            value['ingredientId'] = entry.id
        recipe.save(update_fields=['steps'])


def backward(apps, schema_editor):
    Recipe = apps.get_model('features', 'Recipe')
    for recipe in Recipe.objects.all():
        values = []
        for row in recipe.ingredient_rows.select_related('ingredient').order_by('position'):
            value = {'name': row.ingredient.name if row.ingredient_id else row.name,
                     'quantityPerPerson': row.quantity, 'unit': row.unit}
            if row.section_id is not None:
                value['sectionId'] = row.section_id
            values.append(value)
        recipe.ingredients = values
        recipe.save(update_fields=['ingredients'])


class Migration(migrations.Migration):
    dependencies = [('features', '0023_menu_breakfast_persons')]
    operations = [
        migrations.AddField(model_name='ingredient', name='archived', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='ingredient', name='normalized_name', field=models.CharField(max_length=200, null=True, editable=False)),
        migrations.CreateModel(name='RecipeIngredient', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('name', models.CharField(max_length=100)),
            ('quantity', models.FloatField(blank=True, null=True)),
            ('unit', models.CharField(blank=True, max_length=20)),
            ('position', models.PositiveIntegerField()),
            ('section_id', models.IntegerField(blank=True, null=True)),
            ('ingredient', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='recipe_rows', to='features.ingredient')),
            ('recipe', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ingredient_rows', to='features.recipe')),
        ], options={'ordering': ['position'], 'constraints': [
            models.UniqueConstraint(fields=('recipe', 'position'), name='unique_recipe_ingredient_position'),
            models.CheckConstraint(condition=models.Q(quantity__isnull=True) | models.Q(quantity__gte=0), name='recipe_ingredient_nonnegative_quantity'),
        ]}),
        migrations.RunPython(forward, backward),
        migrations.AlterField(model_name='ingredient', name='normalized_name', field=models.CharField(max_length=200, unique=True, editable=False)),
        migrations.RemoveField(model_name='recipe', name='ingredients'),
    ]
