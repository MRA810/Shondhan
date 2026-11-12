from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from .models import User

RELATIONS = ["parent", "spouse", "child", "sibling", "relative", "friend", "other"]
CONSENT_VERSION = "v1"
BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="first_name")
    class Meta:
        model = User
        fields = ("id", "full_name", "phone", "email", "role", "age", "relationship", "consent_version", "consent_at", "date_joined", "last_login")

# Serializers for Family Cases and Matches
from .models import FamilyCase, CaseMatch

class FamilyCaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = FamilyCase
        fields = ("id", "user", "name", "age", "gender", "last_seen_location", "last_seen_date", "traits", "attire", "contact_phone", "contact_email", "status", "created_at", "updated_at")
        read_only_fields = ("user", "created_at", "updated_at")

class CaseMatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = CaseMatch
        fields = ("id", "case", "source_type", "source_name", "contact", "location", "match_score", "matched_traits", "status", "found_date", "created_at")
        read_only_fields = ("case", "created_at")


class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=100)
    phone = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)
    age = serializers.IntegerField(min_value=18, max_value=120)  # minors cannot create cases
    relationship = serializers.ChoiceField(choices=RELATIONS)
    password = serializers.CharField(write_only=True)
    consent = serializers.BooleanField()

    def validate_phone(self, v):
        v = v.strip().translate(BN_DIGITS)  # accept Bangla digits
        if not (len(v) == 11 and v.isdigit() and v.startswith("01")):
            raise serializers.ValidationError("bad_phone")
        if User.objects.filter(phone=v).exists():
            raise serializers.ValidationError("exists")
        return v

    def validate_email(self, v):
        if v and User.objects.filter(email__iexact=v).exists():
            raise serializers.ValidationError("exists")
        return v

    def validate_password(self, v):
        validate_password(v)
        return v

    def validate_consent(self, v):
        if not v:
            raise serializers.ValidationError("required")
        return v

    def create(self, d):
        return User.objects.create_user(
            username=d["phone"], phone=d["phone"], email=d.get("email", ""),
            first_name=d["full_name"].strip(), password=d["password"], role="family",
            age=d["age"], relationship=d["relationship"],
            consent_version=CONSENT_VERSION, consent_at=timezone.now())
