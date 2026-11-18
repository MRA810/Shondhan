import { Link } from "react-router-dom";
import { getReporterSummary, markRead } from "../../api.js";
import { useApi } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { useSession } from "../../session.jsx";
import { Loaded, Photo, SecTitle, ageText } from "../../components/ui.jsx";
import { NotifList } from "../Notifications.jsx";
import MergeCard from "./MergeCard.jsx";

export function RecordCard({ r, to }) {
  const { t, date, num } = usePrefs();
  return (
    <Link to={to} className={`card panel ${r.condition === "deceased" ? "restrictedcard" : ""}`}>
      <div className="casehead">
        <Photo kind="record" id={r.photo_id} alt={t("foundPhoto")} />
        <div className="grow">
          <h3>{r.name_hint || t("unknownPerson")} <span className="muted small">#{num(r.id)}</span></h3>
          <p className="small">{t(`cond_${r.condition}`)} · {[r.gender !== "unknown" && t(`g_${r.gender}`), ageText(t, r)].filter(Boolean).join(", ")}</p>
        </div>
      </div>
      <p className="small">{r.found_place}{r.found_area ? `, ${r.found_area}` : ""} · {date(r.found_at)}</p>
      <p className="small muted">{t("matchesCount", { n: r.match_count })} · {t("familyViews", { n: r.family_views })}{r.merged_count ? ` · ${t("mergedN", { n: r.merged_count })}` : ""}</p>
    </Link>
  );
}

export default function ReporterHome() {
  const { t, num } = usePrefs();
  const { user, refreshUnread } = useSession();
  const q = useApi(getReporterSummary);
  return (
    <Loaded q={q}>{(d) => (
      <>
        <div className="hero row between">
          <div>
            <h1>{user.organization || t("hello", { name: user.full_name })}</h1>
            <p className="muted">{t(user.role === "police" ? "policeLead" : "medicalLead")}</p>
          </div>
          <Link className="primary inline" to="/records/new">+ {t("nav_newRecord")}</Link>
        </div>
        <div className="stats four">
          <div className="panel stat"><b>{num(d.stats.records)}</b><span>{t("stat_records")}</span></div>
          <div className="panel stat"><b>{num(d.stats.matches)}</b><span>{t("stat_familyMatches")}</span></div>
          <div className="panel stat"><b>{num(d.stats.merges)}</b><span>{t("stat_merges")}</span></div>
          <div className="panel stat"><b>{num(d.stats.unread)}</b><span>{t("stat_new")}</span></div>
        </div>

        {d.merges.length > 0 && (
          <>
            <SecTitle title={t("mergesTitle")} count={d.merges.length} />
            <p className="muted">{t("mergesHelp")}</p>
            <div className="cards">{d.merges.map((m) => <MergeCard key={m.id} mr={m} onDone={q.reload} />)}</div>
          </>
        )}

        <SecTitle title={t("myRecords")} count={d.records.length} />
        {d.records.length === 0 ? (
          <div className="panel empty">
            <p className="big">{t("noRecords")}</p>
            <p>{t("noRecordsHelp")}</p>
            <Link className="primary inline" to="/records/new">{t("nav_newRecord")}</Link>
          </div>
        ) : (
          <div className="cards">{d.records.map((r) => <RecordCard key={r.id} r={r} to={`/records/${r.id}`} />)}</div>
        )}

        <SecTitle title={t("recent")}><Link className="link" to="/notifications">{t("seeAll")} →</Link></SecTitle>
        <div className="panel flush"><NotifList items={d.notifications} onOpen={(n) => !n.is_read && markRead([n.id]).then(refreshUnread)} /></div>
      </>
    )}</Loaded>
  );
}
