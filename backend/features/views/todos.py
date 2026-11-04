"""Household and private tasks."""

import re

from django.db import transaction
from django.db.models import Q
from rest_framework import generics, permissions
from rest_framework.response import Response

from ..models import CalendarEvent, Todo
from ..serializers import TodoSerializer
from .common import HasActiveHousehold


class TodoListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = TodoSerializer

    def get_queryset(self):
        queryset = Todo.objects.filter(
            household=self.request.user.active_household
        ).select_related('done_by').filter(
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
