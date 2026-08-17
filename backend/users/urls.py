from django.urls import path
from .views import (
    UserCreateView,
    CurrentUserView,
    CheckEmailView,
    EmailTokenObtainPairView,
    DashboardView,
    DashboardDetailView,
    DashboardLayoutListCreateView,
    DashboardLayoutDetailView,
    DashboardLayoutApplyView,
    HouseholdListCreateView,
    HouseholdDetailView,
    SwitchHouseholdView,
    JoinHouseholdView,
    HouseholdMembersView,
    HouseholdAccountView,
    LeaveHouseholdView,
)
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    # User
    path("", CurrentUserView.as_view()),
    path("create/", UserCreateView.as_view()),
    path("token/", EmailTokenObtainPairView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view()),
    path("check-email/", CheckEmailView.as_view()),

    # Households
    path("households/", HouseholdListCreateView.as_view()),
    path("households/join/", JoinHouseholdView.as_view()),
    path("households/<uuid:id>/", HouseholdDetailView.as_view()),
    path("households/<uuid:id>/switch/", SwitchHouseholdView.as_view()),
    path("households/<uuid:id>/members/", HouseholdMembersView.as_view()),
    path("households/<uuid:id>/accounts/", HouseholdAccountView.as_view()),
    path("households/<uuid:id>/leave/", LeaveHouseholdView.as_view()),

    # Dashboard-Items
    path("dashboard/", DashboardView.as_view()),
    path("dashboard/<uuid:id>/", DashboardDetailView.as_view()),
    # Dashboard-Layouts
    path("dashboard/layouts/", DashboardLayoutListCreateView.as_view()),
    path("dashboard/layouts/<uuid:id>/", DashboardLayoutDetailView.as_view()),
    path("dashboard/layouts/<uuid:id>/apply/", DashboardLayoutApplyView.as_view()),
]
