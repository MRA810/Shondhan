import { Link } from "react-router-dom";
import { getSummary, markRead } from "../../api.js";
import { useApi } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { useSession } from "../../session.jsx";
import { Icon, Loaded, Photo, SecTitle, ageText } from "../../components/ui.jsx";
import { NotifList } from "../Notifications.jsx";
import { MatchCard } from "./parts.jsx";

function Alert({ a, more }) {
  const { t } = usePrefs();
  const p = a.params || {};
  const title = { match: "alertTitle", verified: "alertVerifiedTitle", officer: "alertOfficerTitle" }[a.kind];
  const body = { match: "alertMatch", verified: "alertVerified", officer: "alertOfficer" }[a.kind];
  return (
    <section className="banner" role="alert">
      <div className="bell"><Icon name="bell" /></div>
      <div className="grow">
        <h2>{t(title)}</h2>
        <p>{t(body, { name: p.name, pct: p.pct, place: p.place })}</p>
        {more > 0 && <p className="small">{t("alertMore", { n: more })}</p>}
      </div>
      <Link className="primary inline" to={a.match_id ? `/matches/${a.match_id}` : "/notifications"}>{t("alertSee")}</Link>
    </section>
  );
}

export default function FamilyHome() {
  const { t, num, date } = usePrefs();
  const { user, refreshUnread } = useSession();
  const q = useApi(getSummary);
  return (
    <Loaded q={q}>{(d) => {
      const full = d.cases.length >= d.max_cases;
      return (
        <>
          <div className="hero">
            <h1>{t("hello", { name: user.full_name })}</h1>
            <p className="muted">{t("dashLead")}</p>
          </div>
          {d.alert && <Alert a={d.alert} more={d.unread_matches - 1} />}

          <div className="stats">
            <div className="panel stat"><b>{num(d.stats.cases)}</b><span>{t("stat_cases")}</span></div>
            <div className="panel stat"><b>{num(d.stats.matches)}</b><span>{t("stat_matches")}</span></div>
            <div className="panel stat"><b>{num(d.stats.unread)}</b><span>{t("stat_new")}</span></div>
          </div>

          <SecTitle title={t("myCases")} count={d.cases.length}>
            {d.cases.length > 0 && !full && <Link className="primary inline" to="/cases/new">+ {t("addMore")}</Link>}
          </SecTitle>
          {full && <p className="warn">{t("limit")}</p>}
          {d.cases.length === 0 ? (
            <div className="panel empty">
              <p className="big">{t("noCases")}</p>
              <p>{t("noCasesHelp")}</p>
              <Link className="primary inline" to="/cases/new">{t("reportBtn")}</Link>
            </div>
          ) : (
            <div className="cards">
              {d.cases.map((c) => (
                <Link key={c.id} to={`/cases/${c.id}`} className="card panel">
                  <div className="casehead">
                    <Photo kind="case" id={c.photo_id} alt={t("photoAlt", { name: c.person_name })} />
                    <div className="grow">
                      <h3>{c.person_name}</h3>
                      <p className="muted small">{[ageText(t, c), c.last_seen_place && t("lastSeen", { place: c.last_seen_place })].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <p>{c.match_count ? t("matchesCount", { n: c.match_count }) : t("noMatchYet")}
                    {c.best_score != null && <> · <strong>{t("bestMatch", { pct: c.best_score })}</strong></>}</p>
                  <p className="muted small">{t("postedOn", { date: date(c.created_at) })} · {t("officialViews", { n: c.official_views })}</p>
                </Link>
              ))}
            </div>
          )}

          <SecTitle title={t("matchesTitle")} count={d.matches.length} />
          {d.matches.length === 0 ? <p className="panel empty muted">{t("matchesNone")}</p> : (
            <>
              <p className="warn">{t("matchWarn")}</p>
              <div className="rowlist">{d.matches.map((m) => <MatchCard key={m.id} m={m} />)}</div>
            </>
          )}

          <SecTitle title={t("recent")}><Link className="link" to="/notifications">{t("seeAll")} →</Link></SecTitle>
          <div className="panel flush"><NotifList items={d.notifications} onOpen={(n) => !n.is_read && markRead([n.id]).then(refreshUnread)} /></div>

          {!d.profile_complete && (
            <div className="panel nudge">
              <p>{t("profileNudge")}</p>
              <Link className="ghost" to="/profile">{t("profileNudgeBtn")}</Link>
            </div>
          )}
        </>
      );
    }}</Loaded>
  );
}
