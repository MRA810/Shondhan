import { Link } from "react-router-dom";
import { notifications, readAll } from "../api.js";
import Score from "../components/Score.jsx";
import Shell from "../components/Shell.jsx";
import { useApi } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";

export default function Notifications() {
  const { t, lang } = usePrefs();
  const { data, error, reload } = useApi(notifications);
  const fmt = (s) => new Date(s).toLocaleString(lang === "bn" ? "bn-BD" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  return (
    <Shell narrow>
      <section className="glass">
        <div className="rowhead">
          <h2>{t("alerts")}</h2>
          {data?.some((n) => !n.read) && (
            <button className="chip" onClick={() => readAll().then(reload).catch(() => {})}>{t("markAllRead")}</button>
          )}
        </div>
        {error && <p className="error" role="alert">{t(error)}</p>}
        {data && data.length === 0 && <p className="note">{t("noAlerts")}</p>}
        <ul className="cases">
          {(data || []).map((n) => (
            <li key={n.id}>
              <Link to={`/matches/${n.match_id}`} className={n.read ? "casecard" : "casecard unread"}>
                <div className="caseinfo">
                  <strong>{t("n_match")} {n.person_name}</strong>
                  <span>{fmt(n.created_at)}</span>
                </div>
                <Score value={n.score} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </Shell>
  );
}
