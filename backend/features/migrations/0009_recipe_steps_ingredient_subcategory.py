from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('features', '0008_populate_ingredients'),
    ]

    operations = [
        migrations.AddField(
            model_name='ingredient',
            name='subcategory',
            field=models.CharField(blank=True, default='', max_length=100),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='recipe',
            name='steps',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
