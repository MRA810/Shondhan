import { Link } from "react-router-dom";
import { dashboard, me } from "../api.js";
import Score from "../components/Score.jsx";
import Shell from "../components/Shell.jsx";
import { fmtNum, useApi } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";

export default function Dashboard() {
  const { t, lang } = usePrefs();
  const user = useApi(me).data;
  const { data, error, loading } = useApi(dashboard);
  const top = data?.top_matches?.[0];

  return (
    <Shell>
      <h2 className="greet">{t("welcome")}{user ? `, ${user.full_name}` : ""}</h2>
      {error && <p className="error" role="alert">{t(error)}</p>}
      {loading && !data && <p className="note">{t("loading")}</p>}

      {top && (
        <Link className="alert" role="status"
              to={data.new_matches > 1 ? "/notifications" : `/matches/${top.match_id}`}>
          <Score value={top.score} big />
          <div className="alert-text">
            <h2>{t("alertTitle")}</h2>
            <p>{fmtNum(data.new_matches, lang)} {t("alertCount")}: {top.person_name}</p>
          </div>
          <span className="alert-cta">{t("alertCta")}</span>
        </Link>
      )}

      {data && (
        <section className="glass">
          <div className="rowhead">
            <h2>{t("myCases")}</h2>
            <Link className="primary linkbtn" to="/report">{t("reportBtn")}</Link>
          </div>
          {data.cases.length === 0 ? (
            <div className="empty">
              <p>{t("noCases")}</p>
              <p className="note">{t("noCasesHint")}</p>
            </div>
          ) : (
            <ul className="cases">
              {data.cases.map((c) => (
                <li key={c.id}>
                  <Link to={`/cases/${c.id}`} className="casecard">
                    {c.photo ? <img className="thumb" src={c.photo} alt="" /> : <div className="thumb" />}
                    <div className="caseinfo">
                      <strong>{c.person_name}</strong>
                      <span>{t("div_" + c.division)}{c.age_approx ? `, ${t("pAge")}: ${fmtNum(c.age_approx, lang)}` : ""}</span>
                      <span className={c.new_total ? "tag hot" : "tag"}>
                        {c.new_total
                          ? `${fmtNum(c.new_total, lang)} ${t("newN")}`
                          : `${t("matchesLabel")}: ${fmtNum(c.match_total, lang)}`}
                      </span>
                    </div>
                    {c.best ? <Score value={c.best} /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Shell>
  );
}
