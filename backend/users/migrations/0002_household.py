import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
    ]

    operations = [
        # 1. Create Household (without created_by first to avoid circular dep)
        migrations.CreateModel(
            name='Household',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=120)),
                ('description', models.CharField(blank=True, max_length=300)),
                ('invite_code', models.UUIDField(default=uuid.uuid4, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        # 2. Add active_household FK to User
        migrations.AddField(
            model_name='user',
            name='active_household',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='active_users',
                to='users.household',
            ),
        ),
        # 3. Add created_by FK to Household (after User exists)
        migrations.AddField(
            model_name='household',
            name='created_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='created_households',
                to='users.user',
            ),
        ),
        # 4. Create HouseholdMembership
        migrations.CreateModel(
            name='HouseholdMembership',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('role', models.CharField(
                    choices=[('owner', 'Eigentümer'), ('admin', 'Admin'), ('member', 'Mitglied')],
                    default='member',
                    max_length=10,
                )),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('household', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='memberships',
                    to='users.household',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='memberships',
                    to='users.user',
                )),
            ],
            options={
                'unique_together': {('user', 'household')},
            },
        ),
    ]
