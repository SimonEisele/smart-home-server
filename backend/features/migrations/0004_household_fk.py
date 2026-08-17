import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def create_households_for_users(apps, schema_editor):
    """
    For each existing user, create a Household and migrate all their feature data to it.
    """
    User = apps.get_model('users', 'User')
    Household = apps.get_model('users', 'Household')
    HouseholdMembership = apps.get_model('users', 'HouseholdMembership')

    Todo = apps.get_model('features', 'Todo')
    ShoppingItem = apps.get_model('features', 'ShoppingItem')
    Recipe = apps.get_model('features', 'Recipe')
    Menu = apps.get_model('features', 'Menu')
    NoteCategory = apps.get_model('features', 'NoteCategory')
    Note = apps.get_model('features', 'Note')
    CalendarEvent = apps.get_model('features', 'CalendarEvent')
    Guest = apps.get_model('features', 'Guest')
    SmartDevice = apps.get_model('features', 'SmartDevice')
    HouseholdMember = apps.get_model('features', 'HouseholdMember')

    for user in User.objects.all():
        hh = Household.objects.create(name="Meine WG", created_by=user)
        user.active_household = hh
        user.save(update_fields=['active_household'])
        HouseholdMembership.objects.create(user=user, household=hh, role='owner')

        Todo.objects.filter(user=user).update(household=hh)
        ShoppingItem.objects.filter(user=user).update(household=hh)
        Recipe.objects.filter(user=user).update(household=hh)
        Menu.objects.filter(user=user).update(household=hh)
        Note.objects.filter(user=user).update(household=hh)
        CalendarEvent.objects.filter(user=user).update(household=hh)
        Guest.objects.filter(user=user).update(household=hh)
        SmartDevice.objects.filter(user=user).update(household=hh)
        HouseholdMember.objects.filter(user=user).update(household=hh, linked_user=user)

    # NoteCategory has no user FK — assign to the first household, or delete orphans
    first_hh = Household.objects.first()
    if first_hh:
        NoteCategory.objects.filter(household__isnull=True).update(household=first_hh)
    else:
        NoteCategory.objects.filter(household__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('features', '0003_householdmember_memberavailability'),
        ('users', '0002_household'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── Step 1: Add nullable household FK to all feature models ──────────
        migrations.AddField(
            model_name='notecategory',
            name='household',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='note_categories', to='users.household',
            ),
        ),
        migrations.AddField(
            model_name='note',
            name='household',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='notes', to='users.household',
            ),
        ),
        migrations.AddField(
            model_name='todo',
            name='household',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='todos', to='users.household',
            ),
        ),
        migrations.AddField(
            model_name='shoppingitem',
            name='household',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='shopping_items', to='users.household',
            ),
        ),
        migrations.AddField(
            model_name='recipe',
            name='household',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='recipes', to='users.household',
            ),
        ),
        migrations.AddField(
            model_name='menu',
            name='household',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='menus', to='users.household',
            ),
        ),
        migrations.AddField(
            model_name='calendarevent',
            name='household',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='calendar_events', to='users.household',
            ),
        ),
        migrations.AddField(
            model_name='guest',
            name='household',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='guests', to='users.household',
            ),
        ),
        migrations.AddField(
            model_name='smartdevice',
            name='household',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='smart_devices', to='users.household',
            ),
        ),
        # HouseholdMember: add household FK + linked_user FK
        migrations.AddField(
            model_name='householdmember',
            name='household',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='household_members', to='users.household',
            ),
        ),
        migrations.AddField(
            model_name='householdmember',
            name='linked_user',
            field=models.ForeignKey(
                null=True, blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='household_member_profiles',
                to=settings.AUTH_USER_MODEL,
            ),
        ),

        # ── Step 2: Data migration ────────────────────────────────────────────
        migrations.RunPython(create_households_for_users, migrations.RunPython.noop),

        # ── Step 3: Make household non-nullable ──────────────────────────────
        migrations.AlterField(
            model_name='notecategory', name='household',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='note_categories', to='users.household'),
        ),
        migrations.AlterField(
            model_name='note', name='household',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='notes', to='users.household'),
        ),
        migrations.AlterField(
            model_name='todo', name='household',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='todos', to='users.household'),
        ),
        migrations.AlterField(
            model_name='shoppingitem', name='household',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='shopping_items', to='users.household'),
        ),
        migrations.AlterField(
            model_name='recipe', name='household',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='recipes', to='users.household'),
        ),
        migrations.AlterField(
            model_name='menu', name='household',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='menus', to='users.household'),
        ),
        migrations.AlterField(
            model_name='calendarevent', name='household',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='calendar_events', to='users.household'),
        ),
        migrations.AlterField(
            model_name='guest', name='household',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='guests', to='users.household'),
        ),
        migrations.AlterField(
            model_name='smartdevice', name='household',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='smart_devices', to='users.household'),
        ),
        migrations.AlterField(
            model_name='householdmember', name='household',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                    related_name='household_members', to='users.household'),
        ),

        # ── Step 4: Remove old user FK from models that no longer need it ────
        migrations.RemoveField(model_name='todo', name='user'),
        migrations.RemoveField(model_name='shoppingitem', name='user'),
        migrations.RemoveField(model_name='recipe', name='user'),
        migrations.RemoveField(model_name='calendarevent', name='user'),
        migrations.RemoveField(model_name='guest', name='user'),
        migrations.RemoveField(model_name='smartdevice', name='user'),
        migrations.RemoveField(model_name='householdmember', name='user'),

        # ── Step 5: Update Menu unique constraint ────────────────────────────
        migrations.RemoveConstraint(model_name='menu', name='unique_menu_per_user_date'),
        migrations.AddConstraint(
            model_name='menu',
            constraint=models.UniqueConstraint(
                fields=['household', 'date'], name='unique_menu_per_household_date'
            ),
        ),
        migrations.RemoveField(model_name='menu', name='user'),
    ]
