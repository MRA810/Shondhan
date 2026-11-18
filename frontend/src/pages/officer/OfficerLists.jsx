import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOfficerRecord, getOfficerRecords } from "../../api.js";
import { useApi } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { CONDITIONS } from "../../traits.js";
import { Icon, Loaded, PersonFacts, Photo, PhotoGrid, ageText } from "../../components/ui.jsx";
import { RecordCard } from "../reporter/ReporterHome.jsx";
import { RecordDetails } from "../reporter/RecordView.jsx";
import { QueueRow } from "./OfficerQueue.jsx";
import PrintButton from "../../components/PrintSheet.jsx";

function Search({ value, onSubmit, children }) {
  const { t } = usePrefs();
  const [v, setV] = useState(value);
  return (
    <form className="searchbar" role="search" onSubmit={(e) => { e.preventDefault(); onSubmit(v); }}>
      <label htmlFor="q" className="sr">{t("search")}</label>
      <input id="q" value={v} onChange={(e) => setV(e.target.value)} placeholder={t("searchPh")} />
      {children}
      <button className="primary inline"><Icon name="search" /> {t("search")}</button>
    </form>
  );
}

function Visits({ views }) {
  const { t, dateTime } = usePrefs();
  return (
    <section className="panel">
      <h2>{t("visitsTitle")}</h2>
      {views.length === 0 ? <p className="muted">{t("noVisits")}</p> : (
        <ul className="plain">{views.map((v, i) => <li key={i}>{v.who} · {t(`role_${v.role}`)} · {dateTime(v.at)}</li>)}</ul>
      )}
    </section>
  );
}

export function OfficerRecordList() {
  const { t } = usePrefs();
  const [query, setQuery] = useState("");
  const [cond, setCond] = useState("");
  const q = useApi(() => getOfficerRecords(query, cond), [query, cond]);
  return (
    <>
      <h1 className="hero">{t("allRecords")}</h1>
      <Search value={query} onSubmit={setQuery}>
        <label htmlFor="cond" className="sr">{t("sec_condition")}</label>
        <select id="cond" value={cond} onChange={(e) => setCond(e.target.value)}>
          <option value="">{t("allConditions")}</option>
          {CONDITIONS.map((c) => <option key={c} value={c}>{t(`cond_${c}`)}</option>)}
        </select>
      </Search>
      <Loaded q={q}>{(items) => items.length === 0 ? <p className="panel empty muted">{t("nothingFound")}</p> : (
        <div className="cards">{items.map((r) => <RecordCard key={r.id} r={r} to={`/officer/records/${r.id}`} />)}</div>
      )}</Loaded>
    </>
  );
}

export function OfficerRecordView() {
  const { id } = useParams();
  const { t, num } = usePrefs();
  const q = useApi(() => getOfficerRecord(id), [id]);
  return (
    <Loaded q={q}>{(r) => (
      <>
        <Link className="link backlink" to="/officer/records">← {t("allRecords")}</Link>
        <div className="row between">
          <h1>{r.name_hint || t("unknownPerson")} <span className="muted">#{num(r.id)}</span></h1>
          <PrintButton kind="record" data={r} />
        </div>
        <RecordDetails r={r} />
        <div className="sec"><h2>{t("matchesTitle")}</h2></div>
        {r.matches.length === 0 ? <p className="panel empty muted">{t("matchesNone")}</p> : (
          <div className="cards wide">{r.matches.map((m) => <QueueRow key={m.id} m={m} />)}</div>
        )}
        <Visits views={r.views} />
      </>
    )}</Loaded>
  );
}
