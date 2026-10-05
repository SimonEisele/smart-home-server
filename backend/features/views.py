import math
import re
from datetime import date, timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_date
from rest_framework.exceptions import PermissionDenied
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models import Q
from .models import (
    CalendarEvent,
    CleaningLog,
    CleaningTask,
    ExternalMealGuest,
    HouseholdMember,
    Ingredient,
    MemberAvailability,
    Menu,
    Recipe,
    ShoppingItem,
    Todo,
    UserMealAttendance,
)
from .serializers import (
    CalendarEventSerializer,
    CleaningLogSerializer,
    CleaningTaskSerializer,
    ExternalMealGuestSerializer,
    HouseholdMemberSerializer,
    MemberAvailabilitySerializer,
    MenuSerializer,
    IngredientSerializer,
    RecipeSerializer,
    ShoppingItemSerializer,
    TodoSerializer,
    UserMealAttendanceSerializer,
)


class HasActiveHousehold(permissions.BasePermission):
    message = 'Bitte zuerst eine WG erstellen oder einer WG beitreten.'

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and request.user.active_household_id)


class IngredientListView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = IngredientSerializer
    queryset = Ingredient.objects.all()

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'data': serializer.data}, status=status.HTTP_201_CREATED)


class IngredientDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = IngredientSerializer
    queryset = Ingredient.objects.all()
    lookup_field = 'id'

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'data': serializer.data})

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response({'success': True}, status=status.HTTP_200_OK)


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


class TodoListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = TodoSerializer

    def get_queryset(self):
        queryset = Todo.objects.filter(
            household=self.request.user.active_household
        ).filter(
            Q(global_todo=True) | Q(created_by=self.request.user)
        )
        visibility = self.request.query_params.get('visibility')
        if visibility == 'global':
            queryset = queryset.filter(global_todo=True)
        elif visibility == 'private':
            queryset = queryset.filter(global_todo=False, created_by=self.request.user)
        return queryset.order_by('-updated_at')

    def perform_create(self, serializer):
        serializer.save(household=self.request.user.active_household, created_by=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data})


class TodoDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = TodoSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return Todo.objects.filter(household=self.request.user.active_household).filter(
            Q(global_todo=True) | Q(created_by=self.request.user)
        )

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        done = serializer.validated_data.get('done', instance.done)
        done_by = (request.user if not instance.done else instance.done_by) if done else None
        # Validate the entire update before recording who completed it.
        with transaction.atomic():
            todo = serializer.save(done_by=done_by)
            for event in CalendarEvent.objects.filter(household=todo.household, todo_ref_id=todo.id):
                suffix = re.search(r' \(\d+/\d+\)$', event.title)
                event.title = todo.title + (suffix.group() if suffix else '')
                event.description = todo.description
                event.calendar_type = 'household' if todo.global_todo else 'private'
                if not todo.global_todo:
                    event.created_by = todo.created_by
                event.save(update_fields=['title', 'description', 'calendar_type', 'created_by', 'updated_at'])
        return Response({"data": serializer.data})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        CalendarEvent.objects.filter(
            household=request.user.active_household,
            todo_ref_id=instance.id
        ).delete()
        instance.delete()
        return Response({"success": True})


class RecipeListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = RecipeSerializer

    def get_queryset(self):
        return Recipe.objects.filter(household=self.request.user.active_household).order_by('name')

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
        return Recipe.objects.filter(household=self.request.user.active_household)

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


class MenuListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = MenuSerializer

    def get_queryset(self):
        queryset = Menu.objects.filter(household=self.request.user.active_household).select_related(
            'lunch_recipe', 'dinner_recipe', 'rating'
        )
        week_start_raw = self.request.query_params.get('weekStart')
        days_raw = self.request.query_params.get('days')

        if week_start_raw:
            week_start = parse_date(week_start_raw)
            if week_start:
                days = 7
                if days_raw and days_raw.isdigit():
                    days = max(1, min(int(days_raw), 31))
                week_end = week_start + timedelta(days=days - 1)

                auto_persons = self.request.query_params.get('autoPersons') == 'true'
                if auto_persons:
                    recalculate_menu_persons_for_range(
                        self.request.user.active_household, week_start, week_end
                    )

                queryset = queryset.filter(date__gte=week_start, date__lte=week_end)

        return queryset.order_by('date')

    def perform_create(self, serializer):
        menu = serializer.save(household=self.request.user.active_household)
        if not any(key in serializer.validated_data for key in ('breakfast_persons','lunch_persons','dinner_persons')):
            recalculate_menu_persons_for_range(self.request.user.active_household, menu.date, menu.date)
            menu.refresh_from_db()

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)


class MenuDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = MenuSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return Menu.objects.filter(household=self.request.user.active_household).select_related(
            'lunch_recipe', 'dinner_recipe', 'rating'
        )

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


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

        values = base.values('name', 'unit', 'category', 'image_url').order_by('name')[:20]
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


class CalendarEventListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = CalendarEventSerializer

    def get_queryset(self):
        from django.db.models import Q
        hh = self.request.user.active_household
        user = self.request.user
        start_raw = self.request.query_params.get('start')
        end_raw = self.request.query_params.get('end')

        queryset = CalendarEvent.objects.filter(
            Q(household=hh, calendar_type='household') |
            Q(created_by=user, calendar_type='private')
        )
        if start_raw:
            queryset = queryset.filter(
                Q(end__date__gte=parse_date(start_raw) or date.min) |
                Q(end__isnull=True, start__date__gte=parse_date(start_raw) or date.min)
            )
        if end_raw:
            queryset = queryset.filter(start__date__lte=parse_date(end_raw) or date.max)
        return queryset.order_by('start')

    def perform_create(self, serializer):
        serializer.save(
            household=self.request.user.active_household,
            created_by=self.request.user,
        )

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)


class CalendarEventDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = CalendarEventSerializer
    lookup_field = 'id'

    def get_queryset(self):
        from django.db.models import Q
        hh = self.request.user.active_household
        user = self.request.user
        return CalendarEvent.objects.filter(
            Q(household=hh, calendar_type='household') |
            Q(created_by=user, calendar_type='private')
        )

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


class AddRecipeToShoppingListView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def post(self, request):
        recipe_id = request.data.get('recipeId')
        persons = request.data.get('persons', 2)
        try:
            persons = max(1, int(persons))
        except (TypeError, ValueError):
            persons = 2

        try:
            recipe = Recipe.objects.get(id=recipe_id, household=request.user.active_household)
        except Recipe.DoesNotExist:
            return Response({'error': 'Recipe not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            units_per_person = float(request.data.get('unitsPerPerson', 1))
        except (TypeError, ValueError):
            return Response({'error': 'Portionen pro Person müssen eine positive Zahl sein.'}, status=status.HTTP_400_BAD_REQUEST)
        if not math.isfinite(units_per_person) or units_per_person <= 0:
            return Response({'error': 'Portionen pro Person müssen eine positive Zahl sein.'}, status=status.HTTP_400_BAD_REQUEST)
        base_servings = recipe.base_servings or persons or 2
        scale = persons * units_per_person / base_servings

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
                    quantity=round(qty, 2) if qty is not None else None,
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
        from .menu_export import build_export, commit_export, safe_date
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
            return Response({'detail':'Der Menüplan oder die Anwesenheiten haben sich geändert. Bitte die Vorschau neu laden.'}, status=409)
        if payload.get('strict') and plan['blocked']:
            return Response({'detail':'Bitte die Hinweise in der Vorschau prüfen.', 'warnings':plan['warnings']}, status=400)
        saved = commit_export(request.user.active_household, plan, payload.get('resetExisting') is True)
        return Response({'data':ShoppingItemSerializer(saved,many=True).data,'count':len(saved),'weekTag':plan['weekTag'],'warnings':plan['warnings']})


class HouseholdMemberListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = HouseholdMemberSerializer

    def get_queryset(self):
        return HouseholdMember.objects.filter(household=self.request.user.active_household).order_by('name')

    def perform_create(self, serializer):
        serializer.save(household=self.request.user.active_household)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)


class HouseholdMemberDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = HouseholdMemberSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return HouseholdMember.objects.filter(household=self.request.user.active_household)

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


class MemberAvailabilityListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = MemberAvailabilitySerializer

    def get_queryset(self):
        queryset = MemberAvailability.objects.filter(
            member__household=self.request.user.active_household
        )
        member_id = self.request.query_params.get('memberId')
        start_raw = self.request.query_params.get('start')
        end_raw = self.request.query_params.get('end')
        if member_id:
            queryset = queryset.filter(member_id=member_id)
        if start_raw:
            queryset = queryset.filter(date__gte=parse_date(start_raw) or date.min)
        if end_raw:
            queryset = queryset.filter(date__lte=parse_date(end_raw) or date.max)
        return queryset.select_related('member').order_by('date', 'member__name')

    def perform_create(self, serializer):
        member_id = serializer.validated_data['member_id']
        member = HouseholdMember.objects.filter(
            id=member_id, household=self.request.user.active_household
        ).first()
        if not member:
            raise PermissionDenied('Member does not belong to household')
        serializer.save()

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})


class MemberAvailabilityDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = MemberAvailabilitySerializer
    lookup_field = 'id'

    def get_queryset(self):
        return MemberAvailability.objects.filter(
            member__household=self.request.user.active_household
        )

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


class UserMealAttendanceView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def get(self, request):
        hh = request.user.active_household
        if not hh:
            return Response({'data': []})
        qs = UserMealAttendance.objects.filter(household=hh).select_related('user')
        start_raw = request.query_params.get('start')
        end_raw = request.query_params.get('end')
        if start_raw:
            qs = qs.filter(date__gte=parse_date(start_raw) or date.min)
        if end_raw:
            qs = qs.filter(date__lte=parse_date(end_raw) or date.max)
        return Response({'data': UserMealAttendanceSerializer(qs, many=True).data})

    def post(self, request):
        hh = request.user.active_household
        if not hh:
            return Response({'error': 'No active household'}, status=status.HTTP_400_BAD_REQUEST)
        date_str = request.data.get('date')
        if not date_str:
            return Response({'error': 'date is required'}, status=status.HTTP_400_BAD_REQUEST)
        d = parse_date(date_str)
        if not d:
            return Response({'error': 'Invalid date format'}, status=status.HTTP_400_BAD_REQUEST)
        breakfast = request.data.get('breakfastPresent', False)
        lunch = request.data.get('lunchPresent', False)
        dinner = request.data.get('dinnerPresent', False)
        obj, _ = UserMealAttendance.objects.update_or_create(
            household=hh,
            user=request.user,
            date=d,
            defaults={'breakfast_present': breakfast, 'lunch_present': lunch, 'dinner_present': dinner},
        )
        return Response({'data': UserMealAttendanceSerializer(obj).data})

    def delete(self, request):
        hh = request.user.active_household
        if not hh:
            return Response({'error': 'No active household'}, status=status.HTTP_400_BAD_REQUEST)
        date_str = request.data.get('date')
        if not date_str:
            return Response({'error': 'date is required'}, status=status.HTTP_400_BAD_REQUEST)
        d = parse_date(date_str)
        deleted, _ = UserMealAttendance.objects.filter(household=hh, user=request.user, date=d).delete()
        return Response({'success': True, 'deleted': deleted})


class ExternalMealGuestListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def get(self, request):
        hh = request.user.active_household
        if not hh:
            return Response({'data': []})
        qs = ExternalMealGuest.objects.filter(household=hh)
        start_raw = request.query_params.get('start')
        end_raw = request.query_params.get('end')
        if start_raw:
            qs = qs.filter(date__gte=parse_date(start_raw) or date.min)
        if end_raw:
            qs = qs.filter(date__lte=parse_date(end_raw) or date.max)
        return Response({'data': ExternalMealGuestSerializer(qs.order_by('date', 'meal', 'created_at'), many=True).data})

    def post(self, request):
        hh = request.user.active_household
        if not hh:
            return Response({'error': 'No active household'}, status=status.HTTP_400_BAD_REQUEST)
        name = (request.data.get('name') or '').strip()
        date_str = request.data.get('date')
        meal = request.data.get('meal')
        if not name or not date_str or not meal:
            return Response({'error': 'name, date and meal are required'}, status=status.HTTP_400_BAD_REQUEST)
        d = parse_date(date_str)
        if not d:
            return Response({'error': 'Invalid date format'}, status=status.HTTP_400_BAD_REQUEST)
        if meal not in ('breakfast', 'lunch', 'dinner'):
            return Response({'error': 'meal must be breakfast, lunch or dinner'}, status=status.HTTP_400_BAD_REQUEST)
        guest = ExternalMealGuest.objects.create(
            household=hh, name=name, date=d, meal=meal,
            created_by=request.user,
        )
        return Response({'data': ExternalMealGuestSerializer(guest).data}, status=status.HTTP_201_CREATED)


class ExternalMealGuestDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def delete(self, request, id):
        hh = request.user.active_household
        guest = get_object_or_404(ExternalMealGuest, id=id, household=hh)
        guest.delete()
        return Response({'success': True})


class RecalculateMenuPersonsView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def post(self, request):
        week_start_raw = request.data.get('weekStart')
        days = request.data.get('days', 7)

        week_start = parse_date(week_start_raw) if week_start_raw else None
        if not week_start:
            return Response(
                {
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "Invalid request data",
                        "details": "weekStart is required (YYYY-MM-DD)",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            days = max(1, min(int(days), 31))
        except (TypeError, ValueError):
            days = 7

        week_end = week_start + timedelta(days=days - 1)
        recalculate_menu_persons_for_range(request.user.active_household, week_start, week_end)

        menus = Menu.objects.filter(
            household=request.user.active_household,
            date__gte=week_start,
            date__lte=week_end,
        ).select_related('lunch_recipe', 'dinner_recipe', 'rating').order_by('date')

        serializer = MenuSerializer(menus, many=True)
        return Response({"data": serializer.data})


# ── Cleaning ──────────────────────────────────────────────────────────

class CleaningTaskListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = CleaningTaskSerializer

    def get_queryset(self):
        return CleaningTask.objects.filter(
            household=self.request.user.active_household
        ).prefetch_related('logs__done_by').order_by('name')

    def perform_create(self, serializer):
        serializer.save(household=self.request.user.active_household)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)


class CleaningTaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = CleaningTaskSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return CleaningTask.objects.filter(
            household=self.request.user.active_household
        ).prefetch_related('logs__done_by')

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data})

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response({"success": True})


class CleaningLogListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = CleaningLogSerializer

    def get_queryset(self):
        task_id = self.kwargs.get('task_id')
        return CleaningLog.objects.filter(
            task__household=self.request.user.active_household,
            task_id=task_id,
        ).select_related('done_by').order_by('-done_at')

    def perform_create(self, serializer):
        task_id = self.kwargs.get('task_id')
        task = get_object_or_404(
            CleaningTask, id=task_id, household=self.request.user.active_household
        )
        serializer.save(task=task, done_by=self.request.user)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)


class CleaningLogDetailView(generics.RetrieveDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = CleaningLogSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return CleaningLog.objects.filter(
            task__household=self.request.user.active_household
        ).select_related('done_by')

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response({"success": True})
