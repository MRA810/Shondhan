from django.contrib.auth.password_validation import validate_password
from django.utils import timezone
from rest_framework import serializers

from .models import User

RELATIONS = ["parent", "spouse", "child", "sibling", "relative", "friend", "other"]
DIVISIONS = ["dhaka", "chattogram", "rajshahi", "khulna", "barishal", "sylhet", "rangpur", "mymensingh"]
CONSENT_VERSION = "v1"
BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def clean_phone(v, required=True):
    """Accepts Bangla digits; returns 01XXXXXXXXX or raises bad_phone."""
    v = (v or "").strip().replace(" ", "").replace("-", "").translate(BN_DIGITS)
    if v.startswith("+88"):
        v = v[3:]
    if not v and not required:
        return ""
    if not (len(v) == 11 and v.isdigit() and v.startswith("01")):
        raise serializers.ValidationError("bad_phone")
    return v


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="first_name")

    class Meta:
        model = User
        fields = ("id", "full_name", "phone", "email", "role", "age", "relationship",
                  "alt_phone", "division", "address", "organization", "designation", "staff_id")


class _SignupBase(serializers.Serializer):
    full_name = serializers.CharField(max_length=100)
    phone = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)
    consent = serializers.BooleanField()
    otp = serializers.CharField(write_only=True)  # the SMS code proving the phone belongs to them

    def validate_full_name(self, v):
        v = v.strip()
        if not v:
            raise serializers.ValidationError("blank")
        return v

    def validate_phone(self, v):
        v = clean_phone(v)
        if User.objects.filter(phone=v).exists() or User.objects.filter(username=v).exists():
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

    def validate(self, d):
        from .otp import verify
        verify(d["phone"], "signup", d.pop("otp"))  # checked last, so a typo elsewhere does not use up the code
        return d


class RegisterSerializer(_SignupBase):
    age = serializers.IntegerField(min_value=18, max_value=120)  # minors cannot create cases
    relationship = serializers.ChoiceField(choices=RELATIONS)

    def create(self, d):
        return User.objects.create_user(
            username=d["phone"], phone=d["phone"], email=d.get("email", ""),
            first_name=d["full_name"], password=d["password"], role=User.Role.FAMILY,
            age=d["age"], relationship=d["relationship"],
            consent_version=CONSENT_VERSION, consent_at=timezone.now())


class StaffRegisterSerializer(_SignupBase):
    """Police stations and hospitals ask for an account; an admin must approve it before they can log in."""
    role = serializers.ChoiceField(choices=["police", "medical"])
    organization = serializers.CharField(max_length=150)
    designation = serializers.CharField(max_length=80)
    staff_id = serializers.CharField(max_length=40)
    division = serializers.ChoiceField(choices=DIVISIONS)

    def validate_organization(self, v):
        v = v.strip()
        if not v:
            raise serializers.ValidationError("blank")
        return v

    def create(self, d):
        return User.objects.create_user(
            username=d["phone"], phone=d["phone"], email=d.get("email", ""),
            first_name=d["full_name"], password=d["password"], role=d["role"], is_active=False,
            organization=d["organization"], designation=d["designation"].strip(),
            staff_id=d["staff_id"].strip(), division=d["division"],
            consent_version=CONSENT_VERSION, consent_at=timezone.now())


class ProfileUpdateSerializer(serializers.Serializer):
    """Fields a user may change after signup. Phone is the login id and role is set by admins, so neither is editable."""
    full_name = serializers.CharField(max_length=100, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    age = serializers.IntegerField(min_value=18, max_value=120, required=False)
    relationship = serializers.ChoiceField(choices=RELATIONS, required=False)
    alt_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    division = serializers.ChoiceField(choices=DIVISIONS, required=False, allow_blank=True)
    address = serializers.CharField(max_length=200, required=False, allow_blank=True)
    designation = serializers.CharField(max_length=80, required=False, allow_blank=True)

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
        return clean_phone(v, required=False)

    def validate_address(self, v):
        return v.strip()

    def update(self, user, d):
        if "full_name" in d:
            user.first_name = d.pop("full_name")
        if user.role != User.Role.FAMILY:
            d.pop("age", None)
            d.pop("relationship", None)
        for k, val in d.items():
            setattr(user, k, val)
        user.save()
        return user


class OTPRequestSerializer(serializers.Serializer):
    phone = serializers.CharField()
    purpose = serializers.ChoiceField(choices=["signup", "reset"])

    def validate_phone(self, v):
        return clean_phone(v)


class PasswordResetSerializer(serializers.Serializer):
    phone = serializers.CharField()
    otp = serializers.CharField()
    password = serializers.CharField()

    def validate_phone(self, v):
        return clean_phone(v)

    def validate(self, d):
        from .otp import verify
        user = User.objects.filter(phone=d["phone"]).first()
        try:
            validate_password(d["password"], user)
        except Exception:
            raise serializers.ValidationError({"password": ["weak"]})
        verify(d["phone"], "reset", d["otp"])
        if not user:  # same answer as a wrong code: do not reveal which numbers have accounts
            raise serializers.ValidationError({"otp": ["otp_wrong"]})
        d["user"] = user
        return d
