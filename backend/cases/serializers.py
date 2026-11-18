from django.utils import timezone
from rest_framework import serializers

from accounts.serializers import RELATIONS, clean_phone
from .models import CasePhoto, FoundRecord, MergeRequest, Match, MissingCase, PhotoKind, RecordPhoto
from .traits import (CONDITIONS, DIVISIONS, ID_TYPES, JSONDictField, clothes_field, marks_field)

MAX_FILE = 5 * 1024 * 1024


def _check_files(files):
    for f in files:
        if f.size > MAX_FILE:
            raise serializers.ValidationError("too_big")
    return files


def _strip_required(v):
    v = v.strip()
    if not v:
        raise serializers.ValidationError("blank")
    return v


def _not_future(v):
    if v and v > timezone.now():
        raise serializers.ValidationError("future")
    return v


def photo_list(obj, kinds=(PhotoKind.PHOTO, PhotoKind.DOCUMENT)):
    # face: pending / ok / none (no clear face found) / off / error, so the page can ask for a clearer photo
    return [{"id": p.id, "kind": p.kind, "face": p.face_status} for p in obj.photos.all() if p.kind in kinds]


def first_photo(obj):
    return next((p.id for p in obj.photos.all() if p.kind == PhotoKind.PHOTO), None)


# ---------------- family: missing-person cases ----------------

class CaseCreateSerializer(serializers.Serializer):
    person_name = serializers.CharField(max_length=100)
    person_age = serializers.IntegerField(min_value=0, max_value=120, required=False, allow_null=True)
    gender = serializers.ChoiceField(choices=["male", "female", "other"])
    relationship = serializers.ChoiceField(choices=RELATIONS)
    height_cm = serializers.IntegerField(min_value=40, max_value=250, required=False, allow_null=True)
    division = serializers.ChoiceField(choices=DIVISIONS, required=False, allow_blank=True)
    last_seen_place = serializers.CharField(max_length=200, required=False, allow_blank=True)
    last_seen_at = serializers.DateTimeField(required=False, allow_null=True)
    traits = JSONDictField()
    clothing = clothes_field()
    belongings = serializers.CharField(max_length=300, required=False, allow_blank=True)
    marks = marks_field()
    cannot_speak = serializers.BooleanField(required=False, default=False)
    id_type = serializers.ChoiceField(choices=ID_TYPES, required=False, allow_blank=True)
    id_number = serializers.CharField(max_length=40, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)
    photos = serializers.ListField(child=serializers.ImageField(), min_length=3, max_length=8)
    documents = serializers.ListField(child=serializers.ImageField(), max_length=4, required=False)

    def validate_person_name(self, v):
        return _strip_required(v)

    def validate_last_seen_at(self, v):
        return _not_future(v)

    def validate_photos(self, v):
        return _check_files(v)

    def validate_documents(self, v):
        return _check_files(v)

    def create(self, d):
        photos, docs = d.pop("photos"), d.pop("documents", [])
        d["id_number"] = d.get("id_number", "").strip()
        owner = self.context.get("owner") or self.context["request"].user
        case = MissingCase.objects.create(owner=owner, **d)
        for f in photos:
            CasePhoto.objects.create(case=case, kind=PhotoKind.PHOTO, image=f)
        for f in docs:
            CasePhoto.objects.create(case=case, kind=PhotoKind.DOCUMENT, image=f)
        return case


class CaseCardSerializer(serializers.ModelSerializer):
    match_count = serializers.IntegerField(read_only=True)
    best_score = serializers.IntegerField(read_only=True, allow_null=True)  # ignores restricted records
    photo_id = serializers.SerializerMethodField()
    official_views = serializers.SerializerMethodField()

    class Meta:
        model = MissingCase
        fields = ("id", "person_name", "person_age", "gender", "last_seen_place", "last_seen_at",
                  "created_at", "match_count", "best_score", "photo_id", "official_views")

    def get_photo_id(self, obj):
        return first_photo(obj)

    def get_official_views(self, obj):
        return (self.context.get("views") or {}).get(obj.id, 0)


