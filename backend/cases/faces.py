"""
Face matching (image AI).

Models: OpenCV Zoo YuNet (finds the face) + SFace (turns it into 128 numbers). Both are Apache-2.0,
run on a normal CPU through opencv-python, and need ~40 MB of model files:

    python manage.py download_face_models      (once; start_server.sh does it for you)
    python manage.py face_check a.jpg b.jpg    (prints the similarity of two photos)

Flow:
  1. a photo is uploaded -> in the background its face is found and stored as `face_vector`
  2. matching compares every family photo with every police / hospital photo, keeps the best pair,
     and turns the cosine similarity into a 0-1 probability (calibrate)
  3. matching.score() blends it with the typed-in details: the fewer details both sides gave,
     the more the face decides (see matching.blend)
Swapping in a stronger model later only means changing embed_image(); the rest stays.
"""
import logging
import math
import threading
import urllib.request
from pathlib import Path

from django.conf import settings

log = logging.getLogger("shondhan.faces")

MODELS = {
    "detector": ("face_detection_yunet_2023mar.onnx", [
        "https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx",
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    ]),
    "recognizer": ("face_recognition_sface_2021dec.onnx", [
        "https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx",
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
    ]),
}

# SFace cosine similarity: OpenCV's suggested "same person" threshold is 0.363 (higher = more alike).
SAME_PERSON_COSINE = 0.363
MIN_DETECT_SCORE = 0.75   # YuNet confidence needed to accept a face
MIN_FACE_PX = 36          # smaller faces are too blurry to compare
MAX_SIDE = 1280           # big photos are shrunk first (faster, same result)

_lock = threading.Lock()
_models = None


def model_dir():
    return Path(getattr(settings, "FACE_MODEL_DIR", settings.BASE_DIR / "face_models"))


def enabled():
    return getattr(settings, "FACE_MATCHING", "on") == "on"


def models_present():
    return all((model_dir() / name).exists() for name, _ in MODELS.values())


def download_models(stdout=print):
    """Fetch the two ONNX files (official OpenCV copies; Hugging Face first, GitHub as backup)."""
    model_dir().mkdir(parents=True, exist_ok=True)
    for name, urls in MODELS.values():
        target = model_dir() / name
        if target.exists() and target.stat().st_size > 100_000:
            stdout(f"  {name}: already there")
            continue
        for url in urls:
            try:
                stdout(f"  {name}: downloading from {url.split('/')[2]} ...")
                tmp = target.with_suffix(".part")
                urllib.request.urlretrieve(url, tmp)
                if tmp.stat().st_size < 100_000:  # an error page, not a model
                    tmp.unlink()
                    raise OSError("file too small")
                tmp.rename(target)
                break
            except Exception as e:  # try the next source
                stdout(f"    failed: {e}")
        else:
            raise RuntimeError(f"Could not download {name}")


def _load():
    """Load the models once (thread-safe). Returns None when face matching cannot run."""
    global _models
    if _models is not None:
        return _models or None
    with _lock:
        if _models is not None:
            return _models or None
        if not enabled() or not models_present():
            _models = False
            return None
        try:
            import cv2
            det = cv2.FaceDetectorYN.create(str(model_dir() / MODELS["detector"][0]), "", (320, 320),
                                            MIN_DETECT_SCORE, 0.3, 50)
            rec = cv2.FaceRecognizerSF.create(str(model_dir() / MODELS["recognizer"][0]), "")
            _models = (cv2, det, rec)
        except Exception:
            log.exception("Face models could not be loaded; face matching is off")
            _models = False
        return _models or None


def ready():
    return _load() is not None


