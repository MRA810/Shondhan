from django.utils import timezone
from rest_framework import serializers

from accounts.serializers import RELATIONS
from .models import Case, CasePhoto, Match, Notification

MAX_FILE = 5 * 1024 * 1024
GENDERS = ["male", "female", "other"]
MARKS = ["none", "scar", "tattoo", "birthmark", "other"]


def _check_files(files):
    for f in files:
        if f.size > MAX_FILE:
            raise serializers.ValidationError("too_big")
    return files


class CaseCreateSerializer(serializers.Serializer):
    person_name = serializers.CharField(max_length=100)
    person_age = serializers.IntegerField(min_value=0, max_value=120, required=False, allow_null=True)
    gender = serializers.ChoiceField(choices=GENDERS)
    relationship = serializers.ChoiceField(choices=RELATIONS)
    last_seen_place = serializers.CharField(max_length=200, required=False, allow_blank=True)
    last_seen_at = serializers.DateTimeField(required=False, allow_null=True)
    clothing = serializers.CharField(max_length=200, required=False, allow_blank=True)
    marks_type = serializers.ChoiceField(choices=MARKS, required=False, default="none")
    marks_detail = serializers.CharField(max_length=200, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)
    photos = serializers.ListField(child=serializers.ImageField(), min_length=3, max_length=8)
    documents = serializers.ListField(child=serializers.ImageField(), max_length=4, required=False)

    def validate_person_name(self, v):
        v = v.strip()
        if not v:
            raise serializers.ValidationError("blank")
        return v

    def validate_last_seen_at(self, v):
        if v and v > timezone.now():
            raise serializers.ValidationError("future")
        return v

    def validate_photos(self, v):
        return _check_files(v)

    def validate_documents(self, v):
        return _check_files(v)

    def create(self, d):
        photos, docs = d.pop("photos"), d.pop("documents", [])
        case = Case.objects.create(owner=self.context["request"].user, **d)
        CasePhoto.objects.bulk_create(
            [CasePhoto(case=case, kind=CasePhoto.Kind.PHOTO, image=f) for f in photos]
            + [CasePhoto(case=case, kind=CasePhoto.Kind.DOCUMENT, image=f) for f in docs])
        return case


class CaseSerializer(serializers.ModelSerializer):
    # filled by annotate() in the view; best_score ignores restricted records
    match_count = serializers.IntegerField(read_only=True)
    best_score = serializers.IntegerField(read_only=True, allow_null=True)
    photo_id = serializers.SerializerMethodField()  # first picture, used as the card thumbnail

    class Meta:
        model = Case
        fields = ("id", "person_name", "person_age", "last_seen_place", "last_seen_at",
                  "created_at", "match_count", "best_score", "photo_id")

    def get_photo_id(self, obj):
        return next((p.id for p in obj.photos.all() if p.kind == CasePhoto.Kind.PHOTO), None)


class MatchSerializer(serializers.ModelSerializer):
    case_id = serializers.IntegerField(read_only=True)
    case_name = serializers.SerializerMethodField()
    band = serializers.CharField(read_only=True)

    class Meta:
        model = Match
        fields = ("id", "case_id", "case_name", "record_kind", "score", "band",
                  "found_place", "found_area", "found_at", "contact_phone", "verified")

    def get_case_name(self, obj):
        return obj.case.person_name

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if obj.record_kind == Match.Kind.DECEASED:  # restricted: nothing identifying leaves the server
            data.update(score=None, band="restricted", found_place="", found_area="",
                        found_at=None, contact_phone="")
        return data


class NotificationSerializer(serializers.ModelSerializer):
    case_name = serializers.SerializerMethodField()
    score = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = ("id", "kind", "case_name", "score", "is_read", "created_at")

    def get_case_name(self, obj):
        return obj.case.person_name if obj.case_id else ""

    def get_score(self, obj):
        return obj.match.score if obj.kind == Notification.Kind.MATCH and obj.match_id else None
