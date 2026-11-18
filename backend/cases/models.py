import os
import uuid

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver

MAX_ACTIVE_CASES = 5


class PrivateStorage(FileSystemStorage):
    """Photos of missing and found people are NOT served from a public /media/ URL.
    They live outside any public folder and are only sent through permission-checked views."""

    @property
    def base_location(self):
        return getattr(settings, "PRIVATE_MEDIA_ROOT", settings.BASE_DIR / "private_media")

    @property
    def location(self):
        return os.path.abspath(self.base_location)


private_storage = PrivateStorage()


def _safe_ext(filename):
    ext = os.path.splitext(filename)[1].lower()
    return ext if ext in (".jpg", ".jpeg", ".png", ".webp") else ".jpg"


def case_photo_path(instance, filename):
    return f"cases/{instance.case_id}/{uuid.uuid4().hex}{_safe_ext(filename)}"


def record_photo_path(instance, filename):
    return f"records/{instance.record_id}/{uuid.uuid4().hex}{_safe_ext(filename)}"


class PhotoKind(models.TextChoices):
    PHOTO = "photo"        # pictures of the person
    DOCUMENT = "document"  # NID / student / worker ID / driving licence pictures


class Gender(models.TextChoices):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    UNKNOWN = "unknown"


class MissingCase(models.Model):
    """Scenario 3: a missing-person post made by a family member (searching stream)."""
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="cases")
    relationship = models.CharField(max_length=12)  # the poster's relationship with this person
    person_name = models.CharField(max_length=100)
    person_age = models.PositiveSmallIntegerField(null=True, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices)
    height_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    division = models.CharField(max_length=20, blank=True)
    last_seen_place = models.CharField(max_length=200, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    traits = models.JSONField(default=dict, blank=True)    # skin / build / hair / hair_length
    clothing = models.JSONField(default=list, blank=True)  # [{item, color}]
    belongings = models.CharField(max_length=300, blank=True)
    marks = models.JSONField(default=list, blank=True)     # [{region, part, type, detail}]
    cannot_speak = models.BooleanField(default=False)
    id_type = models.CharField(max_length=12, blank=True)
    id_number = models.CharField(max_length=40, blank=True)
    notes = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.person_name} (case {self.pk})"


class CasePhoto(models.Model):
    case = models.ForeignKey(MissingCase, on_delete=models.CASCADE, related_name="photos")
    kind = models.CharField(max_length=10, choices=PhotoKind.choices, default=PhotoKind.PHOTO)
    image = models.ImageField(upload_to=case_photo_path, storage=private_storage)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]


class FoundRecord(models.Model):
    """Scenarios 1 and 2: a person found by the police or treated by a medical team (found stream)."""

    class Source(models.TextChoices):
        POLICE = "police"
        MEDICAL = "medical"

    class Condition(models.TextChoices):
        CONSCIOUS = "conscious"      # conscious and able to communicate
        UNCONSCIOUS = "unconscious"  # unconscious or unable to communicate
        MUTE = "mute"                # mute or unable to give identifying details
        ACCIDENT = "accident"        # found after an accident or disaster
        DECEASED = "deceased"        # restricted, sensitive record

    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="records")
    source = models.CharField(max_length=10, choices=Source.choices)
    condition = models.CharField(max_length=12, choices=Condition.choices)
    name_hint = models.CharField(max_length=100, blank=True)  # a name the person gave, or found on them
    gender = models.CharField(max_length=10, choices=Gender.choices, default=Gender.UNKNOWN)
    age_min = models.PositiveSmallIntegerField(null=True, blank=True)
    age_max = models.PositiveSmallIntegerField(null=True, blank=True)
    height_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    traits = models.JSONField(default=dict, blank=True)
    clothing = models.JSONField(default=list, blank=True)
    belongings = models.CharField(max_length=300, blank=True)
    marks = models.JSONField(default=list, blank=True)
    id_type = models.CharField(max_length=12, blank=True)
    id_number = models.CharField(max_length=40, blank=True)
    medical_notes = models.CharField(max_length=500, blank=True)  # injuries, treatment (medical teams)
    notes = models.CharField(max_length=500, blank=True)
    # where the person is now, and who to call
    division = models.CharField(max_length=20)
    found_place = models.CharField(max_length=200)  # station or hospital
    found_area = models.CharField(max_length=150, blank=True)
    found_at = models.DateTimeField()
    contact_name = models.CharField(max_length=100, blank=True)
    contact_phone = models.CharField(max_length=20)
    is_active = models.BooleanField(default=True)
    merged_into = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="merged_from")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_deceased(self):
        return self.condition == self.Condition.DECEASED

    def __str__(self):
        return f"{self.source} record {self.pk} at {self.found_place}"


