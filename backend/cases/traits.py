"""
The dropdown choices shared by the family form and the police / medical forms.
The frontend has the same keys in src/traits.js (with Bangla and English labels).
Keeping both sides on one vocabulary is what lets the matcher compare them.
"""
import json

from rest_framework import serializers

GENDERS = ["male", "female", "other", "unknown"]
DIVISIONS = ["dhaka", "chattogram", "rajshahi", "khulna", "barishal", "sylhet", "rangpur", "mymensingh"]

# body region -> the specific places inside it (the "detailed dropdown")
BODY = {
    "head": ["scalp", "forehead", "left_ear", "right_ear"],
    "face": ["left_eye", "right_eye", "nose", "left_cheek", "right_cheek", "lips", "chin"],
    "neck": ["front", "back"],
    "torso": ["chest", "stomach", "upper_back", "lower_back", "left_side", "right_side"],
    "left_arm": ["shoulder", "upper_arm", "elbow", "forearm", "wrist"],
    "right_arm": ["shoulder", "upper_arm", "elbow", "forearm", "wrist"],
    "left_hand": ["palm", "back_of_hand", "fingers"],
    "right_hand": ["palm", "back_of_hand", "fingers"],
    "left_leg": ["thigh", "knee", "shin", "calf", "ankle"],
    "right_leg": ["thigh", "knee", "shin", "calf", "ankle"],
    "left_foot": ["sole", "top_of_foot", "toes"],
    "right_foot": ["sole", "top_of_foot", "toes"],
}
MARK_TYPES = ["scar", "tattoo", "birthmark", "mole", "burn", "wound", "fracture", "amputation", "piercing", "other"]

CLOTHING_ITEMS = ["shirt", "tshirt", "panjabi", "saree", "salwar_kameez", "burqa", "lungi", "trousers",
                  "jeans", "skirt", "frock", "school_uniform", "jacket", "shoes", "sandals", "cap", "other"]
COLORS = ["red", "blue", "green", "yellow", "black", "white", "grey", "brown", "orange", "pink", "purple", "multi"]

TRAITS = {
    "skin": ["fair", "wheatish", "brown", "dark"],
    "build": ["thin", "medium", "heavy"],
    "hair": ["black", "brown", "grey", "white", "dyed", "bald"],
    "hair_length": ["short", "medium", "long"],
}

ID_TYPES = ["none", "nid", "birth_cert", "student", "worker", "licence", "passport", "other"]

CONDITIONS = ["conscious", "unconscious", "mute", "accident", "deceased"]

MAX_MARKS, MAX_CLOTHES = 15, 10


class JSONListField(serializers.Field):
    """Accepts a list, or (from a multipart form) a JSON string holding one."""

    def __init__(self, item_validator, max_items, **kw):
        kw.setdefault("required", False)
        kw.setdefault("default", list)
        super().__init__(**kw)
        self.item_validator, self.max_items = item_validator, max_items

    def to_internal_value(self, data):
        if isinstance(data, str):
            if not data.strip():
                return []
            try:
                data = json.loads(data)
            except ValueError:
                raise serializers.ValidationError("bad_json")
        if not isinstance(data, list):
            raise serializers.ValidationError("bad_list")
        if len(data) > self.max_items:
            raise serializers.ValidationError("too_many")
        return [self.item_validator(x) for x in data]

    def to_representation(self, value):
        return value or []


class JSONDictField(JSONListField):
    def __init__(self, **kw):
        kw.setdefault("default", dict)
        super().__init__(item_validator=None, max_items=0, **kw)

    def to_internal_value(self, data):
        if isinstance(data, str):
            try:
                data = json.loads(data) if data.strip() else {}
            except ValueError:
                raise serializers.ValidationError("bad_json")
        if not isinstance(data, dict):
            raise serializers.ValidationError("bad_dict")
        out = {}
        for k, v in data.items():
            if k not in TRAITS:
                raise serializers.ValidationError("bad_trait")
            if v in ("", None):
                continue
            if v not in TRAITS[k]:
                raise serializers.ValidationError("bad_trait")
            out[k] = v
        return out

    def to_representation(self, value):
        return value or {}


def check_mark(m):
    if not isinstance(m, dict):
        raise serializers.ValidationError("bad_mark")
    region, part, kind = m.get("region", ""), m.get("part", "") or "", m.get("type", "")
    if region not in BODY or kind not in MARK_TYPES or (part and part not in BODY[region]):
        raise serializers.ValidationError("bad_mark")
    out = {"region": region, "part": part, "type": kind, "detail": str(m.get("detail", "")).strip()[:120]}
    pos = m.get("pos")
    if pos is not None:  # the exact point tapped on the 3D figure (metres, feet at y=0, facing +z)
        if not (isinstance(pos, list) and len(pos) == 3 and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in pos)):
            raise serializers.ValidationError("bad_mark")
        x, y, z = pos
        if not (-0.6 <= x <= 0.6 and -0.05 <= y <= 1.95 and -0.4 <= z <= 0.4):
            raise serializers.ValidationError("bad_mark")
        out["pos"] = [round(float(v), 3) for v in pos]
    return out


def check_clothing(c):
    if not isinstance(c, dict):
        raise serializers.ValidationError("bad_clothing")
    item, color = c.get("item", ""), c.get("color", "") or ""
    if item not in CLOTHING_ITEMS or (color and color not in COLORS):
        raise serializers.ValidationError("bad_clothing")
    return {"item": item, "color": color}


def marks_field():
    return JSONListField(check_mark, MAX_MARKS)


def clothes_field():
    return JSONListField(check_clothing, MAX_CLOTHES)
