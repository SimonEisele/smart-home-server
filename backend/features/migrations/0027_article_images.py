from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('features', '0026_shopping_quantity_completeness')]

    operations = [
        migrations.AlterField(model_name='shoppingitem', name='image_url', field=models.TextField(blank=True)),
        migrations.AddField(model_name='ingredient', name='image_url', field=models.TextField(blank=True)),
    ]