class RecordPhoto(models.Model):
    record = models.ForeignKey(FoundRecord, on_delete=models.CASCADE, related_name="photos")
    kind = models.CharField(max_length=10, choices=PhotoKind.choices, default=PhotoKind.PHOTO)
    image = models.ImageField(upload_to=record_photo_path, storage=private_storage)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]


@receiver(post_delete, sender=CasePhoto)
@receiver(post_delete, sender=RecordPhoto)
def remove_photo_file(sender, instance, **kwargs):
    """When a case or record is closed the picture files go too, not just the rows."""
    if instance.image:
        instance.image.delete(save=False)


class Match(models.Model):
    """A suggestion from the matching engine. Never a verdict: a case officer confirms it."""

    class Status(models.TextChoices):
        PENDING = "pending"      # waiting for an officer
        CONFIRMED = "confirmed"  # officer confirmed it is likely the same person
        REJECTED = "rejected"    # officer ruled it out

    HIGH, POSSIBLE = 85, 60  # percentage bands

    case = models.ForeignKey(MissingCase, on_delete=models.CASCADE, related_name="matches")
    record = models.ForeignKey(FoundRecord, on_delete=models.CASCADE, related_name="matches")
    score = models.PositiveSmallIntegerField()  # 0-100
    reasons = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-score", "-created_at"]
        constraints = [models.UniqueConstraint(fields=["case", "record"], name="one_match_per_pair")]

    @classmethod
    def band_for(cls, score):
        if score >= cls.HIGH:
            return "high"
        return "possible" if score >= cls.POSSIBLE else "low"

    @property
    def band(self):
        return self.band_for(self.score)

    @property
    def restricted(self):
        return self.record.is_deceased

    def __str__(self):
        return f"case {self.case_id} / record {self.record_id}: {self.score}%"


class MergeRequest(models.Model):
    """Police and hospital may post the same person. Both sides must agree before the records are merged."""

    class Status(models.TextChoices):
        PENDING = "pending"
        MERGED = "merged"
        DECLINED = "declined"

    a = models.ForeignKey(FoundRecord, on_delete=models.CASCADE, related_name="merge_as_a")  # the older record (kept)
    b = models.ForeignKey(FoundRecord, on_delete=models.CASCADE, related_name="merge_as_b")
    score = models.PositiveSmallIntegerField()
    reasons = models.JSONField(default=list, blank=True)
    a_ok = models.BooleanField(default=False)
    b_ok = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["a", "b"], name="one_merge_per_pair")]


class Notification(models.Model):
    class Kind(models.TextChoices):
        MATCH = "match"          # family: a living-person match was found
        VERIFIED = "verified"    # family: an officer confirmed a match
        OFFICER = "officer"      # family: an officer will contact you (restricted records)
        REUNITED = "reunited"    # family / reporter: case closed as reunited
        MERGE = "merge"          # reporter: a possible duplicate needs your permission
        MERGED = "merged"        # reporter: two records were merged
        APPROVED = "approved"    # staff: account approved
        SYSTEM = "system"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=10, choices=Kind.choices)
    case = models.ForeignKey(MissingCase, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    match = models.ForeignKey(Match, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    record = models.ForeignKey(FoundRecord, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    merge = models.ForeignKey(MergeRequest, null=True, blank=True, on_delete=models.CASCADE, related_name="notifications")
    params = models.JSONField(default=dict, blank=True)  # text values (name, pct, place) so the message survives deletes
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]


class AuditLog(models.Model):
    """Append-only ledger: who created, viewed, changed or deleted what. Rows are never edited.
    Targets are stored as plain ids so the trail survives when a case or record is deleted."""
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    actor_name = models.CharField(max_length=100, blank=True)
    actor_role = models.CharField(max_length=10, blank=True)
    action = models.CharField(max_length=30)
    target_type = models.CharField(max_length=10, blank=True)  # case / record / match / merge / user
    target_id = models.BigIntegerField(null=True, blank=True)
    detail = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["target_type", "target_id"])]

    def save(self, *args, **kwargs):
        if self.pk:
            raise RuntimeError("Audit log rows cannot be changed.")
        super().save(*args, **kwargs)
