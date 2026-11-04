"""Shared permissions, querysets and helpers for the feature views."""

from datetime import timedelta

from rest_framework import permissions

from users.models import HouseholdMembership

from ..models import ExternalMealGuest, MemberAvailability, Menu, UserMealAttendance


class HasActiveHousehold(permissions.BasePermission):
    """The active household must be one the user is still a member of.

    `active_household` is only a preference; a user removed from a WG may still
    point at it, so membership is checked on every request.
    """
    message = 'Bitte zuerst eine WG erstellen oder einer WG beitreten.'

    def has_permission(self, request, view):
        user = request.user
        if not (user.is_authenticated and user.active_household_id):
            return False
        return HouseholdMembership.objects.filter(
            user=user, household_id=user.active_household_id
        ).exists()


# Everything RecipeSerializer reads; without it each recipe costs ~6 extra queries.
RECIPE_PREFETCH = (
    'ingredient_rows__ingredient', 'ingredient_rows__section_ref', 'section_rows', 'note_rows',
    'step_rows__section', 'step_rows__ingredient_links__recipe_ingredient__ingredient',
)


MENU_RECIPE_FIELDS = ('breakfast_recipe', 'lunch_recipe', 'dinner_recipe')


def menu_queryset(household):
    """Menus with their recipes fully loaded for MenuSerializer."""
    return Menu.objects.filter(household=household).select_related(
        *MENU_RECIPE_FIELDS, 'rating'
    ).prefetch_related(
        *(f'{field}__{path}' for field in MENU_RECIPE_FIELDS for path in RECIPE_PREFETCH)
    )


def _parse_bool(value):
    """Return True/False for JSON booleans and their common string forms, else None."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in ('true', 'false', '1', '0'):
        return value.strip().lower() in ('true', '1')
    if value in (0, 1):
        return bool(value)
    return None


def recalculate_menu_persons_for_range(household, week_start, week_end):
    """Recalculate per-meal person counts.
    Uses UserMealAttendance (calendar) + ExternalMealGuest as primary source,
    falls back to legacy MemberAvailability if no modern records exist for a day.
    """
    dates = [week_start + timedelta(days=i) for i in range((week_end - week_start).days + 1)]

    # Modern system: UserMealAttendance (set via calendar attendance panel)
    att_counts: dict = {}
    for a in UserMealAttendance.objects.filter(household=household, date__in=dates):
        d = a.date
        if d not in att_counts:
            att_counts[d] = {'breakfast': 0, 'lunch': 0, 'dinner': 0}
        if a.breakfast_present: att_counts[d]['breakfast'] += 1
        if a.lunch_present:     att_counts[d]['lunch']     += 1
        if a.dinner_present:    att_counts[d]['dinner']    += 1

    for g in ExternalMealGuest.objects.filter(household=household, date__in=dates):
        d = g.date
        if d not in att_counts:
            att_counts[d] = {'breakfast': 0, 'lunch': 0, 'dinner': 0}
        if g.meal in att_counts[d]:
            att_counts[d][g.meal] += 1

    # Legacy system: MemberAvailability (fallback when no modern records for a date)
    legacy: dict = {}
    for e in MemberAvailability.objects.filter(
        member__household=household, member__is_active=True, date__in=dates
    ).select_related('member'):
        d = e.date
        if d not in legacy:
            legacy[d] = {'lunch': 0, 'dinner': 0}
        if e.lunch_present:  legacy[d]['lunch']  += 1
        if e.dinner_present: legacy[d]['dinner'] += 1

    menus = Menu.objects.filter(household=household, date__gte=week_start, date__lte=week_end)
    for menu in menus:
        new = att_counts.get(menu.date, {})
        old = legacy.get(menu.date, {})
        # A recorded absence is authoritative; use legacy only without modern records.
        menu.breakfast_persons = new.get('breakfast', 0)
        menu.lunch_persons     = new['lunch'] if menu.date in att_counts else old.get('lunch', 0)
        menu.dinner_persons    = new['dinner'] if menu.date in att_counts else old.get('dinner', 0)
        menu.save(update_fields=['breakfast_persons', 'lunch_persons', 'dinner_persons', 'updated_at'])
