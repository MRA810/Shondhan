from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import User

class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="first_name")
    class Meta:
        model = User
        fields = ("id", "full_name", "phone", "email", "role")

class RegisterSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=100)
    phone = serializers.RegexField(r"^01\d{9}$")
    email = serializers.EmailField(required=False, allow_blank=True)
    age = serializers.IntegerField(min_value=18)  # minors cannot create cases
    password = serializers.CharField(write_only=True)

    def validate_phone(self, v):
        if User.objects.filter(phone=v).exists():
            raise serializers.ValidationError("exists")
        return v

    def validate_password(self, v):
        validate_password(v)
        return v

    def create(self, d):
        return User.objects.create_user(username=d["phone"], phone=d["phone"], email=d.get("email", ""),
                                        first_name=d["full_name"], password=d["password"], role="family")
