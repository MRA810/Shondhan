"""
Matching engine.

Today it compares the structured traits both sides choose from the same dropdowns
(gender, age, body marks by body place, clothing item + colour, skin / build / hair,
ID number, name, division). The AI pipeline from the plan (InsightFace face vectors,
YOLOv8-seg mark crops, OpenCLIP apparel vectors in Qdrant) plugs into `face_similarity()`
and is blended into the same 0-100 score; nothing else has to change.

A score is a suggestion, never a verdict: every match goes to a case officer.
"""
import re
from datetime import timedelta

from django.db.models import Q

from .models import FoundRecord, MergeRequest, Match, MissingCase

THRESHOLD = 51      # only matches OVER 50% are kept; families and officers never see weaker ones
DUP_THRESHOLD = 60  # two found records this similar are offered for merging

WORD = re.compile(r"[\s,;.।:()/\-]+")


def _tokens(text):
    return {w for w in WORD.split((text or "").lower()) if len(w) > 2}


def _overlap(a, b):
    ta, tb = _tokens(a), _tokens(b)
    return len(ta & tb) / min(len(ta), len(tb)) if ta and tb else 0.0


def _norm_id(v):
    return re.sub(r"\W", "", (v or "")).lower()


def _dist(a, b):
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def marks_similarity(want, have):
    """0-1. For every mark in `want`, the best fit in `have`. Same type and both pinned on the 3D figure:
    within 6 cm 1.0, within 15 cm 0.85, further apart 0.5 (same region) or 0.25. Otherwise by name: same exact place 1.0, same body region 0.7,
    same type elsewhere 0.25."""
    if not want or not have:
        return 0.0
    total = 0.0
    for m in want:
        best = 0.0
        for h in have:
            if m["type"] != h["type"]:
                continue
            if m.get("pos") and h.get("pos"):
                d = _dist(m["pos"], h["pos"])
                if d <= 0.06:
                    best = 1.0
                    continue
                if d <= 0.15:
                    best = max(best, 0.85)
                    continue
                # both were pinned and they are far apart: the names alone must not make it a perfect fit
                best = max(best, 0.5 if m["region"] == h["region"] else 0.25)
                continue
            if m["region"] == h["region"]:
                best = max(best, 1.0 if (m.get("part") and m.get("part") == h.get("part")) or not m.get("part") or not h.get("part") else 0.7)
            else:
                best = max(best, 0.25)
        total += best
    return total / len(want)


def clothing_similarity(want, have):
    if not want or not have:
        return 0.0
    total = 0.0
    for c in want:
        best = 0.0
        for h in have:
            if c["item"] == h["item"]:
                best = max(best, 1.0 if (c.get("color") and c.get("color") == h.get("color")) else 0.5)
            elif c.get("color") and c.get("color") == h.get("color"):
                best = max(best, 0.2)
        total += best
    return total / len(want)


def traits_points(a, b):
    keys = [k for k in (a or {}) if (b or {}).get(k)]
    same = [k for k in keys if a[k] == b[k]]
    return len(same), keys


def face_similarity(case, record):
    """Hook for the face-vector model. Return 0-1, or None while the model is not installed."""
    return None


def score(case, rec):
    """Return (0-100, list of matched trait keys) for a family case against a found record."""
    if case.gender in ("male", "female") and rec.gender in ("male", "female") and case.gender != rec.gender:
        return 0, []
    pts, why = 0.0, []

    if case.id_number and _norm_id(case.id_number) == _norm_id(rec.id_number):
        return 97, ["id"]

    if case.gender in ("male", "female") and case.gender == rec.gender:
        pts += 12
        why.append("gender")
    if case.person_age is not None and rec.age_min is not None and rec.age_max is not None:
        if rec.age_min - 3 <= case.person_age <= rec.age_max + 3:
            pts += 18
            why.append("age")
        elif abs(case.person_age - (rec.age_min + rec.age_max) / 2) > 15:
            pts -= 10
    if case.height_cm and rec.height_cm and abs(case.height_cm - rec.height_cm) <= 8:
        pts += 4
        why.append("height")
    if case.division and case.division == rec.division:
        pts += 8
        why.append("division")

    m = marks_similarity(case.marks, rec.marks)
    if m >= 0.25:
        pts += round(26 * m)
        why.append("marks")
    c = clothing_similarity(case.clothing, rec.clothing)
    b = _overlap(case.belongings, rec.belongings)
    if c >= 0.3 or b >= 0.3:
        pts += round(14 * c + 6 * b)
        why.append("clothing")
    same, _ = traits_points(case.traits, rec.traits)
    if same:
        pts += 3 * same
        why.append("looks")
    if rec.name_hint and _overlap(case.person_name, rec.name_hint) >= 0.5:
        pts += 10
        why.append("name")
    if case.cannot_speak and rec.condition == FoundRecord.Condition.MUTE:
        pts += 5
        why.append("mute")
    if case.last_seen_at and rec.found_at and rec.found_at < case.last_seen_at - timedelta(days=1):
        pts -= 20  # found before they went missing: very unlikely

    face = face_similarity(case, rec)
    if face is not None:
        pts = 0.5 * pts + 50 * face
        if face >= 0.6:
            why.append("face")
    return max(0, min(round(pts), 100)), why


