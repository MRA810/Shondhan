from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User

@admin.register(User)
class ShondhanUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Shondhan", {"fields": ("phone", "role", "failed_attempts", "locked_until")}),)
    list_display = ("username", "phone", "role", "is_active")
    list_filter = ("role", "is_active")
