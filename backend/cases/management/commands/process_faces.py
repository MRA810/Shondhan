"""python manage.py process_faces  -> find faces in every photo not done yet, then run matching again.
Use it after installing the models on a database that already has photos."""
from django.core.management.base import BaseCommand, CommandError

from cases import faces
from cases.matching import find_duplicates, run_for_case, run_for_record
from cases.models import CasePhoto, FoundRecord, MissingCase, RecordPhoto


class Command(BaseCommand):
    help = "Find faces in all unprocessed photos and re-run matching."

    def add_arguments(self, parser):
        parser.add_argument("--all", action="store_true", help="redo every photo, not only unprocessed ones")

    def handle(self, all=False, **_):
        if not faces.ready():
            raise CommandError("Face models are not available. Run: python manage.py download_face_models")
        counts = {"ok": 0, "none": 0, "error": 0, "missing": 0}
        for model in (CasePhoto, RecordPhoto):
            qs = model.objects.filter(kind="photo")
            if not all:
                qs = qs.exclude(face_status="ok").exclude(face_status="none")
            for p in qs.iterator():
                faces.process_photo(p)
                counts[p.face_status] = counts.get(p.face_status, 0) + 1
        self.stdout.write(f"Photos: {counts.get('ok', 0)} with a face, {counts.get('none', 0)} without a clear face, "
                          f"{counts.get('error', 0)} errors.")
        if counts["missing"]:
            from django.conf import settings
            self.stdout.write(self.style.WARNING(
                f"{counts['missing']} photo files are missing from {settings.PRIVATE_MEDIA_ROOT}\n"
                "  The database lists them but the files are not in this folder. If you moved the project,\n"
                "  copy backend/private_media/ from the old folder into this one, then run this again."))
        for case in MissingCase.objects.all():
            run_for_case(case)
        for rec in FoundRecord.objects.filter(is_active=True):
            find_duplicates(rec)
        self.stdout.write(self.style.SUCCESS("Matching updated with the photos."))
