from django.db import models
from django.conf import settings
import uuid


User = settings.AUTH_USER_MODEL
Household = 'users.Household'


# Todos
class Todo(models.Model):
    PRIORITY_CHOICES = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='todos')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    priority = models.CharField(max_length=8, choices=PRIORITY_CHOICES, default='medium')
    done = models.BooleanField(default=False)
    start_date = models.DateTimeField(null=True, blank=True)
    due_date = models.DateTimeField(null=True, blank=True)
    progress = models.IntegerField(null=True, blank=True)
    duration_minutes = models.IntegerField(null=True, blank=True)
    recurrence = models.CharField(max_length=16, blank=True)  # '', daily, weekly, monthly
    recurrence_interval = models.IntegerField(default=1)
    global_todo = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_todos')
    done_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='completed_todos')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# Shopping List
class ShoppingItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='shopping_items')
    name = models.CharField(max_length=200)
    quantity = models.FloatField(null=True, blank=True)
    unit = models.CharField(max_length=32, blank=True)
    category = models.CharField(max_length=80, blank=True)
    image_url = models.URLField(blank=True)
    suggestion = models.CharField(max_length=240, blank=True)
    checked = models.BooleanField(default=False)
    global_item = models.BooleanField(default=False)
    list_type = models.CharField(max_length=20, default='manual')  # 'manual', 'menuplan'
    week_tag = models.CharField(max_length=20, blank=True)  # e.g. '2026-W27'
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# Ingredient Catalog (global, not per-household)
class Ingredient(models.Model):
    CATEGORY_CHOICES = [
        ('gemuese', 'Gemüse'),
        ('obst', 'Obst'),
        ('fleisch', 'Fleisch & Fisch'),
        ('milch', 'Milchprodukte'),
        ('getreide', 'Getreide & Backwaren'),
        ('huelsenfruechte', 'Hülsenfrüchte'),
        ('gewuerze', 'Gewürze & Kräuter'),
        ('oele', 'Öle & Fette'),
        ('saucen', 'Saucen & Konserven'),
        ('sonstiges', 'Sonstiges'),
    ]
    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='sonstiges')
    subcategory = models.CharField(max_length=100, blank=True)
    default_unit = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ['category', 'name']

    def __str__(self):
        return self.name


# Recipes
class Recipe(models.Model):
    CATEGORY_CHOICES = [
        ('mahlzeit', 'Mahlzeit'),
        ('dessert', 'Dessert'),
        ('backen', 'Backen'),
        ('snack', 'Snack'),
        ('beilage', 'Beilage'),
        ('sonstiges', 'Sonstiges'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='recipes')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    instructions = models.TextField(blank=True)
    duration_minutes = models.IntegerField(null=True, blank=True)
    base_servings = models.IntegerField(default=4)
    serving_type = models.CharField(max_length=20, default='Portionen')  # 'Portionen' | 'Stücke'
    units_per_person = models.FloatField(default=1.0)  # how many servings/pieces per person
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='mahlzeit')
    ingredients = models.JSONField(default=list, blank=True)  # [{name, quantityPerPerson, unit, sectionId?}]
    steps = models.JSONField(default=list, blank=True)  # [{order, description, ingredients, sectionId?}]
    sections = models.JSONField(default=list, blank=True)  # [{id, title}]
    side_notes = models.JSONField(default=list, blank=True)  # [{label, value}]
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# Menu Plan
class Menu(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='menus')
    date = models.DateField()
    breakfast_recipe = models.ForeignKey(Recipe, null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='breakfast_menus')
    lunch_recipe = models.ForeignKey(Recipe, null=True, blank=True, on_delete=models.SET_NULL,
                                     related_name='lunch_menus')
    dinner_recipe = models.ForeignKey(Recipe, null=True, blank=True, on_delete=models.SET_NULL,
                                      related_name='dinner_menus')
    breakfast_leftovers_ref = models.CharField(max_length=60, blank=True, null=True)  # 'YYYY-MM-DD:meal'
    lunch_leftovers_ref = models.CharField(max_length=60, blank=True, null=True)
    dinner_leftovers_ref = models.CharField(max_length=60, blank=True, null=True)
    lunch_persons = models.IntegerField(default=0)
    dinner_persons = models.IntegerField(default=0)
    breakfast_persons = models.IntegerField(default=0)
    extra_recipe_ids = models.JSONField(default=list, blank=True)  # list of Recipe UUID strings
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['household', 'date'], name='unique_menu_per_household_date')
        ]


