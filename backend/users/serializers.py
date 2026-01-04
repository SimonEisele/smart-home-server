from rest_framework import serializers
from .models import User, DashboardItem


# User
class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "password",
            "first_name",
            "last_name",
            "phone_number",
        ]

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class CurrentUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone_number",
        ]


# Dashboard-Items
class DashboardItemSerializer(serializers.ModelSerializer):
    minItemCols = serializers.IntegerField(source='min_item_cols')
    maxItemCols = serializers.IntegerField(source='max_item_cols', required=False, allow_null=True)
    minItemRows = serializers.IntegerField(source='min_item_rows')
    maxItemRows = serializers.IntegerField(source='max_item_rows', required=False, allow_null=True)

    class Meta:
        model = DashboardItem
        fields = [
            'id', 'widget_type', 'title', 'icon', 'config',
            'x', 'y', 'cols', 'rows',
            'minItemCols', 'maxItemCols', 'minItemRows', 'maxItemRows'
        ]
        read_only_fields = ["id", "user", "created_at", "updated_at"]
