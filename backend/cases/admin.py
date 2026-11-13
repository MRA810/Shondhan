from django.contrib import admin
from .models import Case, Match, Notification


@admin.register(Case)
class CaseAdmin(admin.ModelAdmin):
    list_display = ("person_name", "owner", "created_at")
    search_fields = ("person_name", "owner__phone")


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ("case", "record_kind", "score", "verified", "created_at")
    list_filter = ("record_kind", "verified")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "case", "is_read", "created_at")
    list_filter = ("kind", "is_read")
