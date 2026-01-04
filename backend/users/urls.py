from django.urls import path
from .views import (
    UserCreateView,
    CurrentUserView,
    CheckEmailView,
    EmailTokenObtainPairView,
    DashboardView,
    DashboardDetailView
)
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    # User
    path("", CurrentUserView.as_view()),
    path("create/", UserCreateView.as_view()),
    path("token/", EmailTokenObtainPairView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view()),
    path("check-email/", CheckEmailView.as_view()),

    # Dashboard-Items
    path("dashboard/", DashboardView.as_view()),
    path("dashboard/<uuid:id>/", DashboardDetailView.as_view()),
]
