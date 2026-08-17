from django.contrib import admin
from .models import (
    Ingredient,
    Todo,
    ShoppingItem,
    Recipe,
    Menu,
    MenuRating,
    HouseholdMember,
    MemberAvailability,
    CalendarEvent,
    Guest,
    SmartDevice,
    WeatherLocation,
)


@admin.register(Ingredient)
class IngredientAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'subcategory', 'default_unit')
    list_filter = ('category', 'subcategory')
    search_fields = ('name', 'subcategory')


@admin.register(Todo)
class TodoAdmin(admin.ModelAdmin):
    list_display = ("title", "household", "done", "start_date", "due_date", "progress", "duration_minutes", "global_todo",
                    "id")
    list_filter = ("done", "global_todo")
    search_fields = ("title",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ShoppingItem)
class ShoppingItemAdmin(admin.ModelAdmin):
    list_display = ("name", "household", "quantity", "unit", "checked", "global_item", "id")
    list_filter = ("checked", "global_item")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ("name", "household", "duration_minutes", "updated_at", "id")
    search_fields = ("name", "description")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ("date", "household", "lunch_recipe", "dinner_recipe", "lunch_persons", "dinner_persons", "id")
    list_filter = ("date",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(MenuRating)
class MenuRatingAdmin(admin.ModelAdmin):
    list_display = (
        "menu", "ease_rating", "price_performance_rating", "taste_rating", "cooking_duration_minutes", "id"
    )
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(HouseholdMember)
class HouseholdMemberAdmin(admin.ModelAdmin):
    list_display = ("name", "household", "linked_user", "is_active", "updated_at", "id")
    list_filter = ("is_active",)
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(MemberAvailability)
class MemberAvailabilityAdmin(admin.ModelAdmin):
    list_display = ("member", "date", "lunch_present", "dinner_present", "id")
    list_filter = ("date", "lunch_present", "dinner_present")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(CalendarEvent)
class CalendarEventAdmin(admin.ModelAdmin):
    list_display = ("title", "household", "start", "end", "all_day", "location", "id")
    list_filter = ("all_day",)
    search_fields = ("title", "location")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = ("first_name", "last_name", "household", "email", "phone", "updated_at", "id")
    search_fields = ("first_name", "last_name", "email")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(SmartDevice)
class SmartDeviceAdmin(admin.ModelAdmin):
    list_display = ("name", "device_type", "room", "household", "updated_at", "id")
    search_fields = ("name", "device_type", "room")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(WeatherLocation)
class WeatherLocationAdmin(admin.ModelAdmin):
    list_display = ("name", "latitude", "longitude", "user", "id")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")
