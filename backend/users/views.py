from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.permissions import AllowAny
from .models import User, DashboardItem
from .serializers import UserCreateSerializer, CurrentUserSerializer, DashboardItemSerializer
from .auth_serializers import EmailTokenObtainPairSerializer


# User
class UserCreateView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserCreateSerializer

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return Response({"data": response.data})


class CurrentUserView(generics.RetrieveAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CurrentUserSerializer

    def get_object(self):
        return self.request.user

    def retrieve(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = self.get_serializer(user)
        return Response({"data": serializer.data})


class CheckEmailView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email")
        exists = User.objects.filter(email=email).exists()
        return Response({"data": {"exists": exists}})


class EmailTokenObtainPairView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = EmailTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.user
        tokens = serializer.validated_data

        return Response({
            "data": {
                "access_token": tokens.get("access"),
                "refresh_token": tokens.get("refresh"),
                "user": CurrentUserSerializer(user).data
            }
        })


# Dashboard-Items
class DashboardView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DashboardItemSerializer

    def get_queryset(self):
        return DashboardItem.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class DashboardDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DashboardItemSerializer
    lookup_field = "id"

    def get_queryset(self):
        return DashboardItem.objects.filter(user=self.request.user)
