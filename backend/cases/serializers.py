from django.db import transaction
from rest_framework import serializers

from .models import CasePhoto, FoundRecord, Match, MissingCase, Notification

MAX_MB = 5


def _abs(request, f):
    return request.build_absolute_uri(f.url) if f else None


class CasePhotoSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = CasePhoto
        fields = ("id", "kind", "url")

    def get_url(self, o):
        return _abs(self.context["request"], o.image)


class CaseSerializer(serializers.ModelSerializer):
    photos = CasePhotoSerializer(many=True, read_only=True)
    photo_files = serializers.ListField(child=serializers.ImageField(), write_only=True, min_length=3)
    id_files = serializers.ListField(child=serializers.ImageField(), write_only=True, required=False)

    class Meta:
        model = MissingCase
        fields = ("id", "person_name", "age_approx", "gender", "height_cm", "division", "last_seen_place",
                  "last_seen_date", "clothing", "body_marks", "description", "cannot_speak", "created_at",
                  "photos", "photo_files", "id_files")
        read_only_fields = ("id", "created_at")

    def _check_size(self, files):
        if any(f.size > MAX_MB * 1024 * 1024 for f in files):
            raise serializers.ValidationError("too_big")
        return files

    def validate_photo_files(self, v):
        return self._check_size(v)

    def validate_id_files(self, v):
        return self._check_size(v)

    def validate_age_approx(self, v):
        if v is not None and v > 120:
            raise serializers.ValidationError("bad_age")
        return v

    @transaction.atomic
    def create(self, data):
        photos = data.pop("photo_files")
        ids = data.pop("id_files", [])
        case = MissingCase.objects.create(**data)
        for f in photos:
            CasePhoto.objects.create(case=case, image=f, kind=CasePhoto.Kind.FACE)
        for f in ids:
            CasePhoto.objects.create(case=case, image=f, kind=CasePhoto.Kind.ID)
        return case


class FoundBriefSerializer(serializers.ModelSerializer):
    photo = serializers.SerializerMethodField()

    class Meta:
        model = FoundRecord
        fields = ("id", "source", "condition", "gender", "age_min", "age_max", "division", "photo")

    def get_photo(self, o):
        return _abs(self.context["request"], o.photo)


class FoundFullSerializer(FoundBriefSerializer):
    class Meta(FoundBriefSerializer.Meta):
        fields = FoundBriefSerializer.Meta.fields + (
            "place", "clothing", "body_marks", "notes", "contact_phone", "created_at")


class MatchListSerializer(serializers.ModelSerializer):
    record = FoundBriefSerializer(read_only=True)

    class Meta:
        model = Match
        fields = ("id", "score", "reasons", "seen", "created_at", "record")


class MatchDetailSerializer(serializers.ModelSerializer):
    record = FoundFullSerializer(read_only=True)
    case_id = serializers.IntegerField(read_only=True)
    person_name = serializers.CharField(source="case.person_name", read_only=True)

    class Meta:
        model = Match
        fields = ("id", "score", "reasons", "case_id", "person_name", "record")


class NotificationSerializer(serializers.ModelSerializer):
    match_id = serializers.IntegerField(read_only=True)
    case_id = serializers.IntegerField(source="match.case_id", read_only=True)
    person_name = serializers.CharField(source="match.case.person_name", read_only=True)
    score = serializers.IntegerField(source="match.score", read_only=True)

    class Meta:
        model = Notification
        fields = ("id", "read", "created_at", "match_id", "case_id", "person_name", "score")
