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
    defaultUnit = serializers.CharField(source='default_unit', allow_blank=True, required=False, default='')

    class Meta:
        model = Ingredient
        fields = ['id', 'name', 'category', 'subcategory', 'defaultUnit']
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

    def get_doneByName(self, obj):
        if obj.done_by:
            return obj.done_by.first_name or obj.done_by.email
        return None


class RecipeSerializer(serializers.ModelSerializer):
    durationMinutes = serializers.IntegerField(source='duration_minutes', required=False, allow_null=True)
    baseServings = serializers.IntegerField(source='base_servings', required=False)
    servingType = serializers.CharField(source='serving_type', required=False)
    unitsPerPerson = serializers.FloatField(source='units_per_person', required=False)
    sideNotes = serializers.JSONField(source='side_notes', required=False)
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
    calendarType = serializers.CharField(source='calendar_type', required=False)
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
