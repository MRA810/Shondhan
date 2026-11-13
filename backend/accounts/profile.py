import re

from rest_framework import generics, serializers
from rest_framework.permissions import IsAuthenticated

from .models import User

BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


class ProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="first_name", max_length=100)

    class Meta:
        model = User
        fields = ("full_name", "phone", "email", "alt_phone", "address", "division", "age", "relationship")
        read_only_fields = ("phone", "age", "relationship")

    def validate_email(self, v):
        if v and User.objects.filter(email__iexact=v).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError("exists")
        return v

    def validate_alt_phone(self, v):
        v = (v or "").strip().translate(BN_DIGITS)
        if v and not re.fullmatch(r"01\d{9}", v):
            raise serializers.ValidationError("bad_phone")
        return v


class ProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ProfileSerializer
    http_method_names = ["get", "patch"]

    def get_object(self):
        return self.request.user
