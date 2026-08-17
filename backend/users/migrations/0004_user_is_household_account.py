from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_dashboardlayout'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='is_household_account',
            field=models.BooleanField(default=False),
        ),
    ]
