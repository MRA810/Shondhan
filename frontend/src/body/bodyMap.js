// Where things are on the 3D figure (no three.js here, so forms can use it without loading 3D).
// Model space: metres, feet at y=0, facing +z (towards the viewer). The person's LEFT side is +x.

export const SIDE = { left: 1, right: -1 };

// the centre of every exact place, used when someone picks from the list instead of tapping
export function partCenter(region, part) {
  const side = region.startsWith("left") ? 1 : region.startsWith("right") ? -1 : 0;
  const s = side;
  const T = {
    head: { scalp: [0, 1.79, -0.02], forehead: [0, 1.735, 0.085], left_ear: [0.104, 1.665, 0], right_ear: [-0.104, 1.665, 0], "": [0, 1.76, 0.04] },
    face: { left_eye: [0.038, 1.68, 0.104], right_eye: [-0.038, 1.68, 0.104], nose: [0, 1.645, 0.124], left_cheek: [0.066, 1.632, 0.09],
      right_cheek: [-0.066, 1.632, 0.09], lips: [0, 1.6, 0.104], chin: [0, 1.56, 0.09], "": [0, 1.64, 0.11] },
    neck: { front: [0, 1.51, 0.052], back: [0, 1.51, -0.052], "": [0, 1.51, 0.052] },
    torso: { chest: [0, 1.3, 0.125], stomach: [0, 1.04, 0.126], upper_back: [0, 1.3, -0.125], lower_back: [0, 1.0, -0.124],
      left_side: [0.208, 1.15, 0], right_side: [-0.208, 1.15, 0], "": [0, 1.18, 0.127] },
  };
  if (T[region]) return T[region][part ?? ""] || T[region][""];
  const kind = region.split("_")[1];
  const L = {
    arm: { shoulder: [s * 0.26, 1.48, 0], upper_arm: [s * 0.327, 1.27, 0], elbow: [s * 0.33, 1.14, 0.02], forearm: [s * 0.34, 1.0, 0], wrist: [s * 0.34, 0.885, 0], "": [s * 0.327, 1.2, 0] },
    hand: { palm: [s * 0.29, 0.79, 0], back_of_hand: [s * 0.325, 0.79, 0], fingers: [s * 0.307, 0.725, 0], "": [s * 0.307, 0.79, 0.04] },
    leg: { thigh: [s * 0.1, 0.75, 0.074], knee: [s * 0.1, 0.5, 0.06], shin: [s * 0.1, 0.3, 0.055], calf: [s * 0.1, 0.3, -0.055], ankle: [s * 0.1, 0.1, 0.05], "": [s * 0.1, 0.5, 0.06] },
    foot: { sole: [s * 0.1, 0.0, 0.05], top_of_foot: [s * 0.1, 0.075, 0.06], toes: [s * 0.1, 0.035, 0.185], "": [s * 0.1, 0.07, 0.06] },
  };
  return L[kind][part ?? ""] || L[kind][""];
}

// which exact place a tapped point is: mesh region + 3D point -> {region, part}
export function locate(region, [x, y, z]) {
  if (region === "head") {
    if (Math.abs(x) > 0.085 && y > 1.6 && y < 1.73) return { region: "head", part: x > 0 ? "left_ear" : "right_ear" };
    if (z > 0.055 && y < 1.715) {
      let part;
      if (y < 1.575) part = "chin";
      else if (y < 1.615) part = "lips";
      else if (y > 1.664 && Math.abs(x) > 0.016) part = x > 0 ? "left_eye" : "right_eye";
      else if (Math.abs(x) < 0.026) part = "nose";
      else part = x > 0 ? "left_cheek" : "right_cheek";
      return { region: "face", part };
    }
    return { region: "head", part: z > 0.035 && y >= 1.7 ? "forehead" : "scalp" };
  }
  if (region === "neck") return { region, part: z >= 0 ? "front" : "back" };
  if (region === "torso") {
    if (Math.abs(x) > 0.175) return { region, part: x > 0 ? "left_side" : "right_side" };
    if (z >= 0) return { region, part: y > 1.16 ? "chest" : "stomach" };
    return { region, part: y > 1.16 ? "upper_back" : "lower_back" };
  }
  const kind = region.split("_")[1];
  if (kind === "arm") {
    const part = y > 1.4 ? "shoulder" : y > 1.18 ? "upper_arm" : y > 1.09 ? "elbow" : y > 0.92 ? "forearm" : "wrist";
    return { region, part };
  }
  if (kind === "hand") {
    if (y < 0.745) return { region, part: "fingers" };
    return { region, part: Math.abs(x) < 0.307 ? "palm" : "back_of_hand" };
  }
  if (kind === "leg") {
    const part = y > 0.57 ? "thigh" : y > 0.43 ? "knee" : y > 0.14 ? (z >= 0 ? "shin" : "calf") : "ankle";
    return { region, part };
  }
  if (kind === "foot") {
    if (y < 0.012) return { region, part: "sole" };
    return { region, part: z > 0.12 ? "toes" : "top_of_foot" };
  }
  return { region, part: "" };
}

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

export const PIN_COLORS = { family: "#E5484D", found: "#2F80ED", draft: "#0F42C0" };
