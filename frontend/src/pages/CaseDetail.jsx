import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { closeCase, getCase, getCaseMatches } from "../api.js";
import Score from "../components/Score.jsx";
import Shell from "../components/Shell.jsx";
import { fmtNum, useApi } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";

export const ageText = (r, lang) => {
  if (r.age_min == null) return "";
  return r.age_min === r.age_max ? fmtNum(r.age_min, lang) : `${fmtNum(r.age_min, lang)}–${fmtNum(r.age_max, lang)}`;
};

export default function CaseDetail() {
  const { id } = useParams();
  const { t, lang } = usePrefs();
  const nav = useNavigate();
  const c = useApi(() => getCase(id), [id]);
  const m = useApi(() => getCaseMatches(id), [id]);
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState("");

  async function found() {
    try { await closeCase(id); nav("/dashboard"); } catch { setErr("network"); }
  }
  const d = c.data;
  const rows = d && [
    ["pAge", d.age_approx && fmtNum(d.age_approx, lang)], ["gender", t("g_" + d.gender)],
    ["height", d.height_cm && fmtNum(d.height_cm, lang)], ["division", t("div_" + d.division)],
    ["lastSeenPlace", d.last_seen_place], ["lastSeenDate", d.last_seen_date && fmtNum(d.last_seen_date, lang)],
    ["clothing", d.clothing], ["marks", d.body_marks], ["desc", d.description],
    ["cannotSpeak", d.cannot_speak ? "✓" : ""],
  ].filter(([, v]) => v);

  return (
    <Shell>
      {(c.error || m.error) && <p className="error" role="alert">{t(c.error || m.error)}</p>}
      {d && (<>
        <section className="glass">
          <h2>{d.person_name}</h2>
          <ul className="photos">
            {d.photos.filter((p) => p.kind === "face").map((p) => <li key={p.id}><img src={p.url} alt="" /></li>)}
          </ul>
          <dl className="facts">
            {rows.map(([k, v]) => <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>)}
          </dl>
          {d.photos.some((p) => p.kind === "id") && (<>
            <h3>{t("idDocs")}</h3>
            <ul className="photos small">
              {d.photos.filter((p) => p.kind === "id").map((p) => <li key={p.id}><img src={p.url} alt="" /></li>)}
            </ul>
          </>)}
        </section>

        <section className="glass">
          <h2>{t("possibleMatches")}</h2>
          {m.data && m.data.length === 0 && <p className="note">{t("noMatches")}</p>}
          <ul className="cases">
            {(m.data || []).map((x) => (
              <li key={x.id}>
                <Link to={`/matches/${x.id}`} className="casecard">
                  {x.record.photo ? <img className="thumb" src={x.record.photo} alt="" /> : <div className="thumb" />}
                  <div className="caseinfo">
                    <strong>{t("src_" + x.record.source)}</strong>
                    <span>{t("div_" + x.record.division)}{ageText(x.record, lang) ? `, ${t("pAge")}: ${ageText(x.record, lang)}` : ""}</span>
                    {!x.seen && <span className="tag hot">{t("newN")}</span>}
                  </div>
                  <Score value={x.score} />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="glass danger">
          {!ask ? (
            <button className="primary" onClick={() => setAsk(true)}>{t("markFound")}</button>
          ) : (<>
            <p>{t("foundWarn")}</p>
            <div className="btnrow">
              <button className="chip" onClick={() => setAsk(false)}>{t("cancel")}</button>
              <button className="primary" onClick={found}>{t("confirmDelete")}</button>
            </div>
          </>)}
          {err && <p className="error" role="alert">{t(err)}</p>}
        </section>
      </>)}
    </Shell>
  );
}