class CaseDetailSerializer(serializers.ModelSerializer):
    photos = serializers.SerializerMethodField()

    class Meta:
        model = MissingCase
        fields = ("id", "person_name", "person_age", "gender", "relationship", "height_cm", "division",
                  "last_seen_place", "last_seen_at", "traits", "clothing", "belongings", "marks", "cannot_speak",
                  "id_type", "id_number", "notes", "created_at", "photos")

    def get_photos(self, obj):
        return photo_list(obj)


# What a family may see of a found record. Deceased records: nothing identifying, ever.
FAMILY_RECORD_FIELDS = ("source", "condition", "gender", "age_min", "age_max", "height_cm", "traits", "clothing",
                        "belongings", "marks", "division", "found_place", "found_area", "found_at",
                        "contact_name", "contact_phone")


class FamilyMatchSerializer(serializers.ModelSerializer):
    case_id = serializers.IntegerField(read_only=True)
    case_name = serializers.SerializerMethodField()
    band = serializers.CharField(read_only=True)
    restricted = serializers.BooleanField(read_only=True)
    record = serializers.SerializerMethodField()

    class Meta:
        model = Match
        fields = ("id", "case_id", "case_name", "score", "band", "reasons", "status", "restricted",
                  "created_at", "record")

    def get_case_name(self, obj):
        return obj.case.person_name

    def get_record(self, obj):
        rec = obj.record
        if obj.restricted:
            return None
        data = {f: getattr(rec, f) for f in FAMILY_RECORD_FIELDS}
        data["photo_ids"] = [p["id"] for p in photo_list(rec, (PhotoKind.PHOTO,))]
        data["organization"] = rec.reporter.organization
        data["id"] = rec.id
        if not self.context.get("detail"):
            data = {k: data[k] for k in ("source", "condition", "found_place", "found_area", "found_at",
                                         "contact_phone", "photo_ids")}
        return data

    def to_representation(self, obj):
        data = super().to_representation(obj)
        if obj.restricted:  # nothing identifying leaves the server
            data.update(score=None, band="restricted", reasons=[])
        return data


# ---------------- police / medical: found records ----------------

class RecordWriteSerializer(serializers.Serializer):
    condition = serializers.ChoiceField(choices=CONDITIONS)
    name_hint = serializers.CharField(max_length=100, required=False, allow_blank=True)
    gender = serializers.ChoiceField(choices=["male", "female", "other", "unknown"])
    age_min = serializers.IntegerField(min_value=0, max_value=120, required=False, allow_null=True)
    age_max = serializers.IntegerField(min_value=0, max_value=120, required=False, allow_null=True)
    height_cm = serializers.IntegerField(min_value=40, max_value=250, required=False, allow_null=True)
    traits = JSONDictField()
    clothing = clothes_field()
    belongings = serializers.CharField(max_length=300, required=False, allow_blank=True)
    marks = marks_field()
    id_type = serializers.ChoiceField(choices=ID_TYPES, required=False, allow_blank=True)
    id_number = serializers.CharField(max_length=40, required=False, allow_blank=True)
    medical_notes = serializers.CharField(max_length=500, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)
    division = serializers.ChoiceField(choices=DIVISIONS)
    found_place = serializers.CharField(max_length=200)
    found_area = serializers.CharField(max_length=150, required=False, allow_blank=True)
    found_at = serializers.DateTimeField()
    contact_name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    contact_phone = serializers.CharField(max_length=20)
    photos = serializers.ListField(child=serializers.ImageField(), min_length=1, max_length=8)
    documents = serializers.ListField(child=serializers.ImageField(), max_length=4, required=False)

    def validate_found_place(self, v):
        return _strip_required(v)

    def validate_found_at(self, v):
        return _not_future(v)

    def validate_contact_phone(self, v):
        return clean_phone(v)

    def validate_photos(self, v):
        return _check_files(v)

    def validate_documents(self, v):
        return _check_files(v)

    def validate(self, d):
        inst = self.instance
        lo = d.get("age_min", inst.age_min if inst else None)
        hi = d.get("age_max", inst.age_max if inst else None)
        if lo is not None and hi is not None and lo > hi:
            raise serializers.ValidationError({"age_max": "range"})
        if inst:
            have = inst.photos.filter(kind=PhotoKind.DOCUMENT).count()
            if have + len(d.get("documents", [])) > 4:
                raise serializers.ValidationError({"documents": "too_many"})
            if inst.photos.filter(kind=PhotoKind.PHOTO).count() + len(d.get("photos", [])) > 8:
                raise serializers.ValidationError({"photos": "too_many"})
        return d

    def _save_files(self, rec, photos, docs):
        for f in photos:
            RecordPhoto.objects.create(record=rec, kind=PhotoKind.PHOTO, image=f)
        for f in docs:
            RecordPhoto.objects.create(record=rec, kind=PhotoKind.DOCUMENT, image=f)

    def create(self, d):
        photos, docs = d.pop("photos"), d.pop("documents", [])
        user = self.context["request"].user
        rec = FoundRecord.objects.create(reporter=user, source=user.role, **d)
        self._save_files(rec, photos, docs)
        return rec

    def update(self, rec, d):
        photos, docs = d.pop("photos", []), d.pop("documents", [])
        for k, v in d.items():
            setattr(rec, k, v)
        rec.save()
        self._save_files(rec, photos, docs)
        return rec


