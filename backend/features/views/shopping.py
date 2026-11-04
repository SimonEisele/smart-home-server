"""Shopping list, suggestions and exports from recipes and the menu plan."""

import math
from datetime import timedelta

from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.api_errors import api_error

from ..models import Ingredient, Recipe, ShoppingItem
from ..serializers import ShoppingItemSerializer
from .common import HasActiveHousehold, recalculate_menu_persons_for_range


class ShoppingItemListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = ShoppingItemSerializer

    def get_queryset(self):
        queryset = ShoppingItem.objects.filter(household=self.request.user.active_household)
        category = self.request.query_params.get('category')
        checked = self.request.query_params.get('checked')
        list_type = self.request.query_params.get('listType')

        if category:
            queryset = queryset.filter(category__iexact=category)
        if checked in ['true', 'false']:
            queryset = queryset.filter(checked=(checked == 'true'))
        if list_type:
            queryset = queryset.filter(list_type=list_type)

        return queryset.order_by('checked', 'category', 'name')

    def perform_create(self, serializer):
        serializer.save(household=self.request.user.active_household)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)


class ClearCheckedShoppingItemsView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def post(self, request):
        ids = request.data.get('ids')
        if not isinstance(ids, list) or not ids or len(ids) > 1000:
            return api_error('Bitte 1 bis 1000 Artikel auswählen.', 400)
        import uuid
        try:
            ids = [uuid.UUID(str(value)) for value in ids]
        except (ValueError, TypeError, AttributeError):
            return api_error('Ungültige Artikelkennung.', 400)
        with transaction.atomic():
            items = ShoppingItem.objects.select_for_update().filter(household=request.user.active_household, id__in=ids, checked=True)
            deleted_ids = [str(value) for value in items.values_list('id', flat=True)]
            items.delete()
        return Response({'data': {'deletedIds': deleted_ids}})


class ShoppingItemDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = ShoppingItemSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return ShoppingItem.objects.filter(household=self.request.user.active_household)

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


class ShoppingSuggestionView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def get(self, request):
        query = request.query_params.get('q', '').strip().lower()
        base = ShoppingItem.objects.filter(household=request.user.active_household)
        if query:
            base = base.filter(name__icontains=query)

        values = base.values('name', 'unit', 'category', 'image_url').order_by('name').distinct()[:20]
        suggestions = [
            {
                'name': item['name'],
                'unit': item['unit'],
                'category': item['category'],
                'imageUrl': item['image_url'],
            }
            for item in values
        ]
        return Response({"data": suggestions})


class AddRecipeToShoppingListView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def post(self, request):
        recipe_id = request.data.get('recipeId')
        from django.core.exceptions import ValidationError as DjangoValidationError
        persons = request.data.get('persons', 2)
        try:
            number = float(persons)
            if isinstance(persons, bool) or not math.isfinite(number) or number < 1 or not number.is_integer():
                raise ValueError
            persons = int(number)
        except (TypeError, ValueError, OverflowError):
            return api_error('Personen müssen eine positive ganze Zahl sein.', status.HTTP_400_BAD_REQUEST)

        try:
            recipe = Recipe.objects.get(id=recipe_id, household=request.user.active_household)
        except (Recipe.DoesNotExist, ValueError, DjangoValidationError):
            return api_error('Rezept nicht gefunden.', status.HTTP_404_NOT_FOUND)

        try:
            units_per_person = float(request.data.get('unitsPerPerson', 1))
        except (TypeError, ValueError):
            return api_error('Portionen pro Person müssen eine positive Zahl sein.', status.HTTP_400_BAD_REQUEST)
        if isinstance(request.data.get('unitsPerPerson'), bool) or not math.isfinite(units_per_person) or units_per_person <= 0:
            return api_error('Portionen pro Person müssen eine positive Zahl sein.', status.HTTP_400_BAD_REQUEST)
        base_servings = recipe.base_servings or persons or 2
        scale = persons * units_per_person / base_servings
        if not math.isfinite(scale):
            return api_error('Die gewünschte Menge ist zu groß.', 400)
        for ing in recipe.ingredients:
            qty = ing.get('quantityPerPerson')
            if qty is not None and not math.isfinite(qty * scale):
                return api_error('Die berechnete Zutatenmenge ist zu groß.', 400)

        cat_display = dict(Ingredient.CATEGORY_CHOICES)
        ing_catalog = {i.name.lower(): i for i in Ingredient.objects.all()}

        created = []
        with transaction.atomic():
            for ing in (recipe.ingredients or []):
                name = (ing.get('name') or '').strip()
                if not name:
                    continue
                qty_raw = ing.get('quantityPerPerson', ing.get('quantity_per_person'))
                try:
                    qty = float(qty_raw) * scale if qty_raw is not None else None
                except (TypeError, ValueError):
                    qty = None
                unit = (ing.get('unit') or '').strip()
                catalog_entry = ing_catalog.get(name.lower())
                category = cat_display.get(catalog_entry.category, catalog_entry.category) if catalog_entry else 'Sonstiges'
                item = ShoppingItem.objects.create(
                    household=request.user.active_household,
                    name=name,
                    quantity=round(qty, 3) if qty is not None else None,
                    quantity_incomplete=qty is None,
                    unit=unit,
                    category=category,
                    suggestion=recipe.name,
                    list_type='manual',
                )
                created.append(item)

        serializer = ShoppingItemSerializer(created, many=True)
        return Response({'data': serializer.data, 'count': len(created)}, status=status.HTTP_201_CREATED)


class ExportWeekToShoppingListView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def post(self, request):
        from ..menu_export import build_export, commit_export, safe_date
        payload = request.data
        # New weekly preview and export use current attendance, not browser-supplied totals.
        if payload.get('strict') and payload.get('weekStart'):
            start = safe_date(payload['weekStart'])
            if start:
                recalculate_menu_persons_for_range(request.user.active_household, start, start+timedelta(days=13))
        plan = build_export(request.user.active_household, payload)
        if payload.get('dryRun') is True:
            return Response(plan)
        if payload.get('previewToken') and payload['previewToken'] != plan['previewToken']:
            return api_error('Der Menüplan oder die Anwesenheiten haben sich geändert. Bitte die Vorschau neu laden.', 409)
        if payload.get('strict') and plan['blocked']:
            return api_error('Bitte die Hinweise in der Vorschau prüfen.', 400, details={'warnings': plan['warnings']})
        saved = commit_export(request.user.active_household, plan, payload.get('resetExisting') is True)
        return Response({'data':ShoppingItemSerializer(saved,many=True).data,'count':len(saved),'weekTag':plan['weekTag'],'warnings':plan['warnings']})
