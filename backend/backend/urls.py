from django.urls import path, include
from django.contrib import admin

urlpatterns = [
    path('admin/', admin.site.urls),

    # User endpoints
    path('api/users/', include('users.urls')),
]
