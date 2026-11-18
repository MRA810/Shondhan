import { useState } from "react";
import { Link } from "react-router-dom";
import { getQueue } from "../../api.js";
import { useApi } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { Band, Loaded, Photo, Score, StatusPill } from "../../components/ui.jsx";

export function QueueRow({ m, link = true }) {
  const { t, dateTime } = usePrefs();
  const Tag = link ? Link : "div";
  return (
    <Tag {...(link ? { to: `/officer/matches/${m.id}` } : {})} className={`panel card queuerow ${m.restricted ? "restrictedcard" : ""}`}>
      <div className="pair">
        <figure><Photo kind="case" id={m.case.photo_id} alt={t("photoAlt", { name: m.case.person_name })} /><figcaption>{t("side_family")}</figcaption></figure>
        <figure><Photo kind="record" id={m.record.photo_id} alt={t("foundPhoto")} /><figcaption>{t(`src_${m.record.source}`)}</figcaption></figure>
      </div>
      <div className="grow">
        <h3>{m.case.person_name}</h3>
        <p className="small">{m.record.found_place} · {t(`cond_${m.record.condition}`)}</p>
        <p className="small muted">{dateTime(m.created_at)}</p>
        <div className="row"><Band band={m.restricted ? "restricted" : m.band} /><StatusPill status={m.status} /></div>
      </div>
      <Score value={m.score} />
    </Tag>
  );
}

export default function OfficerQueue() {
  const { t, num } = usePrefs();
  const [status, setStatus] = useState("pending");
  const [kind, setKind] = useState("");
  const q = useApi(() => getQueue(status, kind), [status, kind]);
  const seg = (value, cur, setter, label) => (
    <button key={value} type="button" className={cur === value ? "seg on" : "seg"} aria-pressed={cur === value} onClick={() => setter(value)}>{t(label)}</button>
  );
  return (
    <>
      <div className="hero">
        <h1>{t("queueTitle")}</h1>
        <p className="muted">{t("queueLead")}</p>
      </div>
      {q.data && (
        <div className="stats four">
          <div className="panel stat"><b>{num(q.data.stats.pending)}</b><span>{t("st_pending")}</span></div>
          <div className="panel stat"><b>{num(q.data.stats.high)}</b><span>{t("band_high")}</span></div>
          <div className="panel stat"><b>{num(q.data.stats.restricted)}</b><span>{t("band_restricted")}</span></div>
          <div className="panel stat"><b>{num(q.data.stats.records)}</b><span>{t("stat_records")}</span></div>
        </div>
      )}
      <div className="filters">
        <div className="segs" role="group" aria-label={t("f_status")}>
          {[["pending", "st_pending"], ["confirmed", "st_confirmed"], ["rejected", "st_rejected"]].map(([v, l]) => seg(v, status, setStatus, l))}
        </div>
        <div className="segs" role="group" aria-label={t("f_kind")}>
          {[["", "all"], ["living", "living"], ["deceased", "band_restricted"]].map(([v, l]) => seg(v, kind, setKind, l))}
        </div>
      </div>
      <Loaded q={q}>{(d) => d.items.length === 0 ? <p className="panel empty muted">{t("queueEmpty")}</p> : (
        <div className="cards wide">{d.items.map((m) => <QueueRow key={m.id} m={m} />)}</div>
      )}</Loaded>
    </>
  );
}
