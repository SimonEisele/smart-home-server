from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('features', '0013_menu_breakfast_leftovers_ref_menu_breakfast_recipe_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='shoppingitem',
            name='list_type',
            field=models.CharField(default='manual', max_length=20),
        ),
        migrations.AddField(
            model_name='shoppingitem',
            name='week_tag',
            field=models.CharField(blank=True, max_length=20),
        ),
    ]
