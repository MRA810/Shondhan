import { Suspense, lazy } from "react";
import { usePrefs } from "../prefs.jsx";
import { Loading, markText } from "../components/ui.jsx";
import { PIN_COLORS, hasWebGL } from "./bodyMap.js";

export const BodyModel = lazy(() => import("./BodyModel.jsx"));

export const marksToPins = (t, marks = [], color = PIN_COLORS.family, prefix = "") =>
  marks.map((m, i) => (m.pos ? { pos: m.pos, color, n: i + 1, label: `${prefix}${i + 1}. ${markText(t, m)}` } : null)).filter(Boolean);

// Read-only figure with the marks pinned. `second` overlays another set (officer comparison).
export default function MarksFigure({ marks, second, firstLabel, secondLabel }) {
  const { t } = usePrefs();
  const pins = [...marksToPins(t, marks, PIN_COLORS.family, second ? "A" : ""),
    ...(second ? marksToPins(t, second, PIN_COLORS.found, "B") : [])];
  if (!pins.length || !hasWebGL()) return null;
  return (
    <div className="figurebox">
      <h3>{t("b3_figure")}</h3>
      {second && (
        <p className="legend">
          <span><i style={{ background: PIN_COLORS.family }} /> A: {firstLabel}</span>
          <span><i style={{ background: PIN_COLORS.found }} /> B: {secondLabel}</span>
        </p>
      )}
      <Suspense fallback={<Loading />}><BodyModel pins={pins} height={380} /></Suspense>
      <p className="hint">{t("b3_viewHelp")}</p>
    </div>
  );
}
