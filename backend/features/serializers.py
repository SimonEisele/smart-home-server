import re
import math
from .ingredient_units import normalize_name, normalize_unit, UNITS
from django.db.models import Q
from django.db import IntegrityError, transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from .models import (
    CalendarEvent,
    CleaningLog,
    CleaningTask,
    ExternalMealGuest,
    HouseholdMember,
    Ingredient,
    MemberAvailability,
    Menu,
    MenuRating,
    Recipe,
    ShoppingItem,
    Todo,
    UserMealAttendance,
)


class IngredientSerializer(serializers.ModelSerializer):
    usageCount = serializers.IntegerField(source='usage_count', read_only=True, default=0)

    def create(self, validated_data):
        try:
            with transaction.atomic():
                return super().create(validated_data)
        except IntegrityError:
            raise serializers.ValidationError({'name': 'Diese Zutat ist bereits im Katalog vorhanden.'})

    def update(self, instance, validated_data):
        try:
            with transaction.atomic():
                return super().update(instance, validated_data)
        except IntegrityError:
            raise serializers.ValidationError({'name': 'Diese Zutat ist bereits im Katalog vorhanden.'})

    def validate_name(self, value):
        value = ' '.join(value.split())
        matches = Ingredient.objects.filter(normalized_name=normalize_name(value))
        if self.instance:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError('Diese Zutat ist bereits im Katalog vorhanden.')
        return value

    def validate_defaultUnit(self, value):
        value = normalize_unit(value)
        # Preserve existing custom units, but require a known spelling for new choices.
        if value not in UNITS and value != getattr(self.instance, 'default_unit', None):
            raise serializers.ValidationError('Bitte eine Einheit aus der Auswahl verwenden.')
        return value

    defaultUnit = serializers.CharField(source='default_unit', allow_blank=True, required=False, default='')

    class Meta:
        model = Ingredient
        fields = ['id', 'name', 'category', 'subcategory', 'defaultUnit', 'archived', 'usageCount']
        extra_kwargs = {
            'subcategory': {'allow_blank': True, 'required': False, 'default': ''},
        }


class TodoSerializer(serializers.ModelSerializer):
    startDate = serializers.DateTimeField(source='start_date', required=False, allow_null=True)
    dueDate = serializers.DateTimeField(source='due_date', required=False, allow_null=True)
    durationMinutes = serializers.IntegerField(source='duration_minutes', required=False, allow_null=True)
    recurrenceInterval = serializers.IntegerField(source='recurrence_interval', required=False)
    globalTodo = serializers.BooleanField(source='global_todo', required=False)
    progress = serializers.IntegerField(required=False, allow_null=True)
    createdBy = serializers.PrimaryKeyRelatedField(source='created_by', read_only=True)
    doneByName = serializers.SerializerMethodField()

    class Meta:
        model = Todo
        fields = [
            'id', 'title', 'description', 'priority', 'done', 'startDate', 'dueDate', 'progress',
            'durationMinutes', 'recurrence', 'recurrenceInterval', 'globalTodo', 'createdBy',
            'doneByName', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'createdBy', 'doneByName', 'created_at', 'updated_at']

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        due = attrs.get('due_date', getattr(self.instance, 'due_date', None))
        if start and due and start > due:
            raise serializers.ValidationError({'dueDate': 'Startdatum darf nicht nach der Fälligkeit liegen.'})
        duration = attrs.get('duration_minutes')
        if duration is not None and duration < 0:
            raise serializers.ValidationError({'durationMinutes': 'Dauer darf nicht negativ sein.'})
        progress = attrs.get('progress')
        if progress is not None and not 0 <= progress <= 100:
            raise serializers.ValidationError({'progress': 'Fortschritt muss zwischen 0 und 100 liegen.'})
        interval = attrs.get('recurrence_interval', getattr(self.instance, 'recurrence_interval', 1))
        if interval < 1:
            raise serializers.ValidationError({'recurrenceInterval': 'Intervall muss mindestens 1 sein.'})
        recurrence = attrs.get('recurrence', getattr(self.instance, 'recurrence', ''))
        if recurrence not in ('', 'daily', 'weekly', 'monthly'):
            raise serializers.ValidationError({'recurrence': 'Unbekannte Wiederholung.'})
        return attrs

    def get_doneByName(self, obj):
        if obj.done_by:
            return obj.done_by.first_name or obj.done_by.email
        return None


class RecipeIngredientSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    ingredientId = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    name = serializers.CharField(max_length=100)
    quantityPerPerson = serializers.FloatField(required=False, allow_null=True)
    unit = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    sectionId = serializers.IntegerField(required=False, allow_null=True)

    def validate_quantityPerPerson(self, value):
        if value is not None and (not math.isfinite(value) or value < 0):
            raise serializers.ValidationError('Die Menge muss eine endliche, nicht negative Zahl sein.')
        return value

    def validate(self, attrs):
        name = ' '.join(attrs['name'].split())
        identity = attrs.get('ingredientId')
        entry = Ingredient.objects.filter(pk=identity).first() if identity else Ingredient.objects.filter(normalized_name=normalize_name(name)).first()
        if identity and not entry:
            raise serializers.ValidationError({'ingredientId': 'Diese Zutat existiert nicht mehr.'})
        recipe = getattr(self.root, 'instance', None)
        if entry and entry.archived and (not recipe or not recipe.ingredient_rows.filter(ingredient=entry).exists()):
            raise serializers.ValidationError({'ingredientId': 'Diese Zutat ist archiviert. Bitte zuerst im Katalog aktivieren.'})
        attrs['name'] = entry.name if entry else name
        if entry:
            attrs['ingredientId'] = entry.id
        else:
            attrs.pop('ingredientId', None)
        attrs['unit'] = normalize_unit(attrs.get('unit'))
        return attrs


class RecipeStepIngredientSerializer(serializers.Serializer):
    recipeIngredientId = serializers.UUIDField(required=False)
    ingredientId = serializers.IntegerField(required=False, allow_null=True)
    name = serializers.CharField(max_length=100, required=False)
    quantityPerPerson = serializers.FloatField(required=False, allow_null=True)
    unit = serializers.CharField(max_length=20, allow_blank=True, required=False, default='')

    def validate_quantityPerPerson(self, value):
        if value is not None and (not math.isfinite(value) or value < 0):
            raise serializers.ValidationError('Die Schrittmenge muss eine endliche, nicht negative Zahl sein.')
        return value


class RecipeStepSerializer(serializers.Serializer):
    order = serializers.IntegerField(min_value=1)
    description = serializers.CharField()
    ingredients = RecipeStepIngredientSerializer(many=True, required=False, default=list)
    sectionId = serializers.IntegerField(required=False, allow_null=True)


class RecipeSectionSerializer(serializers.Serializer):
    id = serializers.IntegerField(min_value=1)
    title = serializers.CharField(max_length=150)


class RecipeNoteSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=100)
    value = serializers.CharField(max_length=500)


