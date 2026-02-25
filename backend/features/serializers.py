from rest_framework import serializers
from .models import Todo


class TodoSerializer(serializers.ModelSerializer):
    startDate = serializers.DateTimeField(source='start_date', required=False, allow_null=True)
    dueDate = serializers.DateTimeField(source='due_date', required=False, allow_null=True)
    durationMinutes = serializers.IntegerField(source='duration_minutes', required=False, allow_null=True)
    progress = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = Todo
        fields = [
            'id', 'title', 'done', 'startDate', 'dueDate', 'progress', 'durationMinutes',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
