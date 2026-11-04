"""Cleaning tasks and their completion log."""

from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response

from ..models import CleaningLog, CleaningTask
from ..serializers import CleaningLogSerializer, CleaningTaskSerializer
from .common import HasActiveHousehold


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
