from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class ShondhanUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Shondhan", {"fields": (
        "phone", "role", "failed_attempts", "locked_until", "age", "relationship", "alt_phone", "division",
        "address", "organization", "designation", "staff_id", "approved_at", "consent_version", "consent_at")}),)
    list_display = ("username", "first_name", "phone", "role", "organization", "is_active")
    list_filter = ("role", "is_active")
    search_fields = ("username", "first_name", "phone", "email", "organization")
