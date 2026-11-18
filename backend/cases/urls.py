from django.urls import path

from . import views as v

urlpatterns = [
    # every role
    path("notifications/", v.NotificationListView.as_view()),
    path("notifications/read/", v.NotificationReadView.as_view()),
    path("photos/case/<int:photo_id>/", v.CasePhotoView.as_view()),
    path("photos/record/<int:photo_id>/", v.RecordPhotoView.as_view()),
    # family (Scenario 3)
    path("family/summary/", v.SummaryView.as_view()),
    path("family/cases/", v.CaseCreateView.as_view()),
    path("family/cases/<int:pk>/", v.CaseDetailView.as_view()),
    path("family/matches/<int:pk>/", v.FamilyMatchView.as_view()),
    # police station and medical team (Scenarios 1 and 2)
    path("reporter/summary/", v.ReporterSummaryView.as_view()),
    path("reporter/records/", v.RecordListCreateView.as_view()),
    path("reporter/records/<int:pk>/", v.RecordDetailView.as_view()),
    path("reporter/records/<int:pk>/photos/<int:photo_id>/", v.RecordPhotoDeleteView.as_view()),
    path("reporter/merges/<int:pk>/", v.MergeDecisionView.as_view()),
    # case officer
    path("officer/queue/", v.QueueView.as_view()),
    path("officer/matches/<int:pk>/", v.OfficerMatchView.as_view()),
    path("officer/matches/<int:pk>/reunite/", v.ReuniteView.as_view()),
    # every family report: police stations, case officers, admins
    path("reports/", v.ReportListView.as_view()),
    path("reports/<int:pk>/", v.ReportDetailView.as_view()),
    path("officer/records/", v.OfficerRecordsView.as_view()),
    path("officer/records/<int:pk>/", v.OfficerRecordDetailView.as_view()),
    # admin and auditor
    path("admin/summary/", v.AdminSummaryView.as_view()),
    path("admin/users/", v.AdminUsersView.as_view()),
    path("admin/users/<int:pk>/", v.AdminUserDetailView.as_view()),
    path("audit/", v.AuditListView.as_view()),
]
