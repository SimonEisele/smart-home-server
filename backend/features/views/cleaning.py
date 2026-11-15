"""Cleaning tasks and their completion log."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response

from backend.api_errors import api_error
from users.models import HouseholdMembership

from ..models import CleaningLog, CleaningTask
from ..serializers import CleaningLogSerializer, CleaningTaskSerializer
from .common import HasActiveHousehold


class CleaningTaskListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated, HasActiveHousehold]
    serializer_class = CleaningTaskSerializer

    def get_queryset(self):
        return CleaningTask.objects.filter(
            household=self.request.user.active_household
        ).select_related('assigned_to').prefetch_related('logs__done_by').order_by('name')

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
        ).select_related('assigned_to').prefetch_related('logs__done_by')

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

    def create(self, request, *args, **kwargs):
        task = get_object_or_404(CleaningTask, id=self.kwargs.get('task_id'),
                                 household=request.user.active_household)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        done_by = serializer.validated_data.pop('done_by_id', None) or request.user.id
        if not HouseholdMembership.objects.filter(household=task.household, user_id=done_by).exists():
            return api_error('Nur Mitglieder dieser WG können als erledigt eintragen.')
        with transaction.atomic():
            latest = max((log.done_at for log in task.logs.all()), default=None)
            log = serializer.save(task=task, done_by_id=done_by)
            # Only the newest completion moves the turn on; logging an old one keeps it.
            if task.rotation and (latest is None or log.done_at >= latest):
                following = task.next_in_rotation(done_by)
                if str(following) != str(task.assigned_to_id):
                    log.rotated, log.assigned_before_id = True, task.assigned_to_id
                    log.save(update_fields=['rotated', 'assigned_before'])
                    task.assigned_to_id = following
                    task.save(update_fields=['assigned_to', 'updated_at'])
        return Response({"data": self.get_serializer(log).data, "task": task_payload(task, request)}, status=201)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"data": serializer.data})


def task_payload(task, request):
    task = CleaningTask.objects.select_related('assigned_to').prefetch_related('logs__done_by').get(id=task.id)
    return CleaningTaskSerializer(task, context={'request': request}).data


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
        log = self.get_object()
        task = log.task
        with transaction.atomic():
            # Undoing the completion that moved the turn on gives it back.
            newest = task.logs.order_by('-done_at', '-created_at').first()
            if log.rotated and newest and newest.id == log.id:
                task.assigned_to_id = log.assigned_before_id
                task.save(update_fields=['assigned_to', 'updated_at'])
            log.delete()
        return Response({"success": True, "task": task_payload(task, request)})
