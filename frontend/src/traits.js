// Dropdown vocabulary. Must stay the same as backend/cases/traits.py: the matcher compares these keys.
export const DIVISIONS = ["dhaka", "chattogram", "rajshahi", "khulna", "barishal", "sylhet", "rangpur", "mymensingh"];
export const RELATIONS = ["parent", "spouse", "child", "sibling", "relative", "friend", "other"];

// body region -> specific places inside it (the detailed dropdown)
export const BODY = {
  head: ["scalp", "forehead", "left_ear", "right_ear"],
  face: ["left_eye", "right_eye", "nose", "left_cheek", "right_cheek", "lips", "chin"],
  neck: ["front", "back"],
  torso: ["chest", "stomach", "upper_back", "lower_back", "left_side", "right_side"],
  left_arm: ["shoulder", "upper_arm", "elbow", "forearm", "wrist"],
  right_arm: ["shoulder", "upper_arm", "elbow", "forearm", "wrist"],
  left_hand: ["palm", "back_of_hand", "fingers"],
  right_hand: ["palm", "back_of_hand", "fingers"],
  left_leg: ["thigh", "knee", "shin", "calf", "ankle"],
  right_leg: ["thigh", "knee", "shin", "calf", "ankle"],
  left_foot: ["sole", "top_of_foot", "toes"],
  right_foot: ["sole", "top_of_foot", "toes"],
};
export const BODY_ORDER = Object.keys(BODY);
export const MARK_TYPES = ["scar", "tattoo", "birthmark", "mole", "burn", "wound", "fracture", "amputation", "piercing", "other"];

export const CLOTHING_ITEMS = ["shirt", "tshirt", "panjabi", "saree", "salwar_kameez", "burqa", "lungi", "trousers",
  "jeans", "skirt", "frock", "school_uniform", "jacket", "shoes", "sandals", "cap", "other"];
export const COLORS = ["red", "blue", "green", "yellow", "black", "white", "grey", "brown", "orange", "pink", "purple", "multi"];

export const TRAITS = {
  skin: ["fair", "wheatish", "brown", "dark"],
  build: ["thin", "medium", "heavy"],
  hair: ["black", "brown", "grey", "white", "dyed", "bald"],
  hair_length: ["short", "medium", "long"],
};

export const ID_TYPES = ["none", "nid", "birth_cert", "student", "worker", "licence", "passport", "other"];
export const CONDITIONS = ["conscious", "unconscious", "mute", "accident", "deceased"];
