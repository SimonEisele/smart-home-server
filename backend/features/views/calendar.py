"""Household and private calendar events."""

from datetime import date

from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import generics, permissions
from rest_framework.response import Response

from ..models import CalendarEvent
from ..serializers import CalendarEventSerializer
from .common import HasActiveHousehold


class CalendarEventListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = CalendarEventSerializer

    def get_queryset(self):
        hh = self.request.user.active_household
        user = self.request.user
        start_raw = self.request.query_params.get('start')
        end_raw = self.request.query_params.get('end')

        queryset = CalendarEvent.objects.filter(
            Q(household=hh, calendar_type='household') |
            Q(household=hh, created_by=user, calendar_type='private')
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
        hh = self.request.user.active_household
        user = self.request.user
        return CalendarEvent.objects.filter(
            Q(household=hh, calendar_type='household') |
            Q(household=hh, created_by=user, calendar_type='private')
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
