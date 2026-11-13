"""
Placeholder matcher (trait overlap). The AI pipeline (face / apparel vectors in Qdrant)
replaces `score()` later; everything else stays the same.
"""
import re

from .models import FoundRecord, Match, MissingCase, Notification

THRESHOLD = 45


def _tokens(text):
    return {w for w in re.split(r"[\s,;.।:()/\-]+", (text or "").lower()) if len(w) > 2}


def _overlap(a, b):
    ta, tb = _tokens(a), _tokens(b)
    return len(ta & tb) / min(len(ta), len(tb)) if ta and tb else 0.0


def score(case, rec):
    """Return (0-100, list of matched trait keys)."""
    pts, why = 0, []
    if case.gender != "unknown" and rec.gender != "unknown":
        if case.gender != rec.gender:
            return 0, []
        pts += 15
        why.append("gender")
    if case.age_approx and rec.age_min is not None and rec.age_max is not None:
        if rec.age_min - 3 <= case.age_approx <= rec.age_max + 3:
            pts += 25
            why.append("age")
    if case.division == rec.division:
        pts += 20
        why.append("division")
    c = _overlap(case.clothing, rec.clothing)
    if c >= 0.3:
        pts += round(15 * c)
        why.append("clothing")
    m = _overlap(case.body_marks, rec.body_marks)
    if m >= 0.3:
        pts += round(20 * m)
        why.append("marks")
    if case.cannot_speak and rec.condition == FoundRecord.Condition.MUTE:
        pts += 5
        why.append("mute")
    return min(pts, 100), why


def _upsert(case, rec):
    s, why = score(case, rec)
    if s < THRESHOLD:
        return
    m, created = Match.objects.get_or_create(case=case, record=rec, defaults={"score": s, "reasons": why})
    if created:
        Notification.objects.create(user=case.owner, match=m)
    elif m.score != s:
        m.score, m.reasons = s, why
        m.save(update_fields=["score", "reasons"])


def run_for_case(case):
    # Deceased records are restricted and never matched for families.
    for rec in FoundRecord.objects.filter(is_active=True).exclude(condition=FoundRecord.Condition.DECEASED):
        _upsert(case, rec)


def run_for_record(rec):
    if not rec.is_active or rec.condition == FoundRecord.Condition.DECEASED:
        return
    for case in MissingCase.objects.select_related("owner"):
        _upsert(case, rec)
