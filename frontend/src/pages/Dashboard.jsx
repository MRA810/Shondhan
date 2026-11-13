import { useState } from "react";
import { Link } from "react-router-dom";
import { closeCase, markRead } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import { useSession } from "../session.jsx";
import AuthImage from "./AuthImage.jsx";
import { NotificationText } from "./Notifications.jsx";

const DAY = 86400000;

// The eye-catching alert: shown while a match / officer alert is unread.
function MatchBanner({ alert, onSee }) {
  const { t, num } = usePrefs();
  const officer = alert.kind === "officer";
  return (
    <section className="banner" role="alert">
      <span className="bell" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0" />
        </svg>
      </span>
      <div className="grow">
        <h2>{t(officer ? "alertOfficerTitle" : "alertTitle")}</h2>
        <p>{officer ? t("alertOfficer", { name: alert.case_name }) : t("alertMatch", { name: alert.case_name, pct: num(alert.score) })}</p>
      </div>
      <a className="primary inline" href="#matches" onClick={onSee}>{t("alertSee")}</a>
    </section>
  );
}

function Stat({ value, label }) {
  const { num } = usePrefs();
  return <div className="stat panel"><b>{num(value)}</b><span>{label}</span></div>;
}

function CaseCard({ c, onClosed }) {
  const { t, num } = usePrefs();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const days = c.last_seen_at ? Math.max(0, Math.floor((Date.now() - new Date(c.last_seen_at)) / DAY)) : null;

  async function confirm() {
    setBusy(true); setErr("");
    try { await closeCase(c.id); onClosed(); } catch { setErr("network"); setBusy(false); }
  }

  return (
    <article className="card panel">
      <div className="casehead">
        {c.photo_id && <AuthImage caseId={c.id} photoId={c.photo_id} alt={t("photoAlt", { name: c.person_name })} />}
        <h3>{c.person_name}{c.person_age != null && <span className="muted"> · {t("ageYears", { n: num(c.person_age) })}</span>}</h3>
      </div>
      {c.last_seen_place && <p>{t("lastSeen", { place: c.last_seen_place })}{days != null && <span className="muted"> · {days === 0 ? t("today") : t("daysAgo", { n: num(days) })}</span>}</p>}
      <p>
        {c.match_count === 0 ? <span className="pill">{t("noMatchYet")}</span> : (
          <span className="pill hot">
            {t("matchesCount", { n: num(c.match_count) })}{c.best_score != null && ` · ${t("bestMatch", { pct: num(c.best_score) })}`}
          </span>
        )}
      </p>
      {!asking ? (
        <button className="ghost" onClick={() => setAsking(true)}>{t("foundBtn")}</button>
      ) : (
        <div className="confirm" role="alertdialog" aria-label={t("foundBtn")}>
          <p>{t("confirmFound")}</p>
          {err && <p className="error" role="alert">{t(err)}</p>}
          <div className="row">
            <button className="ghost danger" disabled={busy} onClick={confirm}>{busy ? t("loading") : t("yesDelete")}</button>
            <button className="ghost" disabled={busy} onClick={() => setAsking(false)}>{t("cancel")}</button>
          </div>
        </div>
      )}
    </article>
  );
}

function MatchCard({ m }) {
  const { t, num, date } = usePrefs();
  if (m.record_kind === "deceased") {
    return (
      <article className="card panel">
        <h3>{m.case_name}</h3>
        <p>{t("restricted")}</p>
      </article>
    );
  }
  return (
    <article className="card panel">
      <div className="row between">
        <h3>{m.case_name}</h3>
        <span className={"pill band-" + m.band}>{t("band_" + m.band)}</span>
      </div>
      <div className="pct">{num(m.score)}%</div>
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.score} aria-label={`${m.score}%`}>
        <span style={{ width: `${m.score}%` }} />
      </div>
      {m.found_place && <p>{t("foundAt", { place: m.found_place })}{m.found_area && <span className="muted"> · {m.found_area}</span>}</p>}
      {m.found_at && <p className="muted">{t("foundDate", { date: date(m.found_at) })}</p>}
      {m.verified && <p><span className="pill ok">✓ {t("verified")}</span></p>}
      {m.contact_phone && <a className="ghost" href={`tel:${m.contact_phone}`}>📞 {t("callNow")} {num(m.contact_phone)}</a>}
    </article>
  );
}

export default function Dashboard() {
  const { t, num } = usePrefs();
  const { user, summary, reload } = useSession();
  const { cases, matches, notifications, alert, stats } = summary;
  const profileIncomplete = !user.alt_phone || !user.division || !user.address;

  async function seeMatches() {
    try { await markRead(); reload(); } catch { /* the banner just stays until next load */ }
  }

  return (
    <>
      <section className="hero">
        <h1>{t("welcome")}, {user.full_name}</h1>
        <p className="muted">{t("dashLead")}</p>
      </section>

      {alert && <MatchBanner alert={alert} onSee={seeMatches} />}

      <section className="stats" aria-label={t("brand")}>
        <Stat value={stats.cases} label={t("stat_cases")} />
        <Stat value={stats.matches} label={t("stat_matches")} />
        <Stat value={stats.unread} label={t("stat_new")} />
      </section>

      <div className="sec">
        <h2>{t("myCases")}</h2>
        {cases.length > 0 && <Link className="ghost" to="/cases/new">＋ {t("addMore")}</Link>}
      </div>
      {cases.length === 0 ? (
        <div className="panel empty">
          <p className="big">{t("noCases")}</p>
          <p className="muted">{t("noCasesHelp")}</p>
          <Link className="primary inline" to="/cases/new">{t("reportBtn")}</Link>
        </div>
      ) : (
        <div className="cards">{cases.map((c) => <CaseCard key={c.id} c={c} onClosed={reload} />)}</div>
      )}

      <div className="sec" id="matches"><h2>{t("matchesTitle")}</h2></div>
      {matches.length === 0 ? (
        <div className="panel empty"><p>{t("matchesNone")}</p></div>
      ) : (
        <>
          <p className="note warn">{t("matchWarn")}</p>
          <div className="cards">{matches.map((m) => <MatchCard key={m.id} m={m} />)}</div>
        </>
      )}

      <div className="sec">
        <h2>{t("recent")}</h2>
        {notifications.length > 0 && <Link className="link" to="/notifications">{t("seeAll")}</Link>}
      </div>
      {notifications.length === 0 ? (
        <div className="panel empty"><p>{t("noNotif")}</p></div>
      ) : (
        <ul className="notifs panel">
          {notifications.map((n) => (
            <li key={n.id} className={n.is_read ? "" : "unread"}>
              <NotificationText n={n} />
            </li>
          ))}
        </ul>
      )}

      {profileIncomplete && (
        <aside className="panel nudge">
          <p>{t("profileNudge")}</p>
          <Link className="ghost" to="/profile">{t("profileNudgeBtn")}</Link>
        </aside>
      )}
    </>
  );
}
