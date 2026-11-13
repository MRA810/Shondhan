from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .matching import run_for_record
from .models import CasePhoto, FoundRecord


@receiver(post_save, sender=FoundRecord)
def match_new_record(sender, instance, **kwargs):
    transaction.on_commit(lambda: run_for_record(instance))


@receiver(post_delete, sender=CasePhoto)
def remove_photo_file(sender, instance, **kwargs):
    # "Found" means removed completely, including the image files on disk.
    if instance.image:
        instance.image.delete(save=False)
