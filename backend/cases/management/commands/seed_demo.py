"""python manage.py seed_demo  -> one demo account per role plus a few sample posts, for trying the app."""
import io
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand
from django.utils import timezone
from PIL import Image, ImageDraw

from accounts.models import User
from cases.matching import find_duplicates, run_for_case, run_for_record
from cases.models import CasePhoto, FoundRecord, MissingCase, RecordPhoto

PASSWORD = "Shondhan@2026"
ACCOUNTS = [
    ("01700000001", "admin", "Admin Rahman", ""),
    ("01700000002", "officer", "Officer Nasrin", "Case Desk, Dhaka"),
    ("01700000003", "police", "SI Karim", "Mirpur Model Thana"),
    ("01700000004", "medical", "Dr. Sultana", "Dhaka Medical College Hospital"),
    ("01700000005", "auditor", "Auditor Hasan", ""),
    ("01700000006", "family", "Ayesha Begum", ""),
]


def picture(color, name):
    img = Image.new("RGB", (320, 320), color)
    d = ImageDraw.Draw(img)
    d.ellipse((100, 50, 220, 170), fill=(235, 200, 170))
    d.rectangle((80, 180, 240, 320), fill=tuple(max(0, c - 60) for c in color))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return SimpleUploadedFile(name, buf.getvalue(), content_type="image/png")


class Command(BaseCommand):
    help = "Create demo users for every role and sample posts (development only)."

    def handle(self, *args, **opts):
        users = {}
        for phone, role, name, org in ACCOUNTS:
            u, created = User.objects.get_or_create(username=phone, defaults=dict(
                phone=phone, role=role, first_name=name, organization=org, age=40 if role == "family" else None,
                relationship="parent" if role == "family" else "", approved_at=timezone.now(),
                is_staff=role == "admin", is_superuser=role == "admin"))
            if created:
                u.set_password(PASSWORD)
                u.save()
            users[role] = u
        if MissingCase.objects.filter(owner=users["family"]).exists():
            self.stdout.write("Demo data already exists.")
            return self._print()

        now = timezone.now()
        case = MissingCase.objects.create(
            owner=users["family"], relationship="parent", person_name="Rahim Uddin", person_age=62, gender="male",
            height_cm=165, division="dhaka", last_seen_place="Mirpur 10 bus stand", last_seen_at=now - timedelta(days=4),
            traits={"skin": "brown", "build": "thin", "hair": "grey"},
            clothing=[{"item": "panjabi", "color": "white"}, {"item": "lungi", "color": "blue"}],
            belongings="black umbrella, reading glasses", cannot_speak=False,
            marks=[{"region": "left_arm", "part": "forearm", "type": "scar", "detail": "old burn scar", "pos": [0.335, 1.02, 0.02]},
                   {"region": "face", "part": "right_cheek", "type": "mole", "detail": "", "pos": [-0.066, 1.632, 0.09]}])
        for i in range(3):
            CasePhoto.objects.create(case=case, image=picture((120 + i * 30, 90, 60), f"c{i}.png"))

        police = FoundRecord.objects.create(
            reporter=users["police"], source="police", condition="mute", gender="male", age_min=55, age_max=70,
            height_cm=163, traits={"skin": "brown", "build": "thin", "hair": "grey"},
            clothing=[{"item": "panjabi", "color": "white"}], belongings="umbrella",
            marks=[{"region": "left_arm", "part": "forearm", "type": "scar", "detail": "", "pos": [0.338, 1.0, 0.025]}],
            division="dhaka", found_place="Mirpur Model Thana", found_area="Mirpur 1", found_at=now - timedelta(days=2),
            contact_name="SI Karim", contact_phone="01700000003")
        RecordPhoto.objects.create(record=police, image=picture((80, 110, 160), "r1.png"))
        medical = FoundRecord.objects.create(
            reporter=users["medical"], source="medical", condition="mute", gender="male", age_min=58, age_max=68,
            traits={"skin": "brown", "hair": "grey"}, clothing=[{"item": "panjabi", "color": "white"}],
            marks=[{"region": "left_arm", "part": "forearm", "type": "scar", "detail": "healed", "pos": [0.33, 1.04, 0.03]},
                   {"region": "right_leg", "part": "knee", "type": "wound", "detail": "fresh graze", "pos": [-0.1, 0.5, 0.06]}],
            medical_notes="Dehydrated, stable. Ward 5.", division="dhaka",
            found_place="Dhaka Medical College Hospital", found_area="Ward 5", found_at=now - timedelta(days=1),
            contact_name="Dr. Sultana", contact_phone="01700000004")
        RecordPhoto.objects.create(record=medical, image=picture((90, 140, 120), "r2.png"))
        from cases import faces
        if faces.ready():  # demo pictures are drawings: no real faces, so they just get "no clear face"
            for p in list(case.photos.all()) + list(police.photos.all()) + list(medical.photos.all()):
                faces.process_photo(p)
        for rec in (police, medical):
            run_for_record(rec)
        find_duplicates(medical)
        run_for_case(case)
        self.stdout.write(self.style.SUCCESS("Demo data created."))
        self._print()

    def _print(self):
        self.stdout.write(f"Password for every demo account: {PASSWORD}")
        for phone, role, name, _ in ACCOUNTS:
            self.stdout.write(f"  {role:8} {phone}  {name}")
