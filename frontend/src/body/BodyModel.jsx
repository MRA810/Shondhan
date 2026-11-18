import { useEffect, useRef, useState } from "react";
import { usePrefs } from "../prefs.jsx";
import { mountBody } from "./body3d.js";

// pins: [{pos, color, label, n, big}]
export default function BodyModel({ pins = [], interactive = false, onPick, height = 440, label }) {
  const { t } = usePrefs();
  const box = useRef(null);
  const api = useRef(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [tip, setTip] = useState(null);

  useEffect(() => {
    api.current = mountBody(box.current, { interactive, onPick: (p) => pick.current?.(p), onHover: setTip });
    return () => { api.current.dispose(); api.current = null; };
  }, [interactive]);
  const key = JSON.stringify(pins.map((p) => [p.pos, p.color, p.big]));
  useEffect(() => { api.current?.setPins(pins); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const tipText = tip && (tip.pin ? tip.pin.label
    : [t(`body_${tip.region}`), tip.part ? t(`part_${tip.part}`) : ""].filter(Boolean).join(", "));
  return (
    <div className="body3d">
      <div className="body3d-stage" ref={box} style={{ height }} role="img" aria-label={label || t("b3_aria")}>
        {tipText && <div className="body3d-tip" style={{ left: tip.x + 14, top: tip.y + 10 }}>{tipText}</div>}
      </div>
      <div className="body3d-bar" role="group" aria-label={t("b3_views")}>
        {["front", "back", "left", "right"].map((v) => (
          <button key={v} type="button" className="seg" onClick={() => api.current?.view(v)}>{t(`b3_${v}`)}</button>
        ))}
        <button type="button" className="seg" aria-label={t("b3_zoomIn")} onClick={() => api.current?.zoom(0.75)}>＋</button>
        <button type="button" className="seg" aria-label={t("b3_zoomOut")} onClick={() => api.current?.zoom(1.33)}>－</button>
      </div>
    </div>
  );
}
