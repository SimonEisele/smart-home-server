from django.db import models, transaction
from django.db.models import Q
from .ingredient_units import normalize_name
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
    quantity_incomplete = models.BooleanField(default=False)
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
    normalized_name = models.CharField(max_length=200, unique=True, editable=False)
    archived = models.BooleanField(default=False)

    class Meta:
        ordering = ['category', 'name']

    def save(self, *args, **kwargs):
        self.name = ' '.join(self.name.split())
        self.normalized_name = normalize_name(self.name)
        if kwargs.get('update_fields') is not None:
            kwargs['update_fields'] = set(kwargs['update_fields']) | {'normalized_name', 'name'}
        with transaction.atomic():
            super().save(*args, **kwargs)
            # Link previously free entries when their ingredient is added to the catalog.
            for row in RecipeIngredient.objects.filter(ingredient__isnull=True).only('id', 'name'):
                if normalize_name(row.name) == self.normalized_name:
                    RecipeIngredient.objects.filter(pk=row.pk).update(ingredient=self)

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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def ingredients(self):
        if hasattr(self, '_pending_ingredients'):
            return self._pending_ingredients
        rows = self.ingredient_rows.all()
        if 'ingredient_rows' not in getattr(self, '_prefetched_objects_cache', {}):
            rows = rows.select_related('ingredient', 'section_ref')
        return [row.as_dict() for row in rows]

    @ingredients.setter
    def ingredients(self, value):
        # Keep the existing API/import shape; quantities are stored as relational rows.
        self._pending_ingredients = value or []

    @property
    def sections(self):
        if hasattr(self, '_pending_sections'):
            return self._pending_sections
        return [{'id': row.key, 'title': row.title} for row in self.section_rows.all()]

    @sections.setter
    def sections(self, value):
        self._pending_sections = value or []

    @property
    def steps(self):
        if hasattr(self, '_pending_steps'):
            return self._pending_steps
        rows = self.step_rows.all()
        if 'step_rows' not in getattr(self, '_prefetched_objects_cache', {}):
            rows = rows.select_related('section').prefetch_related('ingredient_links__recipe_ingredient__ingredient')
        return [row.as_dict() for row in rows]

    @steps.setter
    def steps(self, value):
        self._pending_steps = value or []

    @property
    def side_notes(self):
        if hasattr(self, '_pending_side_notes'):
            return self._pending_side_notes
        return [{'label': row.label, 'value': row.value} for row in self.note_rows.all()]

    @side_notes.setter
    def side_notes(self, value):
        self._pending_side_notes = value or []

    def save(self, *args, **kwargs):
        from .recipe_data import save_contents
        with transaction.atomic():
            super().save(*args, **kwargs)
            save_contents(self)


class RecipeIngredient(models.Model):
    """One amount in a recipe's base batch; a catalog item never owns a quantity."""
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='ingredient_rows')
    ingredient = models.ForeignKey(Ingredient, null=True, blank=True, on_delete=models.PROTECT, related_name='recipe_rows')
    name = models.CharField(max_length=100)  # fallback for freely entered recipe ingredients
    quantity = models.FloatField(null=True, blank=True)
    unit = models.CharField(max_length=20, blank=True)
    position = models.PositiveIntegerField()
    key = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    section_ref = models.ForeignKey('RecipeSection', null=True, blank=True, on_delete=models.SET_NULL, related_name='ingredients')

    @property
    def section_id(self):
        return self.section_ref.key if self.section_ref_id else None

    class Meta:
        ordering = ['position']
        constraints = [
            models.UniqueConstraint(fields=['recipe', 'position'], name='unique_recipe_ingredient_position'),
            models.CheckConstraint(condition=Q(quantity__isnull=True) | Q(quantity__gte=0), name='recipe_ingredient_nonnegative_quantity'),
        ]

    def as_dict(self):
        row = {'id': str(self.key), 'name': self.ingredient.name if self.ingredient_id else self.name,
               'quantityPerPerson': self.quantity, 'unit': self.unit}
        if self.ingredient_id:
            row['ingredientId'] = self.ingredient_id
        if self.section_id is not None:
            row['sectionId'] = self.section_id
        return row


class RecipeSection(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='section_rows')
    key = models.BigIntegerField()
    title = models.CharField(max_length=150)
    position = models.PositiveIntegerField()

    class Meta:
        ordering = ['position']
        constraints = [models.UniqueConstraint(fields=['recipe', 'key'], name='unique_recipe_section_key')]


class RecipeStep(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='step_rows')
    order = models.PositiveIntegerField()
    description = models.TextField()
    section = models.ForeignKey(RecipeSection, null=True, blank=True, on_delete=models.SET_NULL, related_name='steps')

    class Meta:
        ordering = ['order']
        constraints = [models.UniqueConstraint(fields=['recipe', 'order'], name='unique_recipe_step_order')]

    def as_dict(self):
        result = {'order': self.order, 'description': self.description,
                  'ingredients': [link.as_dict() for link in self.ingredient_links.all()]}
        if self.section_id:
            result['sectionId'] = self.section.key
        return result


class RecipeStepIngredient(models.Model):
    step = models.ForeignKey(RecipeStep, on_delete=models.CASCADE, related_name='ingredient_links')
    recipe_ingredient = models.ForeignKey(RecipeIngredient, on_delete=models.CASCADE, related_name='step_links')
    quantity = models.FloatField(null=True, blank=True)  # null: use the recipe's total amount
    unit = models.CharField(max_length=20, blank=True)  # blank: use the recipe's unit
    position = models.PositiveIntegerField()

    class Meta:
        ordering = ['position']
        constraints = [
            models.UniqueConstraint(fields=['step', 'recipe_ingredient'], name='unique_step_ingredient'),
            models.CheckConstraint(condition=Q(quantity__isnull=True) | Q(quantity__gte=0), name='step_ingredient_nonnegative_quantity'),
        ]

    def as_dict(self):
        amount = self.recipe_ingredient
        result = {'recipeIngredientId': str(amount.key), 'name': amount.ingredient.name if amount.ingredient_id else amount.name,
                  'quantityPerPerson': self.quantity, 'unit': (self.unit or amount.unit) if self.quantity is not None else amount.unit}
        if amount.ingredient_id:
            result['ingredientId'] = amount.ingredient_id
        return result


class RecipeNote(models.Model):
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='note_rows')
    label = models.CharField(max_length=100)
    value = models.CharField(max_length=500)
    position = models.PositiveIntegerField()

    class Meta:
        ordering = ['position']


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

