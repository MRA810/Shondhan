from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers
from .models import User

RELATIONS = ["parent", "spouse", "child", "sibling", "relative", "friend", "other"]
DIVISIONS = ["dhaka", "chattogram", "rajshahi", "khulna", "barishal", "sylhet", "rangpur", "mymensingh"]
CONSENT_VERSION = "v1"
BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="first_name")
    class Meta:
        model = User
        fields = ("id", "full_name", "phone", "email", "role", "age", "relationship",
                  "alt_phone", "division", "address")

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


class ProfileUpdateSerializer(serializers.Serializer):
    """Fields a user may change after signup. Phone is the login id, so it is not editable."""
    full_name = serializers.CharField(max_length=100, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    age = serializers.IntegerField(min_value=18, max_value=120, required=False)
    relationship = serializers.ChoiceField(choices=RELATIONS, required=False)
    alt_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    division = serializers.ChoiceField(choices=DIVISIONS, required=False, allow_blank=True)
    address = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate_full_name(self, v):
        v = v.strip()
        if not v:
            raise serializers.ValidationError("blank")
        return v

    def validate_email(self, v):
        if v and User.objects.filter(email__iexact=v).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("exists")
        return v

    def validate_alt_phone(self, v):
        v = v.strip().translate(BN_DIGITS)
        if v and not (len(v) == 11 and v.isdigit() and v.startswith("01")):
            raise serializers.ValidationError("bad_phone")
        return v

    def validate_address(self, v):
        return v.strip()

    def update(self, user, d):
        if "full_name" in d:
            user.first_name = d.pop("full_name")
        for k, val in d.items():
            setattr(user, k, val)
        user.save()
        return user
