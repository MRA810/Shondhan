from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from cases.views import RegisterWithReportView

from .views import LoginView, MeView, OTPSendView, PasswordResetView, RegisterView, StaffRegisterView

urlpatterns = [
    path("login/", LoginView.as_view()),
    path("register/", RegisterView.as_view()),
    path("register-staff/", StaffRegisterView.as_view()),
    path("refresh/", TokenRefreshView.as_view()),
    path("me/", MeView.as_view()),
    path("otp/send/", OTPSendView.as_view()),
    path("password/reset/", PasswordResetView.as_view()),
    path("register-report/", RegisterWithReportView.as_view()),  # family: report first, then account
]
