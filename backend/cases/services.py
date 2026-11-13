from .models import Match, Notification


def notify_match(match):
    """Create the in-app notification for a new match. The matching engine calls this.
    Restricted (deceased) records only tell the family that an officer will contact them."""
    kind = Notification.Kind.OFFICER if match.record_kind == Match.Kind.DECEASED else Notification.Kind.MATCH
    return Notification.objects.create(user=match.case.owner, kind=kind, case=match.case, match=match)