class MenuRating(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    menu = models.OneToOneField(Menu, on_delete=models.CASCADE, related_name='rating')
    cooking_duration_minutes = models.IntegerField(null=True, blank=True)
    ease_rating = models.IntegerField(null=True, blank=True)  # 1..5
    price_performance_rating = models.IntegerField(null=True, blank=True)  # 1..5
    taste_rating = models.IntegerField(null=True, blank=True)  # 1..5
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class HouseholdMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='household_members')
    linked_user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='household_member_profiles')
    name = models.CharField(max_length=120)
    color = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class MemberAvailability(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    member = models.ForeignKey(HouseholdMember, on_delete=models.CASCADE, related_name='availabilities')
    date = models.DateField()
    lunch_present = models.BooleanField(default=True)
    dinner_present = models.BooleanField(default=True)
    note = models.CharField(max_length=220, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['member', 'date'], name='unique_member_availability_per_day')
        ]


# Cleaning Tasks
class CleaningTask(models.Model):
    CATEGORY_CHOICES = [
        ('bathroom', 'Bad'),
        ('kitchen', 'Küche'),
        ('living_room', 'Wohnzimmer'),
        ('bedroom', 'Schlafzimmer'),
        ('hallway', 'Flur / Eingang'),
        ('other', 'Sonstiges'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='cleaning_tasks')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='other')
    interval_days = models.IntegerField(default=7)
    color = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class CleaningLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(CleaningTask, on_delete=models.CASCADE, related_name='logs')
    done_at = models.DateField()
    done_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='cleaning_logs')
    note = models.CharField(max_length=400, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


# Calendar
class CalendarEvent(models.Model):
    CALENDAR_TYPE_CHOICES = [('household', 'WG'), ('private', 'Privat')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='calendar_events')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='private_calendar_events')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    start = models.DateTimeField()
    end = models.DateTimeField(null=True, blank=True)
    all_day = models.BooleanField(default=False)
    location = models.CharField(max_length=200, blank=True)
    calendar_type = models.CharField(max_length=20, choices=CALENDAR_TYPE_CHOICES, default='household')
    todo_ref_id = models.UUIDField(null=True, blank=True)
    color = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# Meal attendance (per user, per day, lunch + dinner)
class UserMealAttendance(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='meal_attendances')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='meal_attendances')
    date = models.DateField()
    breakfast_present = models.BooleanField(default=False)
    lunch_present = models.BooleanField(default=True)
    dinner_present = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['household', 'user', 'date'], name='unique_user_meal_attendance')
        ]


# External meal guests (non-WG persons for a specific day+meal)
class ExternalMealGuest(models.Model):
    MEAL_CHOICES = [('breakfast', 'Frühstück'), ('lunch', 'Mittag'), ('dinner', 'Abendessen')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='external_meal_guests')
    name = models.CharField(max_length=100)
    date = models.DateField()
    meal = models.CharField(max_length=12, choices=MEAL_CHOICES)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name='added_meal_guests')
    created_at = models.DateTimeField(auto_now_add=True)


# Guests
class Guest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='guests')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# Smart Home Devices
class SmartDevice(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    household = models.ForeignKey(Household, on_delete=models.CASCADE, related_name='smart_devices')
    name = models.CharField(max_length=120)
    device_type = models.CharField(max_length=80)
    room = models.CharField(max_length=80, blank=True)
    state = models.JSONField(default=dict, blank=True)  # arbitrary device state
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# Weather preferences (per-user / personal setting)
class WeatherLocation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='weather_locations')
    name = models.CharField(max_length=120)
    latitude = models.FloatField()
    longitude = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

