"""Recipes of the active household."""

from django.db import transaction
from rest_framework import generics, permissions
from rest_framework.response import Response

from ..models import Menu, Recipe
from ..serializers import RecipeSerializer
from .common import HasActiveHousehold, RECIPE_PREFETCH


class RecipeListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = RecipeSerializer

    def get_queryset(self):
        return Recipe.objects.filter(household=self.request.user.active_household).prefetch_related(*RECIPE_PREFETCH).order_by('name')

    def perform_create(self, serializer):
        serializer.save(household=self.request.user.active_household)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)


class RecipeDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = RecipeSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return Recipe.objects.filter(household=self.request.user.active_household).prefetch_related(*RECIPE_PREFETCH)

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def perform_destroy(self, instance):
        with transaction.atomic():
            remove_recipe_from_menus(instance)
            instance.delete()

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


MEALS = ('breakfast', 'lunch', 'dinner')


def remove_recipe_from_menus(recipe):
    """Drop a deleted recipe's extras and the leftover meals that pointed at it.

    The meal slots themselves are cleared by the foreign key (SET_NULL); without
    this, extras and "Reste" entries would keep referring to a missing dish.
    """
    menus = list(Menu.objects.select_for_update().filter(household_id=recipe.household_id))
    recipe_id = str(recipe.id)
    cooked = {f'{menu.date}:{meal}' for menu in menus for meal in MEALS
              if str(getattr(menu, meal + '_recipe_id') or '') == recipe_id}
    for menu in menus:
        changed = []
        extras = [i for i in menu.extra_recipe_ids or [] if str(i) != recipe_id]
        if extras != (menu.extra_recipe_ids or []):
            menu.extra_recipe_ids = extras
            changed.append('extra_recipe_ids')
        for meal in MEALS:
            if getattr(menu, meal + '_leftovers_ref') in cooked:
                setattr(menu, meal + '_leftovers_ref', None)
                changed.append(meal + '_leftovers_ref')
        if changed:
            menu.save(update_fields=changed + ['updated_at'])
