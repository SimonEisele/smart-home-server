from django.urls import path

from .views import AssistantApplyView, AssistantChatView, AssistantStatusView

urlpatterns = [
    path('status/', AssistantStatusView.as_view()),
    path('chat/', AssistantChatView.as_view()),
    path('apply/', AssistantApplyView.as_view()),
]
