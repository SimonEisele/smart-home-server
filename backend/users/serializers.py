from rest_framework import serializers
from .models import User, DashboardItem, Household, HouseholdMembership


# Household
class HouseholdSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Household
        fields = ['id', 'name', 'description', 'invite_code', 'role', 'member_count', 'created_at']
        read_only_fields = ['id', 'invite_code', 'created_at', 'updated_at']

    def get_role(self, obj):
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            m = obj.memberships.filter(user=request.user).first()
            return m.role if m else None
        return None

    def get_member_count(self, obj):
        return obj.memberships.count()


class HouseholdMembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source='user.email', read_only=True)
    user_first_name = serializers.CharField(source='user.first_name', read_only=True)
    user_last_name = serializers.CharField(source='user.last_name', read_only=True)
    user_is_household_account = serializers.BooleanField(source='user.is_household_account', read_only=True)

    class Meta:
        model = HouseholdMembership
        fields = ['id', 'user_id', 'user_email', 'user_first_name', 'user_last_name', 'user_is_household_account', 'role', 'joined_at']
        read_only_fields = ['id', 'user_id', 'joined_at']


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
    active_household_id = serializers.SerializerMethodField()
    households = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "active_household_id",
            "households",
            "is_household_account",
        ]

    def get_active_household_id(self, obj):
        return str(obj.active_household_id) if obj.active_household_id else None

    def get_households(self, obj):
        memberships = obj.memberships.select_related('household').all()
        request = self.context.get('request')
        return [
            {
                'id': str(m.household.id),
                'name': m.household.name,
                'description': m.household.description,
                'invite_code': str(m.household.invite_code),
                'role': m.role,
                'member_count': m.household.memberships.count(),
            }
            for m in memberships
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
