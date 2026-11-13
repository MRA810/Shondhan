import os
import uuid

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver

MAX_ACTIVE_CASES = 5


class PrivateStorage(FileSystemStorage):
    """Photos of missing people are NOT served from a public /media/ URL.
    They live outside any public folder and are only sent through an authenticated view."""

    @property
    def base_location(self):
        return getattr(settings, "PRIVATE_MEDIA_ROOT", settings.BASE_DIR / "private_media")

    @property
    def location(self):
        return os.path.abspath(self.base_location)


def case_photo_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    return f"cases/{instance.case_id}/{uuid.uuid4().hex}{ext}"


class Case(models.Model):
    """A missing-person report made by a family member (Scenario 3).
    Photos, traits and the 5-active-case limit come with the case form (next phase)."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cases")
    person_name = models.CharField(max_length=100)
    person_age = models.PositiveSmallIntegerField(null=True, blank=True)
    last_seen_place = models.CharField(max_length=200, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    relationship = models.CharField(max_length=12, blank=True)  # per-case, as in the SRS
    gender = models.CharField(max_length=10, blank=True)
    clothing = models.CharField(max_length=200, blank=True)
    marks_type = models.CharField(max_length=20, blank=True)  # none / scar / tattoo / birthmark / other
    marks_detail = models.CharField(max_length=200, blank=True)
    notes = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.person_name} ({self.owner_id})"


class CasePhoto(models.Model):
    class Kind(models.TextChoices):
        PHOTO = "photo"        # pictures of the person (3 minimum per case)
        DOCUMENT = "document"  # optional NID / student ID / licence pictures

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="photos")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.PHOTO)
    image = models.ImageField(upload_to=case_photo_path, storage=PrivateStorage())
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]


@receiver(post_delete, sender=CasePhoto)
def remove_photo_file(sender, instance, **kwargs):
    """When a case is closed ("person found") the picture files go too, not just the rows."""
    if instance.image:
        instance.image.delete(save=False)


class Match(models.Model):
    """A suggestion from the matching engine. Never a verdict: a human confirms it."""
    class Kind(models.TextChoices):
        LIVING = "living"
        DECEASED = "deceased"  # restricted: details are never sent to the family app

    HIGH, POSSIBLE = 85, 60  # percentage bands

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="matches")
    record_kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.LIVING)
    score = models.PositiveSmallIntegerField()  # 0-100
    found_place = models.CharField(max_length=200, blank=True)  # hospital / police station
    found_area = models.CharField(max_length=100, blank=True)
    found_at = models.DateTimeField(null=True, blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    verified = models.BooleanField(default=False)  # confirmed by a case officer
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-score", "-created_at"]

    @property
    def band(self):
        if self.score >= self.HIGH:
            return "high"
        return "possible" if self.score >= self.POSSIBLE else "low"

    def __str__(self):
        return f"{self.case_id}: {self.score}% ({self.record_kind})"


class Notification(models.Model):
    class Kind(models.TextChoices):
        MATCH = "match"      # a living-person match
        OFFICER = "officer"  # an officer will contact the family (used for restricted records)
        SYSTEM = "system"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    case = models.ForeignKey(Case, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    match = models.ForeignKey(Match, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