def record_similarity(a, b):
    """How likely two found records (e.g. police and hospital) describe the same person."""
    if a.gender in ("male", "female") and b.gender in ("male", "female") and a.gender != b.gender:
        return 0, []
    if a.id_number and _norm_id(a.id_number) == _norm_id(b.id_number):
        return 97, ["id"]
    pts, why = 0.0, []
    if a.gender == b.gender and a.gender in ("male", "female"):
        pts += 10
        why.append("gender")
    if None not in (a.age_min, a.age_max, b.age_min, b.age_max) and a.age_min <= b.age_max + 3 and b.age_min <= a.age_max + 3:
        pts += 15
        why.append("age")
    if a.division == b.division:
        pts += 8
        why.append("division")
    if abs((a.found_at - b.found_at).total_seconds()) <= 3 * 86400:
        pts += 10
        why.append("date")
    m = max(marks_similarity(a.marks, b.marks), marks_similarity(b.marks, a.marks))
    if m >= 0.25:
        pts += round(25 * m)
        why.append("marks")
    c = max(clothing_similarity(a.clothing, b.clothing), clothing_similarity(b.clothing, a.clothing))
    if c >= 0.3 or _overlap(a.belongings, b.belongings) >= 0.3:
        pts += round(15 * c) + 5
        why.append("clothing")
    same, _ = traits_points(a.traits, b.traits)
    if same:
        pts += 3 * same
        why.append("looks")
    if a.name_hint and b.name_hint and _overlap(a.name_hint, b.name_hint) >= 0.5:
        pts += 10
        why.append("name")
    return max(0, min(round(pts), 100)), why


# ---------- running the engine ----------

def _upsert(case, rec):
    """Store / refresh one pair. Returns (match, created)."""
    s, why = score(case, rec)
    existing = Match.objects.filter(case=case, record=rec).first()
    if s < THRESHOLD:
        if existing and existing.status == Match.Status.PENDING:
            existing.delete()
        return None, False
    if existing:
        if existing.score != s or existing.reasons != why:
            existing.score, existing.reasons = s, why
            existing.save(update_fields=["score", "reasons"])
        return existing, False
    return Match.objects.create(case=case, record=rec, score=s, reasons=why), True


def _candidates_for_case(case):
    qs = FoundRecord.objects.filter(is_active=True)
    if case.gender in ("male", "female"):
        qs = qs.filter(gender__in=[case.gender, "unknown", "other"])
    return qs


def run_for_case(case):
    from .services import notify_new_match
    for rec in _candidates_for_case(case):
        m, created = _upsert(case, rec)
        if created:
            notify_new_match(m)


def run_for_record(rec):
    from .services import notify_new_match
    if not rec.is_active:
        return
    qs = MissingCase.objects.select_related("owner")
    if rec.gender in ("male", "female"):
        qs = qs.filter(gender__in=[rec.gender, "other", "unknown"])
    for case in qs:
        m, created = _upsert(case, rec)
        if created:
            notify_new_match(m)


def find_duplicates(rec):
    """Offer a merge when another reporter has posted someone very similar."""
    from .services import notify_merge_request
    if not rec.is_active:
        return
    others = FoundRecord.objects.filter(is_active=True).exclude(pk=rec.pk).exclude(reporter=rec.reporter)
    if rec.is_deceased:
        others = others.filter(condition=FoundRecord.Condition.DECEASED)
    else:
        others = others.exclude(condition=FoundRecord.Condition.DECEASED)
    for other in others:
        a, b = (other, rec) if other.pk < rec.pk else (rec, other)
        if MergeRequest.objects.filter(Q(a=a, b=b)).exists():
            continue
        s, why = record_similarity(a, b)
        if s >= DUP_THRESHOLD:
            notify_merge_request(MergeRequest.objects.create(a=a, b=b, score=s, reasons=why))
