from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import LoginView, RegisterView, MeView, FamilyCaseListCreateView, CaseMatchListView

urlpatterns = [
    path("login/", LoginView.as_view()),
    path("register/", RegisterView.as_view()),
    path("refresh/", TokenRefreshView.as_view()),
    path("me/", MeView.as_view()),
    path("cases/", FamilyCaseListCreateView.as_view()),
    path("cases/<int:case_id>/matches/", CaseMatchListView.as_view()),
]
