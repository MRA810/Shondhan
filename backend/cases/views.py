from django.db.models import Count, Max, Q
from rest_framework import generics
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .matching import run_for_case
from .models import MATCH_VISIBLE, Match, MissingCase, Notification, RecordVisit
from .serializers import (CaseSerializer, MatchDetailSerializer, MatchListSerializer,
                          NotificationSerializer)

NOTIF_VISIBLE = Q(match__record__is_active=True) & ~Q(match__record__condition="deceased")


class FamilyOnly(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == "family"


class CaseList(generics.ListCreateAPIView):
    permission_classes = [FamilyOnly]
    parser_classes = [MultiPartParser, FormParser]
    serializer_class = CaseSerializer

    def get_queryset(self):
        return MissingCase.objects.filter(owner=self.request.user).prefetch_related("photos")

    def perform_create(self, serializer):
        case = serializer.save(owner=self.request.user)
        run_for_case(case)


class CaseDetail(generics.RetrieveDestroyAPIView):
    """DELETE = person found: the post, photos and matches are removed completely."""
    permission_classes = [FamilyOnly]
    serializer_class = CaseSerializer

    def get_queryset(self):
        return MissingCase.objects.filter(owner=self.request.user).prefetch_related("photos")


class CaseMatches(generics.ListAPIView):
    permission_classes = [FamilyOnly]
    serializer_class = MatchListSerializer

    def get_queryset(self):
        return (Match.objects.filter(MATCH_VISIBLE, case_id=self.kwargs["pk"], case__owner=self.request.user)
                .select_related("record").order_by("-score"))


class MatchDetail(generics.RetrieveAPIView):
    permission_classes = [FamilyOnly]
    serializer_class = MatchDetailSerializer

    def get_queryset(self):
        return Match.objects.filter(MATCH_VISIBLE, case__owner=self.request.user).select_related("record", "case")

    def retrieve(self, request, *args, **kwargs):
        m = self.get_object()
        RecordVisit.objects.create(user=request.user, record=m.record, case=m.case)  # who visited which record
        if not m.seen:
            m.seen = True
            m.save(update_fields=["seen"])
        Notification.objects.filter(user=request.user, match=m, read=False).update(read=True)
        return Response(self.get_serializer(m).data)


class DashboardView(APIView):
    permission_classes = [FamilyOnly]

    def get(self, request):
        u = request.user
        vis = Q(matches__record__is_active=True) & ~Q(matches__record__condition="deceased")
        cases = (MissingCase.objects.filter(owner=u)
                 .annotate(match_total=Count("matches", filter=vis),
                           new_total=Count("matches", filter=vis & Q(matches__seen=False)),
                           best=Max("matches__score", filter=vis))
                 .prefetch_related("photos"))
        out = []
        for c in cases:
            face = next((p for p in c.photos.all() if p.kind == "face"), None)
            out.append({
                "id": c.id, "person_name": c.person_name, "age_approx": c.age_approx, "division": c.division,
                "photo": request.build_absolute_uri(face.image.url) if face else None,
                "match_total": c.match_total, "new_total": c.new_total, "best": c.best,
            })
        top = (Match.objects.filter(MATCH_VISIBLE, case__owner=u, seen=False)
               .select_related("case").order_by("-score")[:3])
        return Response({
            "cases": out,
            "new_matches": Match.objects.filter(MATCH_VISIBLE, case__owner=u, seen=False).count(),
            "top_matches": [{"match_id": m.id, "case_id": m.case_id, "person_name": m.case.person_name,
                             "score": m.score} for m in top],
        })


class NotificationList(generics.ListAPIView):
    permission_classes = [FamilyOnly]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return (Notification.objects.filter(NOTIF_VISIBLE, user=self.request.user)
                .select_related("match__case")[:50])


class UnreadCount(APIView):
    permission_classes = [FamilyOnly]

    def get(self, request):
        n = Notification.objects.filter(NOTIF_VISIBLE, user=request.user, read=False).count()
        return Response({"count": n})


class ReadAll(APIView):
    permission_classes = [FamilyOnly]

    def post(self, request):
        Notification.objects.filter(user=request.user, read=False).update(read=True)
        return Response({"ok": True})
