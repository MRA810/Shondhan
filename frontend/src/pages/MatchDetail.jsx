import { Link, useParams } from "react-router-dom";
import { getMatch } from "../api.js";
import Score from "../components/Score.jsx";
import Shell from "../components/Shell.jsx";
import { useApi } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";
import { ageText } from "./CaseDetail.jsx";

export default function MatchDetail() {
  const { id } = useParams();
  const { t, lang } = usePrefs();
  const { data: m, error } = useApi(() => getMatch(id), [id]);
  const r = m?.record;
  const rows = r && [
    ["foundBy", t("src_" + r.source)], ["cond_" + r.condition, "✓"], ["gender", t("g_" + r.gender)],
    ["pAge", ageText(r, lang)], ["division", t("div_" + r.division)], ["foundAt", r.place],
    ["clothing", r.clothing], ["marks", r.body_marks], ["extraInfo", r.notes],
  ].filter(([, v]) => v);

  return (
    <Shell narrow>
      {error && <p className="error" role="alert">{t(error)}</p>}
      {m && (
        <section className="glass">
          <h2>{t("matchTitle")}</h2>
          <div className="scorehead">
            <Score value={m.score} big />
            <div>
              <strong>{t("matchScore")}: {m.person_name}</strong>
              <p className="note">{t("whyMatch")}</p>
              <p className="reasons">{m.reasons.map((k) => <span key={k} className="tag">{t("r_" + k)}</span>)}</p>
            </div>
          </div>
          {r.photo && <img className="bigphoto" src={r.photo} alt="" />}
          <dl className="facts">
            {rows.map(([k, v]) => <div key={k}><dt>{t(k)}</dt><dd>{v}</dd></div>)}
          </dl>
          {r.contact_phone && (
            <a className="primary linkbtn call" href={`tel:${r.contact_phone}`}>{t("callNow")}: {r.contact_phone}</a>
          )}
          <p className="note">{t("matchNote")}</p>
          <Link to={`/cases/${m.case_id}`} className="chip backlink">{t("backToCase")}</Link>
        </section>
      )}
    </Shell>
  );
}
