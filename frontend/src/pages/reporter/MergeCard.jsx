import { useState } from "react";
import { Link } from "react-router-dom";
import { decideMerge } from "../../api.js";
import { usePrefs } from "../../prefs.jsx";
import { Photo, Score, ageText, markText } from "../../components/ui.jsx";

// "Police and hospital may have posted the same person": both sides must agree before merging.
export default function MergeCard({ mr, onDone }) {
  const { t, dateTime } = usePrefs();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const o = mr.other;
  const decide = async (approve) => {
    setBusy(true); setErr("");
    try { await decideMerge(mr.id, approve); onDone(); } catch { setErr("network"); setBusy(false); }
  };
  return (
    <div className="panel card mergecard">
      <div className="casehead">
        <Photo kind="record" id={o.photo_id} alt={t("foundPhoto")} />
        <div className="grow">
          <h3>{t("mergeTitle")}</h3>
          <p className="small">{t("mergeWith", { org: o.organization || o.found_place, place: o.found_place })}</p>
        </div>
        <Score value={mr.score} />
      </div>
      <p className="small">{t(`src_${o.source}`)} · {t(`cond_${o.condition}`)} · {[o.gender !== "unknown" && t(`g_${o.gender}`), ageText(t, o)].filter(Boolean).join(", ")}</p>
      <p className="small muted">{dateTime(o.found_at)}{o.marks?.length ? ` · ${o.marks.map((m) => markText(t, m)).join("; ")}` : ""}</p>
      <ul className="chips">{mr.reasons.map((r) => <li key={r} className="pill">{t(`r_${r}`)}</li>)}</ul>
      <p className="small">{t("yourRecord")}: <Link className="link" to={`/records/${mr.mine}`}>#{mr.mine}</Link> · {mr.their_ok ? t("theyAgreed") : t("theyWaiting")}</p>
      {mr.my_ok ? <p className="success">{t("youAgreed")}</p> : (
        <div className="row">
          <button className="primary inline" disabled={busy} onClick={() => decide(true)}>{t("mergeYes")}</button>
          <button className="ghost" disabled={busy} onClick={() => decide(false)}>{t("mergeNo")}</button>
        </div>
      )}
      {err && <p className="error" role="alert">{t(err)}</p>}
    </div>
  );
}
