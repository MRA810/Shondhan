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


# ---------- details + photos ----------
# What every comparable detail is worth when BOTH sides gave it (the trait points below).
FULL_DETAILS = 110
FACE_WEIGHT_MIN, FACE_WEIGHT_MAX = 0.20, 0.80


def face_weight(coverage):
    """How much the photos count. coverage = share of details both sides actually gave (0-1).
    Plenty of details -> the details decide (photos 20%). Few details -> the photos decide (up to 80%)."""
    w = FACE_WEIGHT_MIN + (FACE_WEIGHT_MAX - FACE_WEIGHT_MIN) * (1 - coverage)
    return max(FACE_WEIGHT_MIN, min(FACE_WEIGHT_MAX, w))


def blend(trait_pts, coverage, face_prob):
    w = face_weight(coverage)
    return (1 - w) * trait_pts + w * 100 * face_prob, w


def face_similarity(a, b):
    """Best face pair between the two people's photos (cases/faces.py), or None if either side has no usable face."""
    from . import faces
    if not faces.enabled():
        return None
    return faces.best_pair(a, b)


def score(case, rec, explain=None, detail=None):
    """Return (0-100, list of matched trait keys) for a family case against a found record.
    Pass a list as `explain` to get every step back as (what, points, note) for `manage.py explain_match`."""
    log = (lambda what, pts, note="": explain.append((what, pts, note))) if explain is not None else (lambda *a: None)
    if case.gender in ("male", "female") and rec.gender in ("male", "female") and case.gender != rec.gender:
        log("gender", 0, f"different gender ({case.gender} / {rec.gender}): score is 0")
        return 0, []
    pts, why, avail = 0.0, [], 0

    if case.id_number and _norm_id(case.id_number) == _norm_id(rec.id_number):
        log("id", 97, "same ID number")
        return 97, ["id"]
    both = lambda x, y: bool(x) and bool(y)
    avail += 12 if (case.gender in ("male", "female") and rec.gender in ("male", "female")) else 0
    avail += 18 if (case.person_age is not None and rec.age_min is not None and rec.age_max is not None) else 0
    avail += 4 if both(case.height_cm, rec.height_cm) else 0
    avail += 8 if both(case.division, rec.division) else 0
    avail += 26 if both(case.marks, rec.marks) else 0
    avail += 20 if both(case.clothing or case.belongings, rec.clothing or rec.belongings) else 0
    avail += 3 * len([k for k in (case.traits or {}) if (rec.traits or {}).get(k)])
    avail += 10 if rec.name_hint else 0

    if case.gender in ("male", "female") and case.gender == rec.gender:
        pts += 12
        why.append("gender")
        log("gender", 12)
    else:
        log("gender", 0, f"not compared (family: {case.gender or '-'}, record: {rec.gender or '-'})")
    if case.person_age is not None and rec.age_min is not None and rec.age_max is not None:
        if rec.age_min - 3 <= case.person_age <= rec.age_max + 3:
            pts += 18
            why.append("age")
            log("age", 18, f"{case.person_age} within {rec.age_min}-{rec.age_max} (+-3)")
        elif abs(case.person_age - (rec.age_min + rec.age_max) / 2) > 15:
            pts -= 10
            log("age", -10, f"{case.person_age} far from {rec.age_min}-{rec.age_max}")
        else:
            log("age", 0, f"{case.person_age} outside {rec.age_min}-{rec.age_max}")
    else:
        log("age", 0, "missing on one side")
    if case.height_cm and rec.height_cm and abs(case.height_cm - rec.height_cm) <= 8:
        pts += 4
        why.append("height")
        log("height", 4)
    else:
        log("height", 0, "missing or more than 8 cm apart")
    if case.division and case.division == rec.division:
        pts += 8
        why.append("division")
        log("division", 8)
    else:
        log("division", 0, f"{case.division or '-'} / {rec.division or '-'}")

    m = marks_similarity(case.marks, rec.marks)
    if m >= 0.25:
        pts += round(26 * m)
        why.append("marks")
        log("marks", round(26 * m), f"similarity {m:.2f}")
    else:
        log("marks", 0, f"family {len(case.marks or [])} mark(s), record {len(rec.marks or [])}; no close pair")
    c = clothing_similarity(case.clothing, rec.clothing)
    b = _overlap(case.belongings, rec.belongings)
    if c >= 0.3 or b >= 0.3:
        pts += round(14 * c + 6 * b)
        why.append("clothing")
        log("clothing", round(14 * c + 6 * b), f"items {c:.2f}, belongings {b:.2f}")
    else:
        log("clothing", 0, "missing or different")
    same, keys = traits_points(case.traits, rec.traits)
    if same:
        pts += 3 * same
        why.append("looks")
    log("looks", 3 * same, f"{same} of {len(keys)} shared traits the same" if keys else "missing on one side")
    if rec.name_hint and _overlap(case.person_name, rec.name_hint) >= 0.5:
        pts += 10
        why.append("name")
        log("name", 10, rec.name_hint)
    if case.cannot_speak and rec.condition == FoundRecord.Condition.MUTE:
        pts += 5
        why.append("mute")
        log("mute", 5)
    if case.last_seen_at and rec.found_at and rec.found_at < case.last_seen_at - timedelta(days=1):
        pts -= 20  # found before they went missing: very unlikely
        log("dates", -20, "found before the last-seen date")

    coverage = min(1.0, avail / FULL_DETAILS)
    face = face_similarity(case, rec)
    if face is not None:
        trait_pts = pts
        pts, w = blend(trait_pts, coverage, face["prob"])
        if face["prob"] >= 0.6:
            why.append("face")
        log("details", round(trait_pts), f"details give {round(trait_pts)} pts; both sides gave {round(coverage * 100)}% of the details")
        log("face", None, f"photos {round(face['prob'] * 100)}% alike (cosine {face['cos']}), counted {round(w * 100)}%"
                          f" -> total {round(pts)}%")
        if detail is not None:
            detail.update(face_score=round(face["prob"] * 100), face_pair=face["pair"])
    else:
        log("face", 0, "photos not compared (no clear face on one side, or face models not installed)")
        if detail is not None:
            detail.update(face_score=None, face_pair=None)
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
    # details both records gave (division and date are always there)
    avail = 18 + (10 if a.gender in ("male", "female") and b.gender in ("male", "female") else 0)
    avail += 15 if None not in (a.age_min, a.age_max, b.age_min, b.age_max) else 0
    avail += 25 if (a.marks and b.marks) else 0
    avail += 20 if ((a.clothing or a.belongings) and (b.clothing or b.belongings)) else 0
    avail += 3 * len([k for k in (a.traits or {}) if (b.traits or {}).get(k)])
    avail += 10 if (a.name_hint and b.name_hint) else 0
    face = face_similarity(a, b)
    if face is not None:
        pts, _ = blend(pts, min(1.0, avail / FULL_DETAILS), face["prob"])
        if face["prob"] >= 0.6:
            why.append("face")
    return max(0, min(round(pts), 100)), why


# ---------- running the engine ----------

def _upsert(case, rec):
    """Store / refresh one pair. Returns (match, created)."""
    detail = {}
    s, why = score(case, rec, detail=detail)
    existing = Match.objects.filter(case=case, record=rec).first()
    if s < THRESHOLD:
        if existing and existing.status == Match.Status.PENDING:
            existing.delete()
        return None, False
    if existing:
        if existing.score != s or existing.reasons != why or existing.face_score != detail.get("face_score"):
            existing.score, existing.reasons = s, why
            existing.face_score, existing.face_pair = detail.get("face_score"), detail.get("face_pair")
            existing.save(update_fields=["score", "reasons", "face_score", "face_pair"])
        return existing, False
    return Match.objects.create(case=case, record=rec, score=s, reasons=why,
                                face_score=detail.get("face_score"), face_pair=detail.get("face_pair")), True


def _candidates_for_case(case):
    qs = FoundRecord.objects.filter(is_active=True).prefetch_related("photos")
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
    qs = MissingCase.objects.select_related("owner").prefetch_related("photos")
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
