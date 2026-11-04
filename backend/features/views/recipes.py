"""Recipes of the active household."""

from rest_framework import generics, permissions
from rest_framework.response import Response

from ..models import Recipe
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

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})
