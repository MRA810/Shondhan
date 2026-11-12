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
