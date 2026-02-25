from django.urls import path
from .views import TodoListCreateView, TodoDetailView

urlpatterns = [
    path('todos/', TodoListCreateView.as_view()),
    path('todos/<uuid:id>/', TodoDetailView.as_view()),
]