class RecordSerializer(serializers.ModelSerializer):
    photos = serializers.SerializerMethodField()
    photo_id = serializers.SerializerMethodField()
    organization = serializers.CharField(source="reporter.organization", read_only=True)
    reporter_name = serializers.CharField(source="reporter.first_name", read_only=True)
    match_count = serializers.SerializerMethodField()
    family_views = serializers.SerializerMethodField()
    merged_count = serializers.SerializerMethodField()

    class Meta:
        model = FoundRecord
        fields = ("id", "source", "condition", "name_hint", "gender", "age_min", "age_max", "height_cm", "traits",
                  "clothing", "belongings", "marks", "id_type", "id_number", "medical_notes", "notes", "division",
                  "found_place", "found_area", "found_at", "contact_name", "contact_phone", "is_active",
                  "created_at", "photos", "photo_id", "organization", "reporter_name", "match_count",
                  "family_views", "merged_count")

    def get_photos(self, obj):
        return photo_list(obj)

    def get_photo_id(self, obj):
        return first_photo(obj)

    def get_match_count(self, obj):
        return obj.matches.exclude(status=Match.Status.REJECTED).count()

    def get_family_views(self, obj):
        from .services import view_count
        return view_count("record", obj.id, roles=["family"])

    def get_merged_count(self, obj):
        return obj.merged_from.count()


def record_brief(rec):
    return {"id": rec.id, "source": rec.source, "condition": rec.condition, "gender": rec.gender,
            "age_min": rec.age_min, "age_max": rec.age_max, "found_place": rec.found_place,
            "found_area": rec.found_area, "found_at": rec.found_at, "organization": rec.reporter.organization,
            "photo_id": first_photo(rec), "marks": rec.marks, "clothing": rec.clothing, "name_hint": rec.name_hint}


class MergeRequestSerializer(serializers.ModelSerializer):
    mine = serializers.SerializerMethodField()
    other = serializers.SerializerMethodField()
    my_ok = serializers.SerializerMethodField()
    their_ok = serializers.SerializerMethodField()

    class Meta:
        model = MergeRequest
        fields = ("id", "score", "reasons", "status", "created_at", "mine", "other", "my_ok", "their_ok")

    def _side(self, obj):
        from .services import merge_side
        return merge_side(obj, self.context["request"].user)

    def get_mine(self, obj):
        return (obj.a if self._side(obj) == "a" else obj.b).id

    def get_other(self, obj):
        return record_brief(obj.b if self._side(obj) == "a" else obj.a)

    def get_my_ok(self, obj):
        return obj.a_ok if self._side(obj) == "a" else obj.b_ok

    def get_their_ok(self, obj):
        return obj.b_ok if self._side(obj) == "a" else obj.a_ok


# ---------------- case officer ----------------

class QueueSerializer(serializers.ModelSerializer):
    band = serializers.CharField(read_only=True)
    restricted = serializers.BooleanField(read_only=True)
    case = serializers.SerializerMethodField()
    record = serializers.SerializerMethodField()

    class Meta:
        model = Match
        fields = ("id", "score", "band", "reasons", "status", "restricted", "created_at", "case", "record", "face_score")

    def get_case(self, obj):
        c = obj.case
        return {"id": c.id, "person_name": c.person_name, "person_age": c.person_age, "gender": c.gender,
                "photo_id": first_photo(c), "division": c.division}

    def get_record(self, obj):
        return record_brief(obj.record)
