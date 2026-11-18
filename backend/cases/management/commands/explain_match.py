"""
Why did (or didn't) a family report match? Shows the score of a report against every active
police / hospital record, step by step.

    python manage.py explain_match              list all family reports
    python manage.py explain_match 3            report 3 against every record
    python manage.py explain_match 3 --record 7 only record 7
"""
from django.core.management.base import BaseCommand

from cases.matching import THRESHOLD, score
from cases.models import FoundRecord, Match, MissingCase, Notification


class Command(BaseCommand):
    help = "Show how a family report scores against the police / hospital records, and why."

    def add_arguments(self, parser):
        parser.add_argument("case_id", nargs="?", type=int)
        parser.add_argument("--record", type=int)

    def handle(self, case_id=None, record=None, **_):
        if not case_id:
            self.stdout.write("Family reports (use: python manage.py explain_match <id>):")
            for c in MissingCase.objects.select_related("owner"):
                self.stdout.write(f"  #{c.id:<4} {c.person_name:<25} family {c.owner.phone}  matches: {c.matches.count()}")
            return
        case = MissingCase.objects.select_related("owner").filter(pk=case_id).first()
        if not case:
            return self.stderr.write(f"No family report #{case_id}.")
        recs = FoundRecord.objects.filter(is_active=True).select_related("reporter")
        if record:
            recs = recs.filter(pk=record)
        self.stdout.write(self.style.MIGRATE_HEADING(f"Report #{case.id} {case.person_name} (family {case.owner.phone})"))
        self.stdout.write(f"A match needs MORE than {THRESHOLD - 1}% before the family is told.\n")
        if not recs.exists():
            self.stdout.write("No active police / hospital records to compare with.")
        for rec in recs:
            steps = []
            s, why = score(case, rec, explain=steps)
            m = Match.objects.filter(case=case, record=rec).first()
            ok = s >= THRESHOLD
            style = self.style.SUCCESS if ok else self.style.WARNING
            self.stdout.write(style(f"Record #{rec.id} {rec.found_place} ({rec.source}, {rec.condition}): {s}%  "
                                    + ("MATCH" if ok else "no match")))
            for what, pts, note in steps:
                p = "  ?" if pts is None else f"{pts:+3d}"
                self.stdout.write(f"    {p}  {what:<9} {note}")
            if m:
                told = Notification.objects.filter(match=m, user=case.owner).exists()
                extra = "restricted: the family is told only after an officer confirms" if rec.is_deceased else (
                    "family notified" if told else "family NOT notified")
                self.stdout.write(f"    stored match #{m.id}, status {m.status}; {extra}")
            elif ok:
                self.stdout.write("    not stored yet: it is created the next time the record or the report is saved")
            self.stdout.write("")
