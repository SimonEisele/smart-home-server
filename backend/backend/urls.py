from django.urls import path, include
from django.contrib import admin

urlpatterns = [
    path('admin/', admin.site.urls),

    # User endpoints
    path('api/users/', include('users.urls')),

    # WG assistant (language model with tools)
    path('api/assistant/', include('assistant.urls')),

    # Feature endpoints
    path('api/', include('features.urls')),
]
