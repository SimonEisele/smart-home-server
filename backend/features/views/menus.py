"""Weekly menu plan and its person counts."""

from datetime import timedelta

from django.utils.dateparse import parse_date
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.api_errors import api_error

from ..serializers import MenuSerializer
from .common import HasActiveHousehold, menu_queryset, recalculate_menu_persons_for_range


class MenuListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = MenuSerializer

    def get_queryset(self):
        queryset = menu_queryset(self.request.user.active_household)
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
        return menu_queryset(self.request.user.active_household)

    def retrieve(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object())
        return Response({"data": serializer.data})

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return Response({"data": response.data}, status=response.status_code)

    def destroy(self, request, *args, **kwargs):
        super().destroy(request, *args, **kwargs)
        return Response({"success": True})


class RecalculateMenuPersonsView(APIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def post(self, request):
        week_start_raw = request.data.get('weekStart')
        days = request.data.get('days', 7)

        week_start = parse_date(week_start_raw) if week_start_raw else None
        if not week_start:
            return api_error('weekStart fehlt oder ist ungültig (erwartet JJJJ-MM-TT).', status.HTTP_400_BAD_REQUEST)

        try:
            days = max(1, min(int(days), 31))
        except (TypeError, ValueError):
            days = 7

        week_end = week_start + timedelta(days=days - 1)
        recalculate_menu_persons_for_range(request.user.active_household, week_start, week_end)

        menus = menu_queryset(request.user.active_household).filter(
            date__gte=week_start,
            date__lte=week_end,
        ).order_by('date')

        serializer = MenuSerializer(menus, many=True)
        return Response({"data": serializer.data})
