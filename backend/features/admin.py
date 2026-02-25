from django.contrib import admin
from .models import (
    NoteCategory, Note,
    Todo,
    ShoppingItem,
    Recipe,
    Menu,
    CalendarEvent,
    Guest,
    SmartDevice,
    WeatherLocation,
)


@admin.register(NoteCategory)
class NoteCategoryAdmin(admin.ModelAdmin):
    list_display = ("title", "parent", "order", "id")
    search_fields = ("title",)
    readonly_fields = ("id",)


@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "category", "global_note", "updated_at", "id")
    list_filter = ("global_note", "category")
    search_fields = ("title", "content")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Todo)
class TodoAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "done", "start_date", "due_date", "progress", "duration_minutes", "global_todo",
                    "id")
    list_filter = ("done", "global_todo")
    search_fields = ("title",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ShoppingItem)
class ShoppingItemAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "quantity", "unit", "checked", "global_item", "id")
    list_filter = ("checked", "global_item")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "duration_minutes", "updated_at", "id")
    search_fields = ("name", "description")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = ("date", "user", "lunch_recipe", "dinner_recipe", "id")
    list_filter = ("date",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(CalendarEvent)
class CalendarEventAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "start", "end", "all_day", "location", "id")
    list_filter = ("all_day",)
    search_fields = ("title", "location")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(Guest)
class GuestAdmin(admin.ModelAdmin):
    list_display = ("first_name", "last_name", "user", "email", "phone", "updated_at", "id")
    search_fields = ("first_name", "last_name", "email")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(SmartDevice)
class SmartDeviceAdmin(admin.ModelAdmin):
    list_display = ("name", "device_type", "room", "user", "updated_at", "id")
    search_fields = ("name", "device_type", "room")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(WeatherLocation)
class WeatherLocationAdmin(admin.ModelAdmin):
    list_display = ("name", "latitude", "longitude", "user", "id")
    search_fields = ("name",)
    readonly_fields = ("id", "created_at", "updated_at")
