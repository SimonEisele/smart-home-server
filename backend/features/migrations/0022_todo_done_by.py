from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('features', '0021_cleaning_tasks'),
        ('users', '0005_todo_created_by_meal_attendance'),
    ]

    operations = [
        migrations.AddField(
            model_name='todo',
            name='done_by',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='completed_todos', to='users.user'
            ),
        ),
    ]