def embed_image(data):
    """Bytes of an image -> {"vector": [128 floats, unit length], "quality": 0-1} or None if no usable face.
    Raises when the models are not available."""
    loaded = _load()
    if not loaded:
        raise RuntimeError("face models not available")
    cv2, det, rec = loaded
    import numpy as np
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return None
    h, w = img.shape[:2]
    scale = min(1.0, MAX_SIDE / max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
        h, w = img.shape[:2]
    with _lock:  # OpenCV DNN objects are not thread-safe
        det.setInputSize((w, h))
        _, faces = det.detect(img)
        if faces is None or not len(faces):
            return None
        face = max(faces, key=lambda f: f[2] * f[3])  # the biggest face is the person
        if min(face[2], face[3]) < MIN_FACE_PX:
            return None
        aligned = rec.alignCrop(img, face)
        feat = rec.feature(aligned).flatten().astype(float)
    norm = math.sqrt(sum(x * x for x in feat)) or 1.0
    size_q = min(1.0, min(face[2], face[3]) / 160.0)  # bigger, sharper faces are more reliable
    return {"vector": [round(x / norm, 6) for x in feat], "quality": round(float(face[14]) * (0.5 + 0.5 * size_q), 3)}


def process_photo(photo):
    """Find the face in one CasePhoto / RecordPhoto and store its numbers. Never raises."""
    if photo.kind != "photo":
        return photo
    try:
        with photo.image.open("rb") as fh:
            result = embed_image(fh.read())
        if result:
            photo.face_vector, photo.face_quality, photo.face_status = result["vector"], result["quality"], "ok"
        else:
            photo.face_vector, photo.face_quality, photo.face_status = None, None, "none"
    except FileNotFoundError:
        log.warning("photo %s: file is missing on disk (%s)", photo.pk, photo.image.name)
        photo.face_status = "missing"
    except RuntimeError:
        photo.face_status = "off"
    except Exception:
        log.exception("face processing failed for photo %s", photo.pk)
        photo.face_status = "error"
    photo.save(update_fields=["face_vector", "face_quality", "face_status"])
    return photo


# ---------- comparing ----------

def cosine(a, b):
    return sum(x * y for x, y in zip(a, b))  # vectors are stored with unit length


def calibrate(cos):
    """Cosine similarity -> 0-1 'looks like the same person'. 0.5 at OpenCV's threshold, steep around it."""
    return 1.0 / (1.0 + math.exp(-(cos - SAME_PERSON_COSINE) / 0.05))


def _vectors(obj):
    return [(p.id, p.face_vector, p.face_quality or 0.5) for p in obj.photos.all()
            if p.kind == "photo" and p.face_status == "ok" and p.face_vector]


def best_pair(a, b):
    """Best face pair between two people (case/record or record/record).
    Returns {"prob", "cos", "pair": [a_photo_id, b_photo_id]} or None when either side has no usable face."""
    va, vb = _vectors(a), _vectors(b)
    if not va or not vb:
        return None
    best = None
    for ida, fa, qa in va:
        for idb, fb, qb in vb:
            c = cosine(fa, fb)
            if best is None or c > best[0]:
                best = (c, ida, idb, min(qa, qb))
    cos, ida, idb, q = best
    prob = calibrate(cos)
    # a poor-quality pair (tiny / unsure face) pulls the result towards "don't know" (0.5) instead of a firm answer
    prob = 0.5 + (prob - 0.5) * max(0.4, min(1.0, q))
    return {"prob": round(prob, 3), "cos": round(cos, 3), "pair": [ida, idb]}


# ---------- running in the background ----------

def schedule(kind, obj_id):
    """After an upload: find faces in the new photos, then run matching again. Runs in a background
    thread (FACE_ASYNC=True) so the person is not kept waiting; in tests it runs straight away."""
    if not enabled():
        return

    def work():
        from django.db import close_old_connections
        try:
            run(kind, obj_id)
        finally:
            close_old_connections()

    if getattr(settings, "FACE_ASYNC", True):
        from django.db import transaction
        transaction.on_commit(lambda: threading.Thread(target=work, daemon=True).start())
    else:
        run(kind, obj_id)


def run(kind, obj_id):
    from .matching import find_duplicates, run_for_case, run_for_record
    from .models import FoundRecord, MissingCase
    model = MissingCase if kind == "case" else FoundRecord
    obj = model.objects.filter(pk=obj_id).first()
    if not obj:
        return
    pending = [p for p in obj.photos.all() if p.kind == "photo" and p.face_status in ("pending", "off", "error", "missing")]
    if not pending or not ready():
        return
    for p in pending:
        process_photo(p)
    if kind == "case":
        run_for_case(obj)
    else:
        run_for_record(obj)
        find_duplicates(obj)
