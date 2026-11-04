"""Shared ingredient catalog."""

from django.db.models import Count
from django.db.models.deletion import ProtectedError
from rest_framework import generics, permissions, status
from rest_framework.response import Response

from backend.api_errors import api_error
from users.models import HouseholdMembership

from ..models import Ingredient
from ..serializers import IngredientSerializer


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
