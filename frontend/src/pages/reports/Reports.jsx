import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getReport, getReports } from "../../api.js";
import { useApi } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { useSession } from "../../session.jsx";
import { BODY, DIVISIONS, MARK_TYPES } from "../../traits.js";
import PrintButton from "../../components/PrintSheet.jsx";
import { Icon, Loaded, PersonFacts, Photo, PhotoGrid, ageText } from "../../components/ui.jsx";
import { QueueRow } from "../officer/OfficerQueue.jsx";

const FILTERS = ["q", "gender", "division", "age_min", "age_max", "seen_from", "seen_to", "mark_type", "mark_region", "cannot_speak", "has_matches", "sort"];

// Every family report, for police stations (and case officers / admins). Filters live in the URL, so a search can be shared.
export function ReportList() {
  const { t, num, date } = usePrefs();
  const [params, setParams] = useSearchParams();
  const applied = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) || ""]));
  const [f, setF] = useState(applied);
  const q = useApi(() => getReports(applied), [params.toString()]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target.checked ? "1" : "") : e.target.value });
  const apply = (e) => { e.preventDefault(); setParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v))); };
  const clear = () => { setF(Object.fromEntries(FILTERS.map((k) => [k, ""]))); setParams({}); };
  const active = FILTERS.filter((k) => k !== "sort" && applied[k]).length;
  const sel = (k, label, opts, prefix, all = "all") => (
    <div>
      <label htmlFor={`f-${k}`}>{t(label)}</label>
      <select id={`f-${k}`} value={f[k]} onChange={set(k)}>
        <option value="">{t(all)}</option>
        {opts.map((o) => <option key={o} value={o}>{t(`${prefix}${o}`)}</option>)}
      </select>
    </div>
  );
  return (
    <>
      <div className="hero"><h1>{t("rp_listTitle")}</h1><p className="muted">{t("rp_listLead")}</p></div>
      <form className="panel" role="search" onSubmit={apply}>
        <div className="searchbar">
          <label htmlFor="f-q" className="sr">{t("search")}</label>
          <input id="f-q" value={f.q} onChange={set("q")} placeholder={t("rp_searchPh")} />
          <button className="primary inline"><Icon name="search" /> {t("search")}</button>
        </div>
        <details open={active > 0}>
          <summary className="filtersum">{t("rp_filters")}{active ? ` (${num(active)})` : ""}</summary>
          <div className="filtersgrid">
            {sel("gender", "c_gender", ["male", "female", "other"], "g_")}
            {sel("division", "division", DIVISIONS, "div_")}
            <div><label htmlFor="f-amin">{t("rp_ageFrom")}</label><input id="f-amin" inputMode="numeric" value={f.age_min} onChange={set("age_min")} /></div>
            <div><label htmlFor="f-amax">{t("rp_ageTo")}</label><input id="f-amax" inputMode="numeric" value={f.age_max} onChange={set("age_max")} /></div>
            <div><label htmlFor="f-sf">{t("rp_seenFrom")}</label><input id="f-sf" type="date" value={f.seen_from} onChange={set("seen_from")} /></div>
            <div><label htmlFor="f-st">{t("rp_seenTo")}</label><input id="f-st" type="date" value={f.seen_to} onChange={set("seen_to")} /></div>
            {sel("mark_type", "mkType", MARK_TYPES, "mark_")}
            {sel("mark_region", "mkRegion", Object.keys(BODY), "body_")}
            {sel("sort", "rp_sort", ["oldest", "last_seen"], "rp_sort_", "rp_sort_newest")}
          </div>
          <label className="check"><input type="checkbox" checked={!!f.cannot_speak} onChange={set("cannot_speak")} /> {t("cannotSpeak")}</label>
          <label className="check"><input type="checkbox" checked={!!f.has_matches} onChange={set("has_matches")} /> {t("rp_hasMatches")}</label>
          <div className="row mt">
            <button className="primary inline">{t("rp_apply")}</button>
            <button type="button" className="ghost" onClick={clear}>{t("rp_clear")}</button>
          </div>
        </details>
      </form>
      <Loaded q={q}>{(d) => (
        <>
          <p className="muted">{t("rp_total", { n: d.total })}{d.total > d.items.length ? ` · ${t("rp_shown", { n: d.items.length })}` : ""}</p>
          {d.items.length === 0 ? <p className="panel empty muted">{t("nothingFound")}</p> : (
            <div className="cards">
              {d.items.map((c) => (
                <Link key={c.id} to={`/reports/${c.id}`} className="card panel">
                  <div className="casehead">
                    <Photo kind="case" id={c.photo_id} alt={t("photoAlt", { name: c.person_name })} />
                    <div className="grow">
                      <h3>{c.person_name}</h3>
                      <p className="small muted">{[c.gender && t(`g_${c.gender}`), ageText(t, c)].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  {c.last_seen_place && <p className="small">{t("lastSeen", { place: c.last_seen_place })}{c.last_seen_at ? ` · ${date(c.last_seen_at)}` : ""}</p>}
                  <p className="small muted">{t("postedOn", { date: date(c.created_at) })} · {t("matchesCount", { n: c.match_count })}</p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}</Loaded>
    </>
  );
}

export function ReportView() {
  const { id } = useParams();
  const { t, dateTime } = usePrefs();
  const { user } = useSession();
  const q = useApi(() => getReport(id), [id]);
  const reviewer = ["officer", "admin"].includes(user.role);
  return (
    <Loaded q={q}>{(c) => (
      <>
        <Link className="link backlink" to="/reports">← {t("rp_listTitle")}</Link>
        <section className="panel">
          <div className="row between">
            <h1>{c.person_name}</h1>
            <PrintButton kind="case" data={c} label={t("printPoster")} contact={{ name: c.owner.full_name, phone: c.owner.phone, alt: c.owner.alt_phone }} />
          </div>
          <p className="muted small">{t("postedOn", { date: dateTime(c.created_at) })}</p>
          <PhotoGrid kind="case" photos={c.photos.filter((p) => p.kind === "photo")} alt={t("photoAlt", { name: c.person_name })} />
          <PersonFacts p={c} />
          {c.photos.some((p) => p.kind === "document") && <><h3>{t("idDocs")}</h3><PhotoGrid kind="case" photos={c.photos.filter((p) => p.kind === "document")} alt={t("idDocs")} small /></>}
        </section>
        <section className="panel">
          <h2>{t("familyContact")}</h2>
          <p><strong>{c.owner.full_name}</strong> · {t(`rel_${c.relationship}`)}</p>
          <p><a className="link" href={`tel:${c.owner.phone}`}><Icon name="phone" /> {c.owner.phone}</a>{c.owner.alt_phone && ` · ${c.owner.alt_phone}`}{c.owner.email && ` · ${c.owner.email}`}</p>
          {c.owner.address && <p className="muted">{c.owner.address}</p>}
        </section>
        <div className="sec"><h2>{t("matchesTitle")}</h2></div>
        {c.matches.length === 0 ? <p className="panel empty muted">{t("matchesNone")}</p> : (
          <div className="cards wide">{c.matches.map((m) => <QueueRow key={m.id} m={m} link={reviewer} />)}</div>
        )}
        {reviewer && (
          <section className="panel">
            <h2>{t("visitsTitle")}</h2>
            {c.views.length === 0 ? <p className="muted">{t("noVisits")}</p> : (
              <ul className="plain">{c.views.map((v, i) => <li key={i}>{v.who} · {t(`role_${v.role}`)} · {dateTime(v.at)}</li>)}</ul>
            )}
          </section>
        )}
      </>
    )}</Loaded>
  );
}
