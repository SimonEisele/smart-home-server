import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('features', '0014_shoppingitem_list_type_week_tag'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='calendarevent',
            name='calendar_type',
            field=models.CharField(
                choices=[('household', 'WG'), ('private', 'Privat')],
                default='household',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='calendarevent',
            name='color',
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name='calendarevent',
            name='todo_ref_id',
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='calendarevent',
            name='created_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='private_calendar_events',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
