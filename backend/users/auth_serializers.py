from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from .models import User


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "email"

    def validate(self, attrs):
        email = attrs.get("email")
        password = attrs.get("password")

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError("Email nicht gefunden")

        if not user.check_password(password):
            raise serializers.ValidationError("Passwort falsch")

        data = super().validate({
            "email": user.email,
            "password": password
        })
        return data
