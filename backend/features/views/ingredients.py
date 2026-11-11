"""Shared ingredient catalog."""

from collections import Counter

from django.db import transaction
from django.db.models import Count
from django.db.models.deletion import ProtectedError
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.api_errors import api_error
from users.models import HouseholdMembership

from ..ingredient_units import normalize_name
from ..models import Ingredient, RecipeIngredient
from ..serializers import IngredientSerializer
from .common import HasActiveHousehold


class CanEditIngredientCatalog(permissions.BasePermission):
    """The ingredient catalog is shared by all WGs.

    Reading needs a login; changing it needs an active WG membership, and
    deleting needs the owner or admin role in that WG (or staff).
    """
    message = 'Nur WG-Mitglieder dürfen den Zutatenkatalog ändern; löschen dürfen nur Admins.'

    def has_permission(self, request, view):
        user = request.user
        if not user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS or user.is_staff:
            return True
        memberships = HouseholdMembership.objects.filter(
            user=user, household_id=user.active_household_id
        )
        if request.method == 'DELETE':
            memberships = memberships.filter(role__in=('owner', 'admin'))
        return bool(user.active_household_id) and memberships.exists()


class IngredientListView(generics.ListCreateAPIView):
    permission_classes = [CanEditIngredientCatalog]
    serializer_class = IngredientSerializer
    queryset = Ingredient.objects.annotate(usage_count=Count('recipe_rows__recipe', distinct=True))

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        result = self.get_serializer(self.get_queryset().get(pk=instance.pk))
        return Response({'data': result.data}, status=status.HTTP_201_CREATED)


class IngredientDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [CanEditIngredientCatalog]
    serializer_class = IngredientSerializer
    queryset = Ingredient.objects.annotate(usage_count=Count('recipe_rows__recipe', distinct=True))
    lookup_field = 'id'

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        result = self.get_serializer(self.get_queryset().get(pk=instance.pk))
        return Response({'data': result.data})

    def destroy(self, request, *args, **kwargs):
        try:
            self.get_object().delete()
        except ProtectedError:
            return api_error('Diese Zutat wird in Rezepten verwendet. Bitte archivieren statt löschen.', status.HTTP_409_CONFLICT)
        return Response({'success': True}, status=status.HTTP_200_OK)


class UnlinkedIngredientsView(APIView):
    """Freely typed recipe ingredients of the active WG that are not in the catalog yet."""
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def get(self, request):
        groups = {}
        rows = RecipeIngredient.objects.filter(
            recipe__household=request.user.active_household, ingredient__isnull=True
        ).values('name', 'unit', 'recipe__name')
        for row in rows:
            name = ' '.join(row['name'].split())
            if not name:
                continue
            group = groups.setdefault(normalize_name(name), {'name': name, 'units': Counter(), 'recipes': set()})
            if row['unit']:
                group['units'][row['unit']] += 1
            group['recipes'].add(row['recipe__name'])
        data = [{
            'name': group['name'],
            'suggestedUnit': group['units'].most_common(1)[0][0] if group['units'] else '',
            'recipes': sorted(group['recipes'], key=str.casefold),
            'usageCount': len(group['recipes']),
        } for group in groups.values()]
        data.sort(key=lambda item: (-item['usageCount'], item['name'].casefold()))
        return Response({'data': data})


class MergeIngredientView(APIView):
    """Fold a duplicate catalog entry into another one, e.g. "Zwiebeln" into "Zwiebel".

    Every recipe that used the duplicate then points at the target, and the
    duplicate is removed. The catalog is shared, so this needs WG owner/admin.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, id):
        user = request.user
        allowed = user.is_staff or (user.active_household_id and HouseholdMembership.objects.filter(
            user=user, household_id=user.active_household_id, role__in=('owner', 'admin')).exists())
        if not allowed:
            return api_error('Zusammenführen dürfen nur WG-Admins.', status.HTTP_403_FORBIDDEN)
        target_id = request.data.get('targetId')
        if isinstance(target_id, bool) or not isinstance(target_id, int):
            return api_error('Bitte die Zielzutat wählen.', status.HTTP_400_BAD_REQUEST)
        if target_id == id:
            return api_error('Eine Zutat kann nicht mit sich selbst zusammengeführt werden.',
                             status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            source = Ingredient.objects.select_for_update().filter(pk=id).first()
            target = Ingredient.objects.select_for_update().filter(pk=target_id).first()
            if not source or not target:
                return api_error('Zutat nicht gefunden.', status.HTTP_404_NOT_FOUND)
            moved = RecipeIngredient.objects.filter(ingredient=source).update(ingredient=target, name=target.name)
            source.delete()
        result = IngredientSerializer(
            Ingredient.objects.annotate(usage_count=Count('recipe_rows__recipe', distinct=True)).get(pk=target.pk))
        return Response({'data': result.data, 'movedCount': moved})
