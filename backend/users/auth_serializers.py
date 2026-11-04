from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import serializers
from .models import User

LOGIN_FAILED = "E-Mail oder Passwort ist falsch"


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = "email"

    def validate(self, attrs):
        email = attrs.get("email")
        password = attrs.get("password")

        # One message for both cases, so the login does not reveal which accounts exist.
        user = User.objects.filter(email__iexact=email).first()
        if user is None or not user.check_password(password):
            raise serializers.ValidationError(LOGIN_FAILED)

        data = super().validate({
            "email": user.email,
            "password": password
        })
        return data
