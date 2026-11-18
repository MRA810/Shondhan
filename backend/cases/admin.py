from django.contrib import admin

from .models import AuditLog, FoundRecord, MergeRequest, Match, MissingCase, Notification


@admin.register(MissingCase)
class MissingCaseAdmin(admin.ModelAdmin):
    list_display = ("person_name", "owner", "gender", "person_age", "division", "created_at")
    search_fields = ("person_name", "owner__phone")


@admin.register(FoundRecord)
class FoundRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "source", "condition", "found_place", "division", "is_active", "created_at")
    list_filter = ("source", "condition", "is_active", "division")


@admin.register(Match)
class MatchAdmin(admin.ModelAdmin):
    list_display = ("case", "record", "score", "status", "created_at")
    list_filter = ("status",)


@admin.register(MergeRequest)
class MergeRequestAdmin(admin.ModelAdmin):
    list_display = ("a", "b", "score", "a_ok", "b_ok", "status")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "is_read", "created_at")
    list_filter = ("kind", "is_read")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Read only: the ledger is never edited by hand."""
    list_display = ("created_at", "actor_name", "actor_role", "action", "target_type", "target_id", "ip")
    list_filter = ("action", "actor_role", "target_type")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
