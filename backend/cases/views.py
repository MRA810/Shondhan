from django.db import transaction
from django.db.models import Count, Max, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MAX_ACTIVE_CASES, Case, CasePhoto, Match, Notification
from .permissions import IsFamily
from .serializers import CaseCreateSerializer, CaseSerializer, MatchSerializer, NotificationSerializer


class FamilyView(APIView):
    permission_classes = [IsAuthenticated, IsFamily]


class SummaryView(FamilyView):
    """Everything the family dashboard needs in one request."""

    def get(self, request):
        user = request.user
        cases = Case.objects.filter(owner=user).prefetch_related("photos").annotate(
            match_count=Count("matches", distinct=True),
            best_score=Max("matches__score", filter=Q(matches__record_kind=Match.Kind.LIVING)),
        )
        matches = Match.objects.filter(case__owner=user).select_related("case")[:20]
        notes = Notification.objects.filter(user=user).select_related("case", "match")
        unread = notes.filter(is_read=False)
        alert = unread.exclude(kind=Notification.Kind.SYSTEM).first()  # newest unread match/officer alert
        cases_data = CaseSerializer(cases, many=True).data
        return Response({
            "cases": cases_data,
            "matches": MatchSerializer(matches, many=True).data,
            "notifications": NotificationSerializer(notes[:3], many=True).data,
            "alert": NotificationSerializer(alert).data if alert else None,
            "stats": {
                "cases": len(cases_data),
                "matches": Match.objects.filter(case__owner=user).count(),
                "unread": unread.count(),
            },
        })


class NotificationListView(FamilyView):
    def get(self, request):
        notes = Notification.objects.filter(user=request.user).select_related("case", "match")[:100]
        return Response(NotificationSerializer(notes, many=True).data)


class NotificationReadView(FamilyView):
    """Mark notifications as read: body {"ids": [1, 2]} or empty for all."""

    def post(self, request):
        qs = Notification.objects.filter(user=request.user, is_read=False)
        ids = request.data.get("ids")
        if isinstance(ids, list):
            qs = qs.filter(id__in=[i for i in ids if isinstance(i, int)])
        return Response({"updated": qs.update(is_read=True)})


class CaseCreateView(FamilyView):
    """File a missing-person report: details + at least 3 photos (+ optional ID pictures)."""
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if Case.objects.filter(owner=request.user).count() >= MAX_ACTIVE_CASES:
            return Response({"code": "limit"}, status=409)
        s = CaseCreateSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            case = s.save()
        return Response({"id": case.id}, status=201)


class PhotoView(FamilyView):
    """Pictures are private: only the owner can fetch them, never from a public URL."""

    def get(self, request, pk, photo_id):
        photo = get_object_or_404(CasePhoto, pk=photo_id, case_id=pk, case__owner=request.user)
        return FileResponse(photo.image.open("rb"), headers={
            "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


class CaseDetailView(FamilyView):
    def delete(self, request, pk):
        """Person found: remove the report and everything linked to it, completely."""
        get_object_or_404(Case, pk=pk, owner=request.user).delete()
        return Response(status=204)
