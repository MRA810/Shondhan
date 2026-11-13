from django.urls import path
from . import views

urlpatterns = [
    path("dashboard/", views.DashboardView.as_view()),
    path("cases/", views.CaseList.as_view()),
    path("cases/<int:pk>/", views.CaseDetail.as_view()),
    path("cases/<int:pk>/matches/", views.CaseMatches.as_view()),
    path("matches/<int:pk>/", views.MatchDetail.as_view()),
    path("notifications/", views.NotificationList.as_view()),
    path("notifications/unread/", views.UnreadCount.as_view()),
    path("notifications/read-all/", views.ReadAll.as_view()),
]
