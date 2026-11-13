from django.urls import path
from .views import CaseCreateView, CaseDetailView, NotificationListView, NotificationReadView, PhotoView, SummaryView

urlpatterns = [
    path("summary/", SummaryView.as_view()),
    path("notifications/", NotificationListView.as_view()),
    path("notifications/read/", NotificationReadView.as_view()),
    path("cases/", CaseCreateView.as_view()),
    path("cases/<int:pk>/", CaseDetailView.as_view()),
    path("cases/<int:pk>/photos/<int:photo_id>/", PhotoView.as_view()),
]
