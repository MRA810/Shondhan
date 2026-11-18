from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    class Role(models.TextChoices):
        FAMILY = "family"
        POLICE = "police"
        MEDICAL = "medical"
        OFFICER = "officer"
        ADMIN = "admin"
        AUDITOR = "auditor"

    REPORTER_ROLES = ("police", "medical")
    STAFF_ROLES = ("police", "medical", "officer", "admin", "auditor")

    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.FAMILY)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    age = models.PositiveSmallIntegerField(null=True, blank=True)
    relationship = models.CharField(max_length=12, blank=True)
    consent_version = models.CharField(max_length=10, blank=True)
    consent_at = models.DateTimeField(null=True, blank=True)

    # optional profile details the family can add later
    alt_phone = models.CharField(max_length=20, blank=True)
    division = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=200, blank=True)

    # staff (police station / hospital) details, checked by an admin before approval
    organization = models.CharField(max_length=150, blank=True)  # station or hospital name
    designation = models.CharField(max_length=80, blank=True)
    staff_id = models.CharField(max_length=40, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    @property
    def is_reporter(self):
        return self.role in self.REPORTER_ROLES

    @property
    def awaiting_approval(self):
        return self.role in self.STAFF_ROLES and not self.is_active and self.approved_at is None


class PhoneOTP(models.Model):
    """A one-time code sent by SMS to prove the person owns the phone number (signup and password reset).
    Only a hash of the code is stored."""

    class Purpose(models.TextChoices):
        SIGNUP = "signup"
        RESET = "reset"

    TTL = timedelta(minutes=5)
    MAX_TRIES = 5

    phone = models.CharField(max_length=20, db_index=True)
    purpose = models.CharField(max_length=10, choices=Purpose.choices)
    code_hash = models.CharField(max_length=128)
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def expired(self):
        return timezone.now() > self.created_at + self.TTL

    def set_code(self, code):
        self.code_hash = make_password(code)

    def matches(self, code):
        return check_password(code, self.code_hash)
