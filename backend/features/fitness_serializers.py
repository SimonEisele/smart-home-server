"""Fitness API: exercise types, machines (with manufacturer weight factor), profile and workouts."""
from django.db import transaction
from rest_framework import serializers

from .models import ExerciseType, FitnessProfile, GymMachine, Workout, WorkoutEntry


class ExerciseTypeSerializer(serializers.ModelSerializer):
    muscleGroup = serializers.ChoiceField(source='muscle_group', choices=ExerciseType.MUSCLE_CHOICES,
                                          required=False)
    met = serializers.FloatField(min_value=1, max_value=20, required=False)

    class Meta:
        model = ExerciseType
        fields = ['id', 'name', 'kind', 'muscleGroup', 'met']

    def validate_name(self, value):
        value = ' '.join(value.split())
        clash = ExerciseType.objects.filter(name__iexact=value).exclude(pk=getattr(self.instance, 'pk', None))
        if clash.exists():
            raise serializers.ValidationError(f'Die Übung „{clash.first().name}“ gibt es schon.')
        return value


class GymMachineSerializer(serializers.ModelSerializer):
    exerciseType = serializers.PrimaryKeyRelatedField(source='exercise_type', queryset=ExerciseType.objects.all())
    exerciseName = serializers.CharField(source='exercise_type.name', read_only=True)
    kind = serializers.CharField(source='exercise_type.kind', read_only=True)
    weightFactor = serializers.FloatField(source='weight_factor', min_value=0.1, max_value=10, required=False)
    model = serializers.CharField(max_length=80, allow_blank=True, required=False, default='')
    notes = serializers.CharField(max_length=200, allow_blank=True, required=False, default='')
    isMine = serializers.SerializerMethodField()

    class Meta:
        model = GymMachine
        fields = ['id', 'exerciseType', 'exerciseName', 'kind', 'manufacturer', 'model', 'weightFactor', 'notes',
                  'isMine']
        validators = []  # duplicates are checked case-insensitively in validate()

    def get_isMine(self, obj):
        request = self.context.get('request')
        return bool(request and obj.created_by_id == request.user.id)

    def validate(self, attrs):
        for key in ('manufacturer', 'model', 'notes'):
            if key in attrs:
                attrs[key] = ' '.join(str(attrs[key]).split())
        if 'manufacturer' in attrs and not attrs['manufacturer']:
            raise serializers.ValidationError({'manufacturer': 'Bitte den Hersteller angeben.'})
        exercise = attrs.get('exercise_type', getattr(self.instance, 'exercise_type', None))
        manufacturer = attrs.get('manufacturer', getattr(self.instance, 'manufacturer', ''))
        model = attrs.get('model', getattr(self.instance, 'model', ''))
        clash = GymMachine.objects.filter(exercise_type=exercise, manufacturer__iexact=manufacturer,
                                          model__iexact=model).exclude(pk=getattr(self.instance, 'pk', None))
        if clash.exists():
            raise serializers.ValidationError({'manufacturer': 'Dieses Gerät ist schon im Katalog.'})
        return attrs


class FitnessProfileSerializer(serializers.ModelSerializer):
    bodyWeightKg = serializers.FloatField(source='body_weight_kg', min_value=20, max_value=400, allow_null=True,
                                          required=False)
    defaultGym = serializers.CharField(source='default_gym', max_length=80, allow_blank=True, required=False)

    class Meta:
        model = FitnessProfile
        fields = ['bodyWeightKg', 'defaultGym']


class SetSerializer(serializers.Serializer):
    reps = serializers.IntegerField(min_value=0, max_value=1000, required=False, allow_null=True)
    weight = serializers.FloatField(min_value=0, max_value=1000, required=False, allow_null=True)


class WorkoutEntrySerializer(serializers.ModelSerializer):
    exerciseType = serializers.PrimaryKeyRelatedField(source='exercise_type', queryset=ExerciseType.objects.all(),
                                                      required=False)
    machine = serializers.PrimaryKeyRelatedField(queryset=GymMachine.objects.all(), required=False, allow_null=True)
    exerciseName = serializers.CharField(source='exercise_type.name', read_only=True)
    kind = serializers.CharField(source='exercise_type.kind', read_only=True)
    met = serializers.FloatField(source='exercise_type.met', read_only=True)
    machineLabel = serializers.SerializerMethodField()
    weightFactor = serializers.SerializerMethodField()
    sets = SetSerializer(many=True, required=False, max_length=30)
    durationMinutes = serializers.FloatField(source='duration_minutes', min_value=0, max_value=600, required=False,
                                             allow_null=True)
    distanceKm = serializers.FloatField(source='distance_km', min_value=0, max_value=300, required=False,
                                        allow_null=True)
    level = serializers.CharField(max_length=20, allow_blank=True, required=False)
    notes = serializers.CharField(max_length=200, allow_blank=True, required=False)

    class Meta:
        model = WorkoutEntry
        fields = ['id', 'exerciseType', 'machine', 'exerciseName', 'kind', 'met', 'machineLabel', 'weightFactor',
                  'sets', 'durationMinutes', 'distanceKm', 'level', 'notes']

    def get_machineLabel(self, obj):
        if not obj.machine:
            return ''
        return ' '.join(part for part in (obj.machine.manufacturer, obj.machine.model) if part)

    def get_weightFactor(self, obj):
        return obj.machine.weight_factor if obj.machine else 1.0

    def validate(self, attrs):
        machine = attrs.get('machine')
        exercise = attrs.get('exercise_type')
        if machine and exercise and machine.exercise_type_id != exercise.id:
            raise serializers.ValidationError({'machine': 'Das Gerät gehört zu einer anderen Übung.'})
        if not exercise:
            if not machine:
                raise serializers.ValidationError({'exerciseType': 'Bitte eine Übung oder ein Gerät wählen.'})
            attrs['exercise_type'] = machine.exercise_type
        # Empty set rows are dropped; cardio keeps no sets.
        sets = [dict(s) for s in attrs.get('sets', []) if s.get('reps') or s.get('weight')]
        attrs['sets'] = [] if attrs['exercise_type'].kind == 'cardio' else sets
        return attrs


class WorkoutSerializer(serializers.ModelSerializer):
    durationMinutes = serializers.IntegerField(source='duration_minutes', min_value=1, max_value=600, required=False,
                                               allow_null=True)
    gym = serializers.CharField(max_length=80, allow_blank=True, required=False)
    notes = serializers.CharField(allow_blank=True, required=False, max_length=2000)
    calories = serializers.IntegerField(min_value=0, max_value=10000, required=False, allow_null=True)
    bodyWeightKg = serializers.FloatField(source='body_weight_kg', min_value=20, max_value=400, required=False,
                                          allow_null=True)
    entries = WorkoutEntrySerializer(many=True, required=False, max_length=60)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = Workout
        fields = ['id', 'date', 'durationMinutes', 'gym', 'notes', 'calories', 'bodyWeightKg', 'entries', 'createdAt']

    @transaction.atomic
    def create(self, validated_data):
        entries = validated_data.pop('entries', [])
        workout = Workout.objects.create(**validated_data)
        self._write_entries(workout, entries)
        return workout

    @transaction.atomic
    def update(self, instance, validated_data):
        entries = validated_data.pop('entries', None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if entries is not None:
            instance.entries.all().delete()
            self._write_entries(instance, entries)
        return instance

    @staticmethod
    def _write_entries(workout, entries):
        WorkoutEntry.objects.bulk_create(
            WorkoutEntry(workout=workout, position=index, **{k: v for k, v in entry.items() if k != 'id'})
            for index, entry in enumerate(entries))
