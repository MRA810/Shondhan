"""python manage.py face_check photo1.jpg photo2.jpg [more.jpg ...]
Checks that the face AI works on this computer and shows how alike the faces in the photos are.
Use photos of people who agreed to it (e.g. yourself on two different days)."""
import time

from django.core.management.base import BaseCommand, CommandError

from cases import faces


class Command(BaseCommand):
    help = "Test the face models on your own photos."

    def add_arguments(self, parser):
        parser.add_argument("photos", nargs="+")

    def handle(self, photos, **_):
        if not faces.ready():
            raise CommandError("Face models are not available. Run: python manage.py download_face_models")
        found = []
        import os
        for path in photos:
            if not os.path.isfile(path):
                self.stdout.write(self.style.ERROR(f"  {path}: file not found"))
                continue
            t = time.perf_counter()
            with open(path, "rb") as fh:
                r = faces.embed_image(fh.read())
            ms = (time.perf_counter() - t) * 1000
            if r:
                self.stdout.write(f"  {path}: face found (quality {r['quality']:.2f}) in {ms:.0f} ms")
                found.append((path, r["vector"]))
            else:
                self.stdout.write(self.style.WARNING(f"  {path}: no clear face ({ms:.0f} ms)"))
        if len(found) < 2:
            return
        self.stdout.write("\nSimilarity (100% = surely the same person, 50% = unsure, 0% = different people):")
        for i in range(len(found)):
            for j in range(i + 1, len(found)):
                c = faces.cosine(found[i][1], found[j][1])
                self.stdout.write(f"  {found[i][0]}  vs  {found[j][0]}:  {round(faces.calibrate(c) * 100)}%  (cosine {c:.3f})")
