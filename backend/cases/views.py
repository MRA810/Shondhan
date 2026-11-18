from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Max, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import CanBrowseReports, IsAdmin, IsAuditor, IsFamily, IsOfficer, IsReporter
from accounts.serializers import RegisterSerializer, UserSerializer, clean_phone
from . import faces, services
from .matching import find_duplicates, run_for_case, run_for_record
from .models import (MAX_ACTIVE_CASES, AuditLog, CasePhoto, FoundRecord, MergeRequest, Match, MissingCase,
                     Notification, PhotoKind, RecordPhoto)
from .serializers import (CaseCardSerializer, CaseCreateSerializer, CaseDetailSerializer, FamilyMatchSerializer,
                          MergeRequestSerializer, QueueSerializer, RecordSerializer, RecordWriteSerializer)

LIVING_CONDITIONS = [c for c in FoundRecord.Condition.values if c != FoundRecord.Condition.DECEASED]
LIVING = Q(record__condition__in=LIVING_CONDITIONS)


def visible_q(p=""):
    """Matches a family may see: living ones not ruled out, and restricted ones only after an officer confirmed."""
    return (Q(**{f"{p}record__condition__in": LIVING_CONDITIONS, f"{p}status__in": ["pending", "confirmed"]})
            | Q(**{f"{p}record__condition": FoundRecord.Condition.DECEASED, f"{p}status": "confirmed"}))


def family_visible(qs):
    return qs.filter(visible_q())


# ---------------- notifications (every role) ----------------

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "kind", "params", "case_id", "match_id", "record_id", "merge_id", "is_read", "created_at")


class NotificationListView(APIView):
    def get(self, request):
        qs = Notification.objects.filter(user=request.user)
        return Response({"items": NotificationSerializer(qs[:100], many=True).data,
                         "unread": qs.filter(is_read=False).count()})


class NotificationReadView(APIView):
    """Mark notifications as read: body {"ids": [1, 2]} or empty for all."""

    def post(self, request):
        qs = Notification.objects.filter(user=request.user, is_read=False)
        ids = request.data.get("ids")
        if isinstance(ids, list):
            qs = qs.filter(id__in=[i for i in ids if isinstance(i, int)])
        return Response({"updated": qs.update(is_read=True)})


# ---------------- private photos ----------------

