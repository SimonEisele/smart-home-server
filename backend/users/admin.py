from django.contrib import admin
from .models import User, DashboardItem


class DashboardItemInline(admin.TabularInline):
    model = DashboardItem
    extra = 0
    readonly_fields = ('id',)
    fields = ('title', 'widget_type', 'x', 'y', 'cols', 'rows')


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'first_name', 'last_name', 'id', 'is_staff', 'is_active')
    readonly_fields = ('id',)
    inlines = [DashboardItemInline]
