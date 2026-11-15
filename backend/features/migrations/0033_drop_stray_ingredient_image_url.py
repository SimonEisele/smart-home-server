"""Remove a stray `image_url` column from the ingredient table.

Some databases (the Raspberry Pi's) carry a NOT NULL `features_ingredient.image_url` column that no migration
or model defines. Every new catalog ingredient then failed with "NOT NULL constraint failed", which the app
reported as "bereits im Katalog vorhanden". Databases without the column are left unchanged.
"""
from django.db import migrations, models


def drop_stray_column(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        columns = [col.name for col in connection.introspection.get_table_description(cursor, 'features_ingredient')]
    if 'image_url' not in columns:
        return
    # Django drops the column directly on newer SQLite and rebuilds the table on older versions.
    # The column is attached to this migration's throwaway historical model so the rebuild knows it.
    ingredient = apps.get_model('features', 'Ingredient')
    stray = models.TextField(default='')
    ingredient.add_to_class('image_url', stray)
    schema_editor.remove_field(ingredient, stray)


class Migration(migrations.Migration):
    dependencies = [('features', '0032_renormalize_ingredient_names')]
    operations = [migrations.RunPython(drop_stray_column, migrations.RunPython.noop)]