class RecipeSerializer(serializers.ModelSerializer):
    steps = RecipeStepSerializer(many=True, required=False)
    sections = RecipeSectionSerializer(many=True, required=False)
    sideNotes = RecipeNoteSerializer(source='side_notes', many=True, required=False)
    ingredients = RecipeIngredientSerializer(many=True, required=False)

    def validate(self, attrs):
        from uuid import uuid4
        from .models import RecipeIngredient
        base = attrs.get('base_servings', getattr(self.instance, 'base_servings', 4))
        units = attrs.get('units_per_person', getattr(self.instance, 'units_per_person', 1))
        duration = attrs.get('duration_minutes', getattr(self.instance, 'duration_minutes', None))
        serving_type = attrs.get('serving_type', getattr(self.instance, 'serving_type', 'Portionen'))
        if base < 1:
            raise serializers.ValidationError({'baseServings':'Bitte mindestens eine Basisportion angeben.'})
        if not math.isfinite(units) or units <= 0:
            raise serializers.ValidationError({'unitsPerPerson':'Portionen pro Person müssen positiv und endlich sein.'})
        if duration is not None and duration < 0:
            raise serializers.ValidationError({'durationMinutes':'Die Dauer darf nicht negativ sein.'})
        if serving_type not in ('Portionen', 'Stücke'):
            raise serializers.ValidationError({'servingType':'Bitte Portionen oder Stücke wählen.'})
        sections = attrs.get('sections', self.instance.sections if self.instance else [])
        section_ids = [value['id'] for value in sections]
        if len(section_ids) != len(set(section_ids)):
            raise serializers.ValidationError({'sections':'Abschnitts-IDs müssen eindeutig sein.'})
        ingredients = attrs.get('ingredients', self.instance.ingredients if self.instance else [])
        keys = set()
        previous = self.instance.ingredients if self.instance else []
        for value in ingredients:
            if not value.get('id'):
                matches = [old for old in previous if normalize_name(old['name']) == normalize_name(value['name'])]
                local = [old for old in matches if old.get('sectionId') == value.get('sectionId')]
                options = local or matches
                value['id'] = options[0]['id'] if len(options) == 1 else uuid4()
            identity = str(value['id'])
            if identity in keys:
                raise serializers.ValidationError({'ingredients':'Eine Zutatenposition darf nur einmal vorkommen.'})
            keys.add(identity)
            existing = RecipeIngredient.objects.filter(key=value['id']).first()
            if existing and (not self.instance or existing.recipe_id != self.instance.pk):
                raise serializers.ValidationError({'ingredients':'Diese Zutatenposition gehört zu einem anderen Rezept.'})
            if value.get('sectionId') is not None and value['sectionId'] not in section_ids:
                raise serializers.ValidationError({'ingredients':'Unbekannter Rezeptabschnitt.'})
        steps = attrs.get('steps', self.instance.steps if self.instance else [])
        orders = [step['order'] for step in steps]
        if len(orders) != len(set(orders)):
            raise serializers.ValidationError({'steps':'Schrittnummern müssen eindeutig sein.'})
        for step in steps:
            if step.get('sectionId') is not None and step['sectionId'] not in section_ids:
                raise serializers.ValidationError({'steps':'Unbekannter Rezeptabschnitt.'})
            used = set()
            for link in step.get('ingredients', []):
                identity = str(link.get('recipeIngredientId') or '')
                matches = [v for v in ingredients if str(v['id']) == identity] if identity else [v for v in ingredients if normalize_name(v['name']) == normalize_name(link.get('name', '')) or (v.get('ingredientId') and v.get('ingredientId') == link.get('ingredientId'))]
                if not identity:
                    local = [v for v in matches if v.get('sectionId') == step.get('sectionId')]
                    matches = local or matches
                if len(matches) != 1:
                    raise serializers.ValidationError({'steps':'Bitte jede Schrittzutat eindeutig aus den Zutaten dieses Rezepts wählen.'})
                value = matches[0]; identity = str(value['id'])
                if identity in used:
                    raise serializers.ValidationError({'steps':'Eine Zutat darf pro Schritt nur einmal verknüpft werden.'})
                used.add(identity)
                link['recipeIngredientId'] = value['id']
                link['name'] = value['name']
                link['unit'] = normalize_unit(link.get('unit'))
        # Persist canonical references together, even for partial updates.
        if any(name in attrs for name in ('ingredients', 'sections', 'steps')):
            attrs.update(ingredients=ingredients, sections=sections, steps=steps)
        return attrs

    durationMinutes = serializers.IntegerField(source='duration_minutes', required=False, allow_null=True)
    baseServings = serializers.IntegerField(source='base_servings', required=False)
    servingType = serializers.CharField(source='serving_type', required=False)
    unitsPerPerson = serializers.FloatField(source='units_per_person', required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = Recipe
        fields = [
            'id', 'name', 'description', 'instructions', 'durationMinutes',
            'baseServings', 'servingType', 'unitsPerPerson', 'category',
            'ingredients', 'steps', 'sections', 'sideNotes', 'createdAt', 'updatedAt'
        ]
        read_only_fields = ['id', 'createdAt', 'updatedAt']


class MenuRatingSerializer(serializers.ModelSerializer):
    cookingDurationMinutes = serializers.IntegerField(
        source='cooking_duration_minutes', required=False, allow_null=True
    )
    easeRating = serializers.IntegerField(source='ease_rating', required=False, allow_null=True)
    pricePerformanceRating = serializers.IntegerField(
        source='price_performance_rating', required=False, allow_null=True
    )
    tasteRating = serializers.IntegerField(source='taste_rating', required=False, allow_null=True)

    class Meta:
        model = MenuRating
        fields = [
            'cookingDurationMinutes', 'easeRating', 'pricePerformanceRating', 'tasteRating', 'notes'
        ]


class MenuSerializer(serializers.ModelSerializer):
    breakfastRecipeId = serializers.UUIDField(source='breakfast_recipe_id', required=False, allow_null=True)
    lunchRecipeId = serializers.UUIDField(source='lunch_recipe_id', required=False, allow_null=True)
    dinnerRecipeId = serializers.UUIDField(source='dinner_recipe_id', required=False, allow_null=True)
    breakfastLeftoversRef = serializers.CharField(source='breakfast_leftovers_ref', required=False, allow_null=True, allow_blank=True)
    lunchLeftoversRef = serializers.CharField(source='lunch_leftovers_ref', required=False, allow_null=True, allow_blank=True)
    dinnerLeftoversRef = serializers.CharField(source='dinner_leftovers_ref', required=False, allow_null=True, allow_blank=True)
    lunchPersons = serializers.IntegerField(source='lunch_persons', required=False)
    dinnerPersons = serializers.IntegerField(source='dinner_persons', required=False)
    breakfastPersons = serializers.IntegerField(source='breakfast_persons', required=False)
    extraRecipeIds = serializers.JSONField(source='extra_recipe_ids', required=False)
    rating = MenuRatingSerializer(required=False)

    class Meta:
        model = Menu
        fields = [
            'id', 'date',
            'breakfastRecipeId', 'lunchRecipeId', 'dinnerRecipeId',
            'breakfastLeftoversRef', 'lunchLeftoversRef', 'dinnerLeftoversRef',
            'breakfastPersons', 'lunchPersons', 'dinnerPersons', 'extraRecipeIds',
            'rating', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        household = self.context['request'].user.active_household
        for field in ('breakfast_recipe_id', 'lunch_recipe_id', 'dinner_recipe_id'):
            recipe_id = attrs.get(field)
            if recipe_id and not Recipe.objects.filter(id=recipe_id, household=household).exists():
                raise serializers.ValidationError({field: 'Recipe is not available in this household.'})
        extra_ids = attrs.get('extra_recipe_ids')
        if extra_ids is not None:
            if not isinstance(extra_ids, list):
                raise serializers.ValidationError({'extraRecipeIds': 'Expected a recipe list.'})
            for recipe_id in extra_ids:
                try:
                    available = Recipe.objects.filter(id=recipe_id, household=household).exists()
                except (ValueError, TypeError, DjangoValidationError):
                    available = False
                if not available:
                    raise serializers.ValidationError({'extraRecipeIds': 'Recipe is not available in this household.'})
        if self.instance:
            for meal in ('breakfast','lunch','dinner'):
                if meal+'_recipe_id' in attrs and attrs[meal+'_recipe_id'] is None and getattr(self.instance,meal+'_recipe_id'):
                    ref=f'{self.instance.date}:{meal}'
                    if Menu.objects.filter(household=household).filter(Q(breakfast_leftovers_ref=ref)|Q(lunch_leftovers_ref=ref)|Q(dinner_leftovers_ref=ref)).exists():
                        raise serializers.ValidationError({'detail':'Diese Mahlzeit wird noch für Reste verwendet. Entferne zuerst die zugehörigen Reste-Mahlzeiten.'})
        for meal in ('breakfast','lunch','dinner'):
            recipe_id = attrs.get(meal+'_recipe_id', getattr(self.instance,meal+'_recipe_id',None))
            ref = attrs.get(meal+'_leftovers_ref', getattr(self.instance,meal+'_leftovers_ref',None))
            if not ref: continue
            from .menu_export import safe_date
            parts = ref.split(':')
            source_date = safe_date(parts[0])
            target_date = attrs.get('date', getattr(self.instance,'date',None))
            order = ('breakfast','lunch','dinner')
            valid = len(parts)==2 and source_date and target_date and parts[1] in order
            if valid:
                valid = 0 <= (target_date-source_date).days <= 7 and (source_date<target_date or order.index(parts[1])<order.index(meal))
            if recipe_id or not valid:
                raise serializers.ValidationError({meal+'LeftoversRef':'Choose an earlier cooked meal within seven days.'})
            source = Menu.objects.filter(household=household,date=source_date).first()
            if not source or not getattr(source,parts[1]+'_recipe_id'):
                raise serializers.ValidationError({meal+'LeftoversRef':'The original recipe is no longer planned.'})
        return attrs

    def create(self, validated_data):
        rating_data = validated_data.pop('rating', None)
        instance = Menu.objects.create(**validated_data)
        if rating_data:
            MenuRating.objects.update_or_create(menu=instance, defaults=rating_data)
        return instance

    def update(self, instance, validated_data):
        rating_data = validated_data.pop('rating', None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if rating_data is not None:
            MenuRating.objects.update_or_create(menu=instance, defaults=rating_data)
        return instance

    def to_representation(self, instance):
        payload = super().to_representation(instance)
        payload['breakfastRecipe'] = RecipeSerializer(instance.breakfast_recipe).data if instance.breakfast_recipe else None
        payload['lunchRecipe'] = RecipeSerializer(instance.lunch_recipe).data if instance.lunch_recipe else None
        payload['dinnerRecipe'] = RecipeSerializer(instance.dinner_recipe).data if instance.dinner_recipe else None
        payload['rating'] = MenuRatingSerializer(instance.rating).data if hasattr(instance, 'rating') else None
        # Resolve extra recipe objects
        extra_ids = instance.extra_recipe_ids or []
        if extra_ids:
            from .models import Recipe as RecipeModel
            extras_qs = RecipeModel.objects.filter(id__in=[str(i) for i in extra_ids])
            payload['extraRecipes'] = RecipeSerializer(extras_qs, many=True).data
        else:
            payload['extraRecipes'] = []
        return payload


class ShoppingItemSerializer(serializers.ModelSerializer):
    imageUrl = serializers.URLField(source='image_url', required=False, allow_blank=True)
    globalItem = serializers.BooleanField(source='global_item', required=False)
    listType = serializers.CharField(source='list_type', required=False)
    weekTag = serializers.CharField(source='week_tag', required=False, allow_blank=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = ShoppingItem
        fields = [
            'id', 'name', 'quantity', 'unit', 'category', 'imageUrl', 'suggestion',
            'checked', 'globalItem', 'listType', 'weekTag', 'createdAt', 'updatedAt'
        ]
        read_only_fields = ['id', 'createdAt', 'updatedAt']


class CalendarEventSerializer(serializers.ModelSerializer):
    allDay = serializers.BooleanField(source='all_day', required=False)
    calendarType = serializers.ChoiceField(choices=CalendarEvent.CALENDAR_TYPE_CHOICES, source='calendar_type', required=False)
    todoRefId = serializers.UUIDField(source='todo_ref_id', required=False, allow_null=True)
    color = serializers.CharField(required=False, allow_blank=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = CalendarEvent
        fields = [
            'id', 'title', 'description', 'start', 'end', 'allDay', 'location',
            'calendarType', 'todoRefId', 'color', 'createdAt', 'updatedAt'
        ]
        read_only_fields = ['id', 'createdAt', 'updatedAt']

    def validate(self, attrs):
        start = attrs.get('start', getattr(self.instance, 'start', None))
        end = attrs.get('end', getattr(self.instance, 'end', None))
        if start and end and end < start:
            raise serializers.ValidationError({'end': 'End must not precede start.'})
        todo_id = attrs.get('todo_ref_id', getattr(self.instance, 'todo_ref_id', None))
        if todo_id:
            user = self.context['request'].user
            todo = Todo.objects.filter(id=todo_id, household=user.active_household).filter(
                Q(global_todo=True) | Q(created_by=user)
            ).first()
            if not todo:
                raise serializers.ValidationError({'todoRefId': 'Task is unavailable in this household.'})
            title = attrs.get('title', getattr(self.instance, 'title', ''))
            suffix = re.search(r' \(\d+/\d+\)$', title)
            attrs['title'] = todo.title + (suffix.group() if suffix else '')
            attrs['description'] = todo.description
            attrs['calendar_type'] = 'household' if todo.global_todo else 'private'
            # Private blocks belong to the same person as the private task.
            if not todo.global_todo:
                attrs['created_by'] = todo.created_by
        return attrs


class MemberAvailabilitySerializer(serializers.ModelSerializer):
    memberId = serializers.UUIDField(source='member_id')
    lunchPresent = serializers.BooleanField(source='lunch_present', required=False)
    dinnerPresent = serializers.BooleanField(source='dinner_present', required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = MemberAvailability
        fields = [
            'id', 'memberId', 'date', 'lunchPresent', 'dinnerPresent', 'note', 'createdAt', 'updatedAt'
        ]
        read_only_fields = ['id', 'createdAt', 'updatedAt']



class HouseholdMemberSerializer(serializers.ModelSerializer):
    availabilities = MemberAvailabilitySerializer(many=True, read_only=True)
    isActive = serializers.BooleanField(source='is_active', required=False)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = HouseholdMember
        fields = [
            'id', 'name', 'color', 'isActive', 'availabilities', 'createdAt', 'updatedAt'
        ]
        read_only_fields = ['id', 'createdAt', 'updatedAt']


class UserMealAttendanceSerializer(serializers.ModelSerializer):
    userId = serializers.UUIDField(source='user.id', read_only=True)
    userFirstName = serializers.CharField(source='user.first_name', read_only=True)
    userLastName = serializers.CharField(source='user.last_name', read_only=True)
    breakfastPresent = serializers.BooleanField(source='breakfast_present', required=False)
    lunchPresent = serializers.BooleanField(source='lunch_present', required=False)
    dinnerPresent = serializers.BooleanField(source='dinner_present', required=False)

    class Meta:
        model = UserMealAttendance
        fields = ['id', 'userId', 'userFirstName', 'userLastName', 'date', 'breakfastPresent', 'lunchPresent', 'dinnerPresent']
        read_only_fields = ['id', 'userId', 'userFirstName', 'userLastName']


class ExternalMealGuestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExternalMealGuest
        fields = ['id', 'name', 'date', 'meal', 'created_at']
        read_only_fields = ['id', 'created_at']


class CleaningLogSerializer(serializers.ModelSerializer):
    doneAt = serializers.DateField(source='done_at')
    doneBy = serializers.PrimaryKeyRelatedField(source='done_by', read_only=True)
    doneByName = serializers.SerializerMethodField()

    class Meta:
        model = CleaningLog
        fields = ['id', 'task', 'doneAt', 'doneBy', 'doneByName', 'note', 'created_at']
        read_only_fields = ['id', 'task', 'doneBy', 'doneByName', 'created_at']

    def get_doneByName(self, obj):
        if obj.done_by:
            return f"{obj.done_by.first_name} {obj.done_by.last_name}".strip() or obj.done_by.email
        return None


class CleaningTaskSerializer(serializers.ModelSerializer):
    intervalDays = serializers.IntegerField(source='interval_days')
    isActive = serializers.BooleanField(source='is_active', required=False)
    logs = CleaningLogSerializer(many=True, read_only=True)
    lastDoneAt = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    updatedAt = serializers.DateTimeField(source='updated_at', read_only=True)

    class Meta:
        model = CleaningTask
        fields = [
            'id', 'name', 'description', 'category', 'intervalDays', 'color',
            'isActive', 'logs', 'lastDoneAt', 'createdAt', 'updatedAt'
        ]
        read_only_fields = ['id', 'logs', 'lastDoneAt', 'createdAt', 'updatedAt']

    def get_lastDoneAt(self, obj):
        last_log = obj.logs.order_by('-done_at').first()
        return str(last_log.done_at) if last_log else None
