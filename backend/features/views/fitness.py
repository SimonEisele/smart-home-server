"""Fitness: shared catalog of exercises and machines, personal workouts (visible only to their owner)."""
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.api_errors import api_error

from ..fitness_serializers import (
    ExerciseTypeSerializer, FitnessProfileSerializer, GymMachineSerializer, WorkoutSerializer,
)
from ..models import ExerciseType, FitnessProfile, GymMachine, Workout, WorkoutEntry


class _Enveloped:
    def list(self, request, *args, **kwargs):
        return Response({'data': self.get_serializer(self.get_queryset(), many=True).data})

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response({'data': serializer.data}, status=201)

    def retrieve(self, request, *args, **kwargs):
        return Response({'data': self.get_serializer(self.get_object()).data})

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=kwargs.get('partial', False))
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'data': serializer.data})


class ExerciseTypeListCreateView(_Enveloped, generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ExerciseTypeSerializer
    queryset = ExerciseType.objects.all()


class GymMachineListCreateView(_Enveloped, generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GymMachineSerializer

    def get_queryset(self):
        machines = GymMachine.objects.select_related('exercise_type')
        return machines.order_by('exercise_type__name', 'manufacturer', 'model')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class GymMachineDetailView(_Enveloped, generics.RetrieveUpdateDestroyAPIView):
    """Everyone may correct a machine (e.g. its factor); only unused machines can be removed."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GymMachineSerializer
    queryset = GymMachine.objects.select_related('exercise_type')
    lookup_field = 'id'

    def destroy(self, request, *args, **kwargs):
        machine = self.get_object()
        if WorkoutEntry.objects.filter(machine=machine).exists():
            return api_error('Das Gerät wird in Trainings verwendet und kann nicht gelöscht werden.')
        machine.delete()
        return Response({'success': True})


class FitnessProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        profile, _ = FitnessProfile.objects.get_or_create(user=request.user)
        return Response({'data': FitnessProfileSerializer(profile).data})

    def put(self, request):
        profile, _ = FitnessProfile.objects.get_or_create(user=request.user)
        serializer = FitnessProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'data': serializer.data})

    patch = put


def _workouts(user):
    return Workout.objects.filter(user=user).prefetch_related('entries__exercise_type', 'entries__machine')


class WorkoutListCreateView(_Enveloped, generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkoutSerializer

    def get_queryset(self):
        return _workouts(self.request.user)

    def perform_create(self, serializer):
        weight = serializer.validated_data.get('body_weight_kg')
        if weight is None:
            profile = FitnessProfile.objects.filter(user=self.request.user).first()
            weight = profile.body_weight_kg if profile else None
        serializer.save(user=self.request.user, body_weight_kg=weight)


class WorkoutDetailView(_Enveloped, generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkoutSerializer
    lookup_field = 'id'

    def get_queryset(self):
        return _workouts(self.request.user)

    def get_object(self):
        return get_object_or_404(self.get_queryset(), id=self.kwargs['id'])

    def destroy(self, request, *args, **kwargs):
        self.get_object().delete()
        return Response({'success': True})