def _send(photo):
    return FileResponse(photo.image.open("rb"), headers={
        "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})


class CasePhotoView(APIView):
    def get(self, request, photo_id):
        u = request.user
        q = Q(pk=photo_id)
        if u.role not in ("officer", "admin", "police"):
            q &= Q(case__owner=u)
        return _send(get_object_or_404(CasePhoto, q))


class RecordPhotoView(APIView):
    def get(self, request, photo_id):
        u = request.user
        photo = get_object_or_404(RecordPhoto.objects.select_related("record"), pk=photo_id)
        rec = photo.record
        ok = u.role in ("officer", "admin") or rec.reporter_id == u.id \
            or rec.merged_from.filter(reporter=u).exists() \
            or (u.is_reporter and MergeRequest.objects.filter(Q(a=rec, b__reporter=u) | Q(b=rec, a__reporter=u)).exists())
        if not ok and u.role == "family" and photo.kind == PhotoKind.PHOTO:
            ok = family_visible(Match.objects.filter(record=rec, case__owner=u)).filter(LIVING).exists()
        if not ok:
            return Response(status=404)
        return _send(photo)


# ---------------- family (Scenario 3) ----------------

class FamilyView(APIView):
    permission_classes = [IsAuthenticated, IsFamily]


def _case_cards(user):
    visible = visible_q("matches__")
    living = Q(matches__record__condition__in=LIVING_CONDITIONS, matches__status__in=["pending", "confirmed"])
    cases = MissingCase.objects.filter(owner=user).prefetch_related("photos").annotate(
        match_count=Count("matches", filter=visible, distinct=True),
        best_score=Max("matches__score", filter=living))
    ids = [c.id for c in cases]
    views = dict(AuditLog.objects.filter(action="view", target_type="case", target_id__in=ids,
                                         actor_role__in=["officer", "admin", "police"])
                 .values_list("target_id").annotate(n=Count("id")).values_list("target_id", "n"))
    return CaseCardSerializer(cases, many=True, context={"views": views}).data


class SummaryView(FamilyView):
    """Everything the family dashboard needs in one request."""

    def get(self, request):
        user = request.user
        cases = _case_cards(user)
        matches = family_visible(Match.objects.filter(case__owner=user)).select_related("case", "record__reporter") \
            .prefetch_related("record__photos")
        notes = Notification.objects.filter(user=user)
        unread = notes.filter(is_read=False)
        alert = unread.filter(kind__in=["match", "verified", "officer"]).first()
        return Response({
            "cases": cases,
            "matches": FamilyMatchSerializer(matches[:20], many=True).data,
            "notifications": NotificationSerializer(notes[:4], many=True).data,
            "alert": NotificationSerializer(alert).data if alert else None,
            "unread_matches": unread.filter(kind__in=["match", "verified", "officer"]).count(),
            "stats": {"cases": len(cases), "matches": matches.count(), "unread": unread.count()},
            "profile_complete": bool(user.alt_phone and user.division and user.address),
            "max_cases": MAX_ACTIVE_CASES,
        })


class CaseCreateView(FamilyView):
    """File a missing-person post: details + at least 3 photos (+ optional ID pictures)."""
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        if MissingCase.objects.filter(owner=request.user).count() >= MAX_ACTIVE_CASES:
            return Response({"code": "limit"}, status=409)
        s = CaseCreateSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            case = s.save()
            services.audit(request, "create_case", "case", case.id)
            run_for_case(case)
            faces.schedule("case", case.id)  # then compare the photos too, in the background
        return Response({"id": case.id}, status=201)


class CaseDetailView(FamilyView):
    def get(self, request, pk):
        case = get_object_or_404(MissingCase.objects.prefetch_related("photos"), pk=pk, owner=request.user)
        matches = family_visible(case.matches.select_related("case", "record__reporter").prefetch_related("record__photos"))
        data = CaseDetailSerializer(case).data
        data["matches"] = FamilyMatchSerializer(matches, many=True).data
        data["official_views"] = services.view_count("case", case.id, roles=["officer", "admin", "police"])
        return Response(data)

    def delete(self, request, pk):
        """Person found: remove the post and everything linked to it, completely."""
        case = get_object_or_404(MissingCase, pk=pk, owner=request.user)
        services.audit(request, "close_case", "case", case.id, by="family")
        services.close_case(case)
        return Response(status=204)


class FamilyMatchView(FamilyView):
    def get(self, request, pk):
        m = get_object_or_404(family_visible(Match.objects.filter(case__owner=request.user))
                              .select_related("case", "record__reporter"), pk=pk)
        if not m.restricted:  # "who visited which victim info"
            services.audit(request, "view", "record", m.record_id, match=m.id)
        Notification.objects.filter(user=request.user, match=m, is_read=False).update(is_read=True)
        return Response(FamilyMatchSerializer(m, context={"detail": True}).data)


class RegisterWithReportView(APIView):
    """New family member: the missing-person report first, then their own details, password and SMS code.
    One request creates the account and the report together, then logs them in."""
    permission_classes = [AllowAny]
    authentication_classes = []
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "register"

    def post(self, request):
        case_s = CaseCreateSerializer(data=request.data)
        case_ok = case_s.is_valid()
        account = {k: request.data.get(k) for k in ("full_name", "phone", "email", "age", "password", "consent", "otp")}
        account["relationship"] = request.data.get("relationship")
        if not case_ok:  # do not use up the SMS code while the report still has mistakes
            return Response(case_s.errors, status=400)
        acc_s = RegisterSerializer(data=account)
        acc_s.is_valid(raise_exception=True)
        from accounts.views import login_payload
        with transaction.atomic():
            user = acc_s.save()
            services.welcome(user)
            case_s.context["owner"] = user
            case = case_s.save()
            services.audit(request, "create_case", "case", case.id, user=user, with_signup=True)
            run_for_case(case)
            faces.schedule("case", case.id)
        return Response({**login_payload(user), "case_id": case.id}, status=201)


# ---------------- police station / medical team (Scenarios 1 and 2) ----------------

class ReporterView(APIView):
    permission_classes = [IsAuthenticated, IsReporter]


def reporter_records(user):
    return FoundRecord.objects.filter(Q(reporter=user) | Q(merged_from__reporter=user), is_active=True) \
        .distinct().select_related("reporter").prefetch_related("photos")


def pending_merges(user):
    return MergeRequest.objects.filter(Q(a__reporter=user) | Q(b__reporter=user), status=MergeRequest.Status.PENDING,
                                       a__is_active=True, b__is_active=True).select_related("a__reporter", "b__reporter")


class ReporterSummaryView(ReporterView):
    def get(self, request):
        recs = reporter_records(request.user)
        merges = pending_merges(request.user)
        notes = Notification.objects.filter(user=request.user)
        ctx = {"request": request}
        return Response({
            "records": RecordSerializer(recs[:50], many=True).data,
            "merges": MergeRequestSerializer(merges, many=True, context=ctx).data,
            "notifications": NotificationSerializer(notes[:4], many=True).data,
            "stats": {"records": recs.count(),
                      "matches": Match.objects.filter(record__in=recs).exclude(status=Match.Status.REJECTED).count(),
                      "merges": merges.count(),
                      "unread": notes.filter(is_read=False).count()},
        })


class RecordListCreateView(ReporterView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        return Response(RecordSerializer(reporter_records(request.user), many=True).data)

    def post(self, request):
        s = RecordWriteSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            rec = s.save()
            services.audit(request, "create_record", "record", rec.id, condition=rec.condition)
            run_for_record(rec)
            find_duplicates(rec)
            faces.schedule("record", rec.id)
        return Response({"id": rec.id}, status=201)


class RecordDetailView(ReporterView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get(self, request, pk):
        return get_object_or_404(reporter_records(request.user), pk=pk)

    def get(self, request, pk):
        rec = self._get(request, pk)
        data = RecordSerializer(rec).data
        merges = pending_merges(request.user).filter(Q(a=rec) | Q(b=rec))
        data["merges"] = MergeRequestSerializer(merges, many=True, context={"request": request}).data
        return Response(data)

    def patch(self, request, pk):
        rec = self._get(request, pk)
        s = RecordWriteSerializer(rec, data=request.data, partial=True, context={"request": request})
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            rec = s.save()
            services.audit(request, "update_record", "record", rec.id, fields=sorted(k for k in request.data.keys()))
            run_for_record(rec)
            find_duplicates(rec)
            faces.schedule("record", rec.id)
        return Response(RecordSerializer(rec).data)

    def delete(self, request, pk):
        """The person has left our care (handed to family, transferred, identified): remove the record completely."""
        rec = self._get(request, pk)
        services.audit(request, "close_record", "record", rec.id, by=request.user.role)
        services.close_record(rec)
        return Response(status=204)


class RecordPhotoDeleteView(ReporterView):
    def delete(self, request, pk, photo_id):
        rec = get_object_or_404(reporter_records(request.user), pk=pk)
        photo = get_object_or_404(RecordPhoto, pk=photo_id, record=rec)
        if photo.kind == PhotoKind.PHOTO and rec.photos.filter(kind=PhotoKind.PHOTO).count() <= 1:
            return Response({"code": "last_photo"}, status=409)
        photo.delete()
        return Response(status=204)


class MergeDecisionView(ReporterView):
    def post(self, request, pk):
        mr = get_object_or_404(pending_merges(request.user), pk=pk)
        services.decide_merge(request, mr, bool(request.data.get("approve")))
        mr.refresh_from_db()
        return Response({"status": mr.status})


# ---------------- case officer ----------------

class OfficerView(APIView):
    permission_classes = [IsAuthenticated, IsOfficer]


def owner_contact(u):
    return {"full_name": u.first_name, "phone": u.phone, "alt_phone": u.alt_phone, "email": u.email,
            "division": u.division, "address": u.address}


def recent_views(target_type, target_id):
    qs = AuditLog.objects.filter(action="view", target_type=target_type, target_id=target_id)[:20]
    return [{"who": a.actor_name, "role": a.actor_role, "at": a.created_at} for a in qs]


class QueueView(OfficerView):
    def get(self, request):
        status = request.query_params.get("status", "pending")
        qs = Match.objects.select_related("case", "record__reporter").prefetch_related("case__photos", "record__photos")
        if status in Match.Status.values:
            qs = qs.filter(status=status)
        kind = request.query_params.get("kind")
        if kind == "deceased":
            qs = qs.filter(record__condition=FoundRecord.Condition.DECEASED)
        elif kind == "living":
            qs = qs.filter(LIVING)
        pending = Match.objects.filter(status=Match.Status.PENDING)
        return Response({
            "items": QueueSerializer(qs[:100], many=True).data,
            "stats": {"pending": pending.count(),
                      "high": pending.filter(score__gte=Match.HIGH).count(),
                      "restricted": pending.filter(record__condition=FoundRecord.Condition.DECEASED).count(),
                      "cases": MissingCase.objects.count(),
                      "records": FoundRecord.objects.filter(is_active=True).count()},
        })


class OfficerMatchView(OfficerView):
    def get(self, request, pk):
        m = get_object_or_404(Match.objects.select_related("case__owner", "record__reporter"), pk=pk)
        services.audit(request, "view", "match", m.id, case=m.case_id, record=m.record_id)
        case = CaseDetailSerializer(m.case).data
        case["owner"] = owner_contact(m.case.owner)
        return Response({
            "id": m.id, "score": m.score, "band": m.band, "reasons": m.reasons, "status": m.status,
            "face_score": m.face_score, "face_pair": m.face_pair,
            "restricted": m.restricted, "review_note": m.review_note, "created_at": m.created_at,
            "reviewed_by": m.reviewed_by.first_name if m.reviewed_by else "", "reviewed_at": m.reviewed_at,
            "case": case, "record": RecordSerializer(m.record).data,
            "record_views": recent_views("record", m.record_id),
        })

    def post(self, request, pk):
        m = get_object_or_404(Match, pk=pk)
        decision = request.data.get("decision")
        if decision not in ("confirm", "reject"):
            return Response({"decision": ["invalid"]}, status=400)
        services.review_match(request, m, decision, str(request.data.get("note", "")))
        return Response({"status": m.status})


class ReuniteView(OfficerView):
    def post(self, request, pk):
        m = get_object_or_404(Match, pk=pk, status=Match.Status.CONFIRMED)
        services.reunite(request, m)
        return Response(status=204)


def _date(v):
    from django.utils.dateparse import parse_date
    return parse_date(v) if v else None


class ReportListView(APIView):
    """Every family report, for police stations, case officers and admins. Filters (all optional):
    q (name, place, phone, family name), gender, division, age_min, age_max, seen_from, seen_to (YYYY-MM-DD),
    mark_type, mark_region, cannot_speak=1, has_matches=1, sort=newest|oldest|last_seen."""
    permission_classes = [IsAuthenticated, CanBrowseReports]
    LIMIT = 200

    def get(self, request):
        p = request.query_params
        qs = MissingCase.objects.select_related("owner").prefetch_related("photos")
        q = p.get("q", "").strip()
        if q:
            qs = qs.filter(Q(person_name__icontains=q) | Q(last_seen_place__icontains=q) | Q(owner__phone__icontains=q)
                           | Q(owner__first_name__icontains=q) | Q(belongings__icontains=q) | Q(notes__icontains=q))
        if p.get("gender") in ("male", "female", "other"):
            qs = qs.filter(gender=p["gender"])
        if p.get("division"):
            qs = qs.filter(division=p["division"])
        if p.get("age_min", "").isdigit():
            qs = qs.filter(person_age__gte=int(p["age_min"]))
        if p.get("age_max", "").isdigit():
            qs = qs.filter(person_age__lte=int(p["age_max"]))
        if _date(p.get("seen_from")):
            qs = qs.filter(last_seen_at__date__gte=_date(p["seen_from"]))
        if _date(p.get("seen_to")):
            qs = qs.filter(last_seen_at__date__lte=_date(p["seen_to"]))
        if p.get("cannot_speak") == "1":
            qs = qs.filter(cannot_speak=True)
        qs = qs.annotate(match_count=Count("matches", distinct=True), best_score=Max("matches__score"))
        if p.get("has_matches") == "1":
            qs = qs.filter(match_count__gt=0)
        qs = qs.order_by({"oldest": "created_at", "last_seen": "-last_seen_at"}.get(p.get("sort"), "-created_at"))
        rows = list(qs)
        # body-mark filters work on the JSON list (same code on PostgreSQL and SQLite)
        mt, mr = p.get("mark_type"), p.get("mark_region")
        if mt or mr:
            rows = [c for c in rows if any((not mt or m.get("type") == mt) and (not mr or m.get("region") == mr)
                                           for m in c.marks or [])]
        return Response({"total": len(rows), "items": CaseCardSerializer(rows[:self.LIMIT], many=True).data})


class ReportDetailView(APIView):
    permission_classes = [IsAuthenticated, CanBrowseReports]

    def get(self, request, pk):
        case = get_object_or_404(MissingCase.objects.select_related("owner"), pk=pk)
        services.audit(request, "view", "case", case.id)
        data = CaseDetailSerializer(case).data
        data["owner"] = owner_contact(case.owner)
        data["matches"] = QueueSerializer(case.matches.select_related("record__reporter"), many=True).data
        data["views"] = recent_views("case", case.id)
        data["created_at"] = case.created_at
        return Response(data)


class OfficerRecordsView(OfficerView):
    def get(self, request):
        q = request.query_params.get("q", "").strip()
        qs = FoundRecord.objects.filter(is_active=True).select_related("reporter").prefetch_related("photos")
        if q:
            qs = qs.filter(Q(found_place__icontains=q) | Q(name_hint__icontains=q) | Q(found_area__icontains=q))
        cond = request.query_params.get("condition")
        if cond:
            qs = qs.filter(condition=cond)
        return Response(RecordSerializer(qs[:100], many=True).data)


class OfficerRecordDetailView(OfficerView):
    def get(self, request, pk):
        rec = get_object_or_404(FoundRecord.objects.select_related("reporter"), pk=pk)
        services.audit(request, "view", "record", rec.id)
        data = RecordSerializer(rec).data
        data["matches"] = QueueSerializer(rec.matches.select_related("case"), many=True).data
        data["views"] = recent_views("record", rec.id)
        return Response(data)


# ---------------- admin ----------------

class AdminView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]


class AdminUserSerializer(UserSerializer):
    class Meta(UserSerializer.Meta):
        fields = UserSerializer.Meta.fields + ("is_active", "date_joined", "last_login", "approved_at", "locked_until")


class AdminSummaryView(AdminView):
    def get(self, request):
        roles = dict(User.objects.filter(is_active=True).values_list("role").annotate(n=Count("id")).values_list("role", "n"))
        pending = User.objects.filter(role__in=User.STAFF_ROLES, is_active=False, approved_at__isnull=True)
        return Response({
            "roles": roles,
            "pending": AdminUserSerializer(pending.order_by("date_joined"), many=True).data,
            "counts": {"cases": MissingCase.objects.count(), "records": FoundRecord.objects.filter(is_active=True).count(),
                       "matches": Match.objects.count(),
                       "pending_matches": Match.objects.filter(status=Match.Status.PENDING).count(),
                       "merges": MergeRequest.objects.filter(status=MergeRequest.Status.MERGED).count(),
                       "reunited": AuditLog.objects.filter(action="reunite").count()},
        })


class AdminCreateUserSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=100)
    phone = serializers.CharField()
    email = serializers.EmailField(required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=["police", "medical", "officer", "admin", "auditor"])
    organization = serializers.CharField(max_length=150, required=False, allow_blank=True)
    designation = serializers.CharField(max_length=80, required=False, allow_blank=True)
    password = serializers.CharField()

    def validate_phone(self, v):
        v = clean_phone(v)
        if User.objects.filter(Q(phone=v) | Q(username=v)).exists():
            raise serializers.ValidationError("exists")
        return v

    def validate_password(self, v):
        try:
            validate_password(v)
        except DjangoValidationError:
            raise serializers.ValidationError("weak")
        return v


class AdminUsersView(AdminView):
    def get(self, request):
        qs = User.objects.order_by("-date_joined")
        role, q = request.query_params.get("role"), request.query_params.get("q", "").strip()
        if role:
            qs = qs.filter(role=role)
        if q:
            qs = qs.filter(Q(first_name__icontains=q) | Q(phone__icontains=q) | Q(email__icontains=q)
                           | Q(organization__icontains=q))
        return Response(AdminUserSerializer(qs[:200], many=True).data)

    def post(self, request):
        s = AdminCreateUserSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        u = User.objects.create_user(username=d["phone"], phone=d["phone"], email=d.get("email", ""),
                                     first_name=d["full_name"].strip(), password=d["password"], role=d["role"],
                                     organization=d.get("organization", ""), designation=d.get("designation", ""),
                                     approved_at=timezone.now())
        services.audit(request, "create_user", "user", u.id, role=u.role)
        return Response(AdminUserSerializer(u).data, status=201)


class AdminUserDetailView(AdminView):
    def patch(self, request, pk):
        """{"action": "approve" | "deactivate" | "activate" | "unlock"}"""
        u = get_object_or_404(User, pk=pk)
        action = request.data.get("action")
        if u.id == request.user.id and action == "deactivate":
            return Response({"code": "self"}, status=409)
        if action == "approve":
            u.is_active, u.approved_at = True, timezone.now()
            Notification.objects.create(user=u, kind=Notification.Kind.APPROVED, params={"org": u.organization})
        elif action == "activate":
            u.is_active = True
            u.approved_at = u.approved_at or timezone.now()
        elif action == "deactivate":
            u.is_active = False
            u.approved_at = u.approved_at or timezone.now()  # deactivated, not "waiting"
        elif action == "unlock":
            u.locked_until, u.failed_attempts = None, 0
        else:
            return Response({"action": ["invalid"]}, status=400)
        u.save()
        services.audit(request, f"{action}_user", "user", u.id, role=u.role)
        return Response(AdminUserSerializer(u).data)

    def delete(self, request, pk):
        """Reject a staff request that was never approved."""
        u = get_object_or_404(User, pk=pk, role__in=User.STAFF_ROLES, is_active=False, approved_at__isnull=True)
        services.audit(request, "reject_user", "user", u.id, role=u.role, org=u.organization)
        u.delete()
        return Response(status=204)


# ---------------- auditor ----------------

class AuditListView(APIView):
    permission_classes = [IsAuthenticated, IsAuditor]
    PAGE = 50

    def get(self, request):
        p = request.query_params
        qs = AuditLog.objects.all()
        for field in ("action", "actor_role", "target_type"):
            if p.get(field):
                qs = qs.filter(**{field: p[field]})
        if p.get("target_id", "").isdigit():
            qs = qs.filter(target_id=int(p["target_id"]))
        if p.get("q"):
            qs = qs.filter(actor_name__icontains=p["q"])
        page = max(int(p.get("page", "1")) if p.get("page", "1").isdigit() else 1, 1)
        total = qs.count()
        rows = qs[(page - 1) * self.PAGE: page * self.PAGE]
        return Response({
            "total": total, "page": page, "pages": max(1, -(-total // self.PAGE)),
            "items": [{"id": a.id, "at": a.created_at, "who": a.actor_name, "role": a.actor_role, "action": a.action,
                       "target_type": a.target_type, "target_id": a.target_id, "detail": a.detail, "ip": a.ip}
                      for a in rows],
            "actions": list(AuditLog.objects.order_by("action").values_list("action", flat=True).distinct()),
        })
