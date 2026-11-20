"""One-time SMS codes: create + send, and check."""
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from .models import PhoneOTP
from .sms import SMSError, send_sms

COOLDOWN = timedelta(seconds=60)  # one code per minute per number
HOURLY_LIMIT = 5

MESSAGES = {
    "signup": "Shondhan (সন্ধান): আপনার কোড {code}। কাউকে বলবেন না। Your code: {code}",
    "reset": "Shondhan (সন্ধান): পাসওয়ার্ড বদলের কোড {code}। কাউকে বলবেন না। Password reset code: {code}",
}


class OTPRateLimited(Exception):
    def __init__(self, wait):
        self.wait = wait


def issue(phone, purpose):
    """Create and send a code. Returns the code only in development (console backend + DEBUG)."""
    now = timezone.now()
    recent = PhoneOTP.objects.filter(phone=phone, purpose=purpose, created_at__gte=now - timedelta(hours=1))
    last = recent.first()
    if last and now - last.created_at < COOLDOWN:
        raise OTPRateLimited(int((COOLDOWN - (now - last.created_at)).total_seconds()) + 1)
    if recent.count() >= HOURLY_LIMIT:
        raise OTPRateLimited(3600)
    code = f"{secrets.randbelow(1_000_000):06d}"
    otp = PhoneOTP(phone=phone, purpose=purpose)
    otp.set_code(code)
    otp.save()
    try:
        send_sms(phone, MESSAGES[purpose].format(code=code))
    except SMSError:
        otp.delete()
        raise
    dev = (settings.DEBUG or getattr(settings, "OTP_DEMO_MODE", False)) and getattr(settings, "SMS_BACKEND", "console") == "console"
    return code if dev else None


def verify(phone, purpose, code):
    """Raises a ValidationError on the 'otp' field, or marks the code used."""
    code = "".join(ch for ch in str(code or "") if ch.isdigit())
    otp = PhoneOTP.objects.filter(phone=phone, purpose=purpose, used=False).first()
    if not otp or otp.expired:
        raise serializers.ValidationError({"otp": ["otp_expired"]})
    if otp.attempts >= PhoneOTP.MAX_TRIES:
        raise serializers.ValidationError({"otp": ["otp_tries"]})
    if not otp.matches(code):
        otp.attempts += 1
        otp.save(update_fields=["attempts"])
        raise serializers.ValidationError({"otp": ["otp_wrong"]})
    otp.used = True
    otp.save(update_fields=["used"])
