from django.conf import settings
from django.db import models
from django.db.models import Q

DIVISIONS = ["dhaka", "chattogram", "rajshahi", "khulna", "barishal", "sylhet", "rangpur", "mymensingh"]
DIVISION_CHOICES = [(d, d) for d in DIVISIONS]


class Gender(models.TextChoices):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    UNKNOWN = "unknown"


class MissingCase(models.Model):
    """A missing-person post made by a family member."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cases")
    person_name = models.CharField(max_length=100)
    age_approx = models.PositiveSmallIntegerField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, default=Gender.UNKNOWN)
    height_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    division = models.CharField(max_length=20, choices=DIVISION_CHOICES)
    last_seen_place = models.CharField(max_length=200, blank=True)
    last_seen_date = models.DateField(null=True, blank=True)
    clothing = models.TextField(blank=True)
    body_marks = models.TextField(blank=True)
    description = models.TextField(blank=True)
    cannot_speak = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class CasePhoto(models.Model):
    class Kind(models.TextChoices):
        FACE = "face"
        ID = "id"

    case = models.ForeignKey(MissingCase, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to="cases/%Y/%m/")
    kind = models.CharField(max_length=4, choices=Kind.choices, default=Kind.FACE)
    created_at = models.DateTimeField(auto_now_add=True)


class FoundRecord(models.Model):
    """A found person, posted by police or medical staff (their portal comes later)."""
    class Source(models.TextChoices):
        POLICE = "police"
        MEDICAL = "medical"

    class Condition(models.TextChoices):
        CONSCIOUS = "conscious"
        UNCONSCIOUS = "unconscious"
        MUTE = "mute"
        ACCIDENT = "accident"
        DECEASED = "deceased"  # restricted: never shown to families

    source = models.CharField(max_length=10, choices=Source.choices)
    reported_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                    on_delete=models.SET_NULL, related_name="found_records")
    condition = models.CharField(max_length=12, choices=Condition.choices, default=Condition.CONSCIOUS)
    gender = models.CharField(max_length=10, choices=Gender.choices, default=Gender.UNKNOWN)
    age_min = models.PositiveSmallIntegerField(null=True, blank=True)
    age_max = models.PositiveSmallIntegerField(null=True, blank=True)
    division = models.CharField(max_length=20, choices=DIVISION_CHOICES)
    place = models.CharField(max_length=200, blank=True)
    clothing = models.TextField(blank=True)
    body_marks = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    photo = models.ImageField(upload_to="found/%Y/%m/", null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)


# Families only ever see active, non-deceased records.
MATCH_VISIBLE = Q(record__is_active=True) & ~Q(record__condition=FoundRecord.Condition.DECEASED)


class Match(models.Model):
    case = models.ForeignKey(MissingCase, on_delete=models.CASCADE, related_name="matches")
    record = models.ForeignKey(FoundRecord, on_delete=models.CASCADE, related_name="matches")
    score = models.PositiveSmallIntegerField()          # 0-100
    reasons = models.JSONField(default=list)            # which traits matched
    seen = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("case", "record")
        ordering = ["-score"]


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    match = models.ForeignKey(Match, on_delete=models.CASCADE, related_name="notifications")
    read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class RecordVisit(models.Model):
    """Audit log: who opened which found-person record."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="record_visits")
    record = models.ForeignKey(FoundRecord, on_delete=models.CASCADE, related_name="visits")
    case = models.ForeignKey(MissingCase, null=True, on_delete=models.SET_NULL)
    visited_at = models.DateTimeField(auto_now_add=True)
