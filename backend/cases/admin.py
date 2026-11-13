from django.contrib import admin
from .models import CasePhoto, FoundRecord, Match, MissingCase, Notification, RecordVisit


class PhotoInline(admin.TabularInline):
    model = CasePhoto
    extra = 0


@admin.register(MissingCase)
class MissingCaseAdmin(admin.ModelAdmin):
    list_display = ("person_name", "owner", "division", "created_at")
    inlines = [PhotoInline]


@admin.register(FoundRecord)
class FoundRecordAdmin(admin.ModelAdmin):  # stand-in for the police/medical portal
    list_display = ("id", "source", "condition", "gender", "division", "is_active", "created_at")
    list_filter = ("source", "condition", "is_active")


admin.site.register(Match)
admin.site.register(Notification)
admin.site.register(RecordVisit)
