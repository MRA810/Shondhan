from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from . import otp as otp_codes
from .models import User
from .serializers import (BN_DIGITS, OTPRequestSerializer, PasswordResetSerializer, ProfileUpdateSerializer,
                          RegisterSerializer, StaffRegisterSerializer, UserSerializer)
from .sms import SMSError

MAX_FAILS, LOCK_MIN = 5, 15


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    def post(self, request):
        ident = str(request.data.get("identifier", "")).strip().translate(BN_DIGITS)
        pw = str(request.data.get("password", ""))
        user = User.objects.filter(Q(phone=ident) | Q(email__iexact=ident) | Q(username=ident)).first() if ident else None
        now = timezone.now()

        if user and user.locked_until and user.locked_until > now:
            return Response({"code": "locked"}, status=429)

        if not user or not user.check_password(pw):
            if user:
                user.failed_attempts += 1
                if user.failed_attempts >= MAX_FAILS:
                    user.locked_until, user.failed_attempts = now + timedelta(minutes=LOCK_MIN), 0
                user.save(update_fields=["failed_attempts", "locked_until"])
            # same answer for unknown user and wrong password
            return Response({"code": "invalid"}, status=401)

        if not user.is_active:
            # Only someone who knows the password learns that the account is waiting for approval.
            return Response({"code": "pending" if user.awaiting_approval else "invalid"}, status=401)

        user.failed_attempts, user.locked_until, user.last_login = 0, None, now
        user.save(update_fields=["failed_attempts", "locked_until", "last_login"])
        return Response(login_payload(user))


def login_payload(user):
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh), "user": UserSerializer(user).data}


class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        from cases.services import welcome
        welcome(user)
        return Response({"ok": True}, status=201)


class StaffRegisterView(RegisterView):
    def post(self, request):
        s = StaffRegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save()
        return Response({"ok": True, "pending": True}, status=201)


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        s = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        return Response(UserSerializer(request.user).data)


class OTPSendView(APIView):
    """Send a 6-digit SMS code. purpose=signup (number must be new) or reset (forgot password)."""
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        s = OTPRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        phone, purpose = s.validated_data["phone"], s.validated_data["purpose"]
        exists = User.objects.filter(phone=phone).exists()
        if purpose == "signup" and exists:
            return Response({"phone": ["exists"]}, status=400)
        if purpose == "reset" and not exists:
            return Response({"ok": True})  # same answer either way: do not reveal who has an account
        try:
            dev_code = otp_codes.issue(phone, purpose)
        except otp_codes.OTPRateLimited as e:
            return Response({"code": "otp_wait", "wait": e.wait}, status=429)
        except SMSError:
            return Response({"code": "sms_failed"}, status=503)
        data = {"ok": True}
        if dev_code:
            data["dev_code"] = dev_code  # development only (console SMS backend + DEBUG)
        return Response(data)


class PasswordResetView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    def post(self, request):
        s = PasswordResetSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.validated_data["user"]
        user.set_password(s.validated_data["password"])
        user.failed_attempts, user.locked_until = 0, None
        user.save()
        from cases.services import audit
        audit(request, "reset_password", "user", user.id, user=user)
        return Response({"ok": True})
