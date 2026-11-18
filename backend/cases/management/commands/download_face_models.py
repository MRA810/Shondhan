"""python manage.py download_face_models  -> fetch the two face AI model files (~40 MB) into backend/face_models/"""
from django.core.management.base import BaseCommand, CommandError

from cases import faces


class Command(BaseCommand):
    help = "Download the YuNet + SFace face models used for photo matching."

    def handle(self, **_):
        try:
            faces.download_models(self.stdout.write)
        except RuntimeError as e:
            raise CommandError(f"{e}. Check the internet connection and try again.")
        faces._models = None  # reload on next use
        if faces.ready():
            self.stdout.write(self.style.SUCCESS("Face models are ready."))
        else:
            raise CommandError("The files downloaded but OpenCV could not load them. Is opencv-python-headless installed?")
