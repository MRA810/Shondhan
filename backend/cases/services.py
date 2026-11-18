"""Business actions shared by the views: notifications, audit trail, officer reviews, merges, closing."""
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import AuditLog, FoundRecord, MergeRequest, Match, Notification

MERGE_FILL = ["name_hint", "age_min", "age_max", "height_cm", "id_type", "id_number", "medical_notes",
              "belongings", "found_area", "contact_name"]
CURRENT_PLACE = ["division", "found_place", "found_area", "contact_name", "contact_phone", "condition"]


# ---------- audit ----------

def audit(request, action, target_type="", target_id=None, user=None, **detail):
    user = user or getattr(request, "user", None)
    real = user if user is not None and user.is_authenticated else None
    ip = request.META.get("REMOTE_ADDR") if request is not None else None
    return AuditLog.objects.create(
        actor=real, actor_name=real.get_full_name() or real.username if real else "",
        actor_role=real.role if real else "", action=action, target_type=target_type,
        target_id=target_id, detail=detail, ip=ip)


def view_count(target_type, target_id, roles=None):
    qs = AuditLog.objects.filter(action="view", target_type=target_type, target_id=target_id)
    if roles:
        qs = qs.filter(actor_role__in=roles)
    return qs.count()


# ---------- notifications ----------

def welcome(user):
    Notification.objects.create(user=user, kind=Notification.Kind.SYSTEM, params={"msg": "welcome"})


def notify_new_match(match):
    """Living matches reach the family at once (with the score). Restricted (deceased) records
    never notify the family directly: they wait in the officer queue."""
    if match.record.is_deceased:
        return None
    return Notification.objects.create(
        user=match.case.owner, kind=Notification.Kind.MATCH, case=match.case, match=match,
        params={"name": match.case.person_name, "pct": match.score})


def notify_merge_request(mr):
    for rec in (mr.a, mr.b):
        other = mr.b if rec is mr.a else mr.a
        Notification.objects.create(user=rec.reporter, kind=Notification.Kind.MERGE, record=rec, merge=mr,
                                    params={"place": other.found_place, "pct": mr.score})


# ---------- officer decisions ----------

@transaction.atomic
def review_match(request, match, decision, note=""):
    match.status = Match.Status.CONFIRMED if decision == "confirm" else Match.Status.REJECTED
    match.reviewed_by, match.reviewed_at, match.review_note = request.user, timezone.now(), note[:300]
    match.save(update_fields=["status", "reviewed_by", "reviewed_at", "review_note"])
    audit(request, "confirm_match" if decision == "confirm" else "reject_match", "match", match.pk,
          case=match.case_id, record=match.record_id, score=match.score)
    if match.status == Match.Status.CONFIRMED:
        kind = Notification.Kind.OFFICER if match.restricted else Notification.Kind.VERIFIED
        params = {"name": match.case.person_name}
        if not match.restricted:
            params.update(pct=match.score, place=match.record.found_place)
        Notification.objects.create(user=match.case.owner, kind=kind, case=match.case, match=match, params=params)
    return match


@transaction.atomic
def reunite(request, match):
    """The person is back with the family: remove the case, the record and every photo completely."""
    case, rec = match.case, match.record
    params = {"name": case.person_name}
    audit(request, "reunite", "match", match.pk, case=case.pk, record=rec.pk)
    Notification.objects.create(user=case.owner, kind=Notification.Kind.REUNITED, params=params)
    reporters = {rec.reporter_id} | set(rec.merged_from.values_list("reporter_id", flat=True))
    for uid in reporters:
        Notification.objects.create(user_id=uid, kind=Notification.Kind.REUNITED, params={"place": rec.found_place, **params})
    close_case(case)
    close_record(rec)


def close_case(case):
    case.delete()  # photos (and their files), matches and notifications go with it


def close_record(rec):
    FoundRecord.objects.filter(merged_into=rec).delete()
    rec.delete()


# ---------- duplicate merging ----------

def merge_side(mr, user):
    """Which side of the merge request this reporter speaks for ('a', 'b' or None)."""
    if mr.a.reporter_id == user.id:
        return "a"
    if mr.b.reporter_id == user.id:
        return "b"
    return None


@transaction.atomic
def decide_merge(request, mr, approve):
    side = merge_side(mr, request.user)
    if not approve:
        mr.status, mr.decided_at = MergeRequest.Status.DECLINED, timezone.now()
        mr.save(update_fields=["status", "decided_at"])
        audit(request, "decline_merge", "merge", mr.pk, a=mr.a_id, b=mr.b_id)
        return mr
    setattr(mr, f"{side}_ok", True)
    mr.save(update_fields=[f"{side}_ok"])
    audit(request, "approve_merge", "merge", mr.pk, a=mr.a_id, b=mr.b_id)
    if mr.a_ok and mr.b_ok:
        merge_records(request, mr)
    return mr


def merge_records(request, mr):
    from .matching import run_for_record
    a, b = mr.a, mr.b
    for f in MERGE_FILL:
        if getattr(a, f) in ("", None) and getattr(b, f) not in ("", None):
            setattr(a, f, getattr(b, f))
    if b.found_at > a.found_at:  # the later record says where the person is now
        for f in CURRENT_PLACE:
            setattr(a, f, getattr(b, f))
        a.found_at = b.found_at
    a.traits = {**(b.traits or {}), **(a.traits or {})}
    seen = {(m["region"], m.get("part"), m["type"]) for m in a.marks}
    a.marks = a.marks + [m for m in b.marks if (m["region"], m.get("part"), m["type"]) not in seen]
    seen = {(c["item"], c.get("color")) for c in a.clothing}
    a.clothing = a.clothing + [c for c in b.clothing if (c["item"], c.get("color")) not in seen]
    if b.notes:
        a.notes = (f"{a.notes}\n{b.notes}" if a.notes else b.notes)[:500]
    if a.gender == "unknown":
        a.gender = b.gender
    a.save()
    b.photos.update(record=a)
    for m in b.matches.all():
        if Match.objects.filter(case=m.case, record=a).exists():
            m.delete()
        else:
            m.record = a
            m.save(update_fields=["record"])
    b.is_active, b.merged_into = False, a
    b.save(update_fields=["is_active", "merged_into"])
    MergeRequest.objects.filter(Q(a=b) | Q(b=b), status=MergeRequest.Status.PENDING).exclude(pk=mr.pk).update(
        status=MergeRequest.Status.DECLINED, decided_at=timezone.now())
    mr.status, mr.decided_at = MergeRequest.Status.MERGED, timezone.now()
    mr.save(update_fields=["status", "decided_at"])
    for rec in (a, b):
        Notification.objects.create(user=rec.reporter, kind=Notification.Kind.MERGED, record=a, merge=mr,
                                    params={"place": a.found_place})
    audit(request, "merge", "record", a.pk, merged=b.pk)
    run_for_record(a)
