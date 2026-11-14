"""Household and private tasks."""

import calendar
import re
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.api_errors import api_error

from ..models import CalendarEvent, Todo
from ..serializers import TodoSerializer
from .common import HasActiveHousehold


def planned_slots(household, todo_ids):
    """Calendar blocks per todo, so lists can show when a task is planned."""
    slots = {}
    events = CalendarEvent.objects.filter(household=household, todo_ref_id__in=list(todo_ids)).order_by('start')
    for event in events.only('id', 'todo_ref_id', 'start', 'end'):
        slots.setdefault(event.todo_ref_id, []).append({'id': str(event.id), 'start': event.start, 'end': event.end})
    return slots


def visible_todos(user):
    return Todo.objects.filter(household=user.active_household).filter(Q(global_todo=True) | Q(created_by=user))


def _add_months(day, months, anchor_day):
    month_index = day.month - 1 + months
    year, month = day.year + month_index // 12, month_index % 12 + 1
    return day.replace(year=year, month=month, day=min(anchor_day, calendar.monthrange(year, month)[1]))


def next_occurrence(todo, after):
    """First occurrence of a recurring todo strictly after the local date `after`."""
    anchor = todo.start_date or todo.due_date
    base = timezone.localtime(anchor).date()
    interval = max(1, todo.recurrence_interval or 1)
    if todo.recurrence == 'monthly':
        months = max(0, (after.year - base.year) * 12 + after.month - base.month)
        candidate = _add_months(base, months - months % interval, base.day)
        while candidate <= after:
            candidate = _add_months(candidate, interval, base.day)
        return candidate
    step = interval * (7 if todo.recurrence == 'weekly' else 1)
    passed = max(0, (after - base).days)
    candidate = base + timedelta(days=passed - passed % step)
    while candidate <= after:
        candidate += timedelta(days=step)
    return candidate


def _shift(value, days):
    if value is None:
        return None
    local = timezone.localtime(value)
    return timezone.make_aware(local.replace(tzinfo=None) + timedelta(days=days), local.tzinfo)


class TodoListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = TodoSerializer

    def get_queryset(self):
        queryset = Todo.objects.filter(
            household=self.request.user.active_household
        ).select_related('done_by', 'created_by', 'assigned_to').filter(
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

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.method == 'GET':
            context['planned_slots'] = planned_slots(
                self.request.user.active_household, self.get_queryset().values_list('id', flat=True))
        return context

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
            sync_todo_events(todo)
        return Response({"data": serializer.data})

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        CalendarEvent.objects.filter(
            household=request.user.active_household,
            todo_ref_id=instance.id
        ).delete()
        instance.delete()
        return Response({"success": True})


def sync_todo_events(todo):
    """Keeps the calendar slots of a task in line with its title, text and visibility."""
    for event in CalendarEvent.objects.filter(household=todo.household, todo_ref_id=todo.id):
        suffix = re.search(r' \(\d+/\d+\)$', event.title)
        event.title = todo.title + (suffix.group() if suffix else '')
        event.description = todo.description
        event.calendar_type = 'household' if todo.global_todo else 'private'
        if not todo.global_todo:
            event.created_by = todo.created_by
        event.save(update_fields=['title', 'description', 'calendar_type', 'created_by', 'updated_at'])


def complete_todo(todo, user, day):
    """Marks a one-off task done; a recurring one moves to its next date. Returns that date or None."""
    if todo.recurrence and (todo.start_date or todo.due_date):
        anchor = timezone.localtime(todo.start_date or todo.due_date).date()
        advanced_to = next_occurrence(todo, max(day, anchor))
        delta = (advanced_to - anchor).days
        todo.start_date, todo.due_date = _shift(todo.start_date, delta), _shift(todo.due_date, delta)
        # The next time starts with a fresh checklist.
        todo.checklist = [{**item, 'done': False} for item in todo.checklist or []]
        todo.save(update_fields=['start_date', 'due_date', 'checklist', 'updated_at'])
        return advanced_to
    todo.done, todo.done_by = True, user
    todo.save(update_fields=['done', 'done_by', 'updated_at'])
    return None


class CompleteTodoView(APIView):
    """Tick off a task from the calendar or task list.

    One-off tasks are marked done. A recurring task stays open and moves to its
    next occurrence after the completed day, so the series keeps going. The
    response carries the previous dates so the client can undo the step.
    """
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]

    def post(self, request, id):
        todo = visible_todos(request.user).filter(id=id).first()
        if not todo:
            return api_error('Aufgabe nicht gefunden.', status.HTTP_404_NOT_FOUND)
        raw = request.data.get('date')
        day = parse_date(raw) if isinstance(raw, str) else None
        if raw is not None and day is None:
            return api_error('Ungültiges Datum (erwartet JJJJ-MM-TT).', status.HTTP_400_BAD_REQUEST)
        previous = {'startDate': todo.start_date, 'dueDate': todo.due_date, 'done': todo.done}
        advanced_to = complete_todo(todo, request.user, day or timezone.localdate())
        data = TodoSerializer(todo, context={'request': request}).data
        return Response({'data': data, 'advancedTo': advanced_to, 'previous': previous})
