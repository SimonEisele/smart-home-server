from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('features', '0022_todo_done_by'),
    ]

    operations = [
        migrations.AddField(
            model_name='menu',
            name='breakfast_persons',
            field=models.IntegerField(default=0),
        ),
    ]
