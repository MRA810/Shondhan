from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from cases.models import Case, Match
from cases.services import notify_match


class Command(BaseCommand):
    help = "DEV ONLY: add sample cases, matches and notifications to a family account (by phone)."

    def add_arguments(self, parser):
        parser.add_argument("phone")

    def handle(self, *args, **opts):
        User = get_user_model()
        user = User.objects.filter(phone=opts["phone"], role="family").first()
        if not user:
            raise CommandError("No family user with that phone.")
        if user.cases.exists():
            raise CommandError("This user already has cases; refusing to add demo data.")
        now = timezone.now()
        a = Case.objects.create(owner=user, person_name="Rahim Uddin", person_age=62, relationship="parent",
                                last_seen_place="Mirpur 10, Dhaka", last_seen_at=now - timedelta(days=3))
        b = Case.objects.create(owner=user, person_name="Sumaiya Akter", person_age=17, relationship="sibling",
                                last_seen_place="Chattogram railway station", last_seen_at=now - timedelta(days=9))
        Case.objects.create(owner=user, person_name="Karim Mia", person_age=45, relationship="relative",
                            last_seen_place="Sylhet bus stand", last_seen_at=now - timedelta(days=1))
        m1 = Match.objects.create(case=a, score=91, found_place="Dhaka Medical College Hospital", found_area="Shahbag, Dhaka",
                                  found_at=now - timedelta(hours=20), contact_phone="01700000001", verified=True)
        m2 = Match.objects.create(case=a, score=68, found_place="Mirpur Model Police Station", found_area="Mirpur, Dhaka",
                                  found_at=now - timedelta(days=1), contact_phone="01700000002")
        m3 = Match.objects.create(case=b, score=88, record_kind=Match.Kind.DECEASED)
        for m in (m2, m3, m1):  # m1 last, so the banner shows the strongest living match
            notify_match(m)
        self.stdout.write(self.style.SUCCESS(f"Demo data added for {user.phone}"))
