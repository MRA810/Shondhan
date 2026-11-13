from django.contrib.auth.models import AbstractUser
from django.db import models

class User(AbstractUser):
    class Role(models.TextChoices):
        FAMILY = "family"
        POLICE = "police"
        MEDICAL = "medical"
        OFFICER = "officer"
        ADMIN = "admin"
        AUDITOR = "auditor"

    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.FAMILY)
    failed_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    age = models.PositiveSmallIntegerField(null=True, blank=True)
    relationship = models.CharField(max_length=12, blank=True)
    consent_version = models.CharField(max_length=10, blank=True)
    consent_at = models.DateTimeField(null=True, blank=True)

    # profile extras (new)
    alt_phone = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    division = models.CharField(max_length=20, blank=True)
