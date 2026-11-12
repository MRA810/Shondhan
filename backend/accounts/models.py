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

# New models for Family Cases and Matches
class FamilyCase(models.Model):
    """Represents a missing person case reported by a family member."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='cases')
    name = models.CharField(max_length=100)
    age = models.PositiveSmallIntegerField()
    gender = models.CharField(max_length=10)
    last_seen_location = models.CharField(max_length=200)
    last_seen_date = models.DateField()
    traits = models.TextField(blank=True)  # free‑form description of physical traits
    attire = models.TextField(blank=True)  # description of clothing, accessories
    contact_phone = models.CharField(max_length=20)
    contact_email = models.EmailField(blank=True)
    status = models.CharField(max_length=20, default='open')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Case {self.id}: {self.name} (by {self.user.username})"

class CaseMatch(models.Model):
    """Potential match for a FamilyCase coming from police or medical streams."""
    case = models.ForeignKey(FamilyCase, on_delete=models.CASCADE, related_name='matches')
    source_type = models.CharField(max_length=20)  # e.g., 'police', 'medical'
    source_name = models.CharField(max_length=100)
    contact = models.CharField(max_length=100)
    location = models.CharField(max_length=200)
    match_score = models.FloatField()
    matched_traits = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, default='pending')
    found_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Match {self.id} for Case {self.case.id} ({self.match_score:.1f}%)"

