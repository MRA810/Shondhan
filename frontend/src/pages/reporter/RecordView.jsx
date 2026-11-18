import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { closeRecord, deleteRecordPhoto, getRecord } from "../../api.js";
import { useApi } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { Confirm, Loaded, PersonFacts, Photo } from "../../components/ui.jsx";
import MergeCard from "./MergeCard.jsx";
import PrintButton from "../../components/PrintSheet.jsx";

export function RecordDetails({ r, onDeletePhoto }) {
  const { t, dateTime } = usePrefs();
  const photos = r.photos.filter((p) => p.kind === "photo");
  const docs = r.photos.filter((p) => p.kind === "document");
  const grid = (list, alt) => (
    <ul className="photos">
      {list.map((p) => (
        <li key={p.id} className="rel">
          <Photo kind="record" id={p.id} alt={alt} className="gridphoto" />
          {onDeletePhoto && <button type="button" className="x" aria-label={t("remove")} onClick={() => onDeletePhoto(p.id)}>×</button>}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <section className="panel">
        <h2>{t(`cond_${r.condition}`)}</h2>
        {r.condition === "deceased" && <p className="warn">{t("deceasedNote")}</p>}
        {grid(photos, t("foundPhoto"))}
        <PersonFacts p={r} />
        {r.name_hint && <p>{t("f_nameHint")}: <strong>{r.name_hint}</strong></p>}
        {docs.length > 0 && <><h3>{t("idDocs")}</h3>{grid(docs, t("idDocs"))}</>}
      </section>
      <section className="panel">
        <h2>{t("whereNow")}</h2>
        <p><strong>{r.found_place}</strong>{r.found_area ? `, ${r.found_area}` : ""} · {t(`div_${r.division}`)}</p>
        <p>{t("foundDate", { date: dateTime(r.found_at) })}</p>
        <p>{t("contact")}: {r.contact_name} {r.contact_phone}</p>
        <p className="muted small">{t(`src_${r.source}`)} · {r.organization} · {r.reporter_name}</p>
      </section>
    </>
  );
}

export default function RecordView() {
  const { id } = useParams();
  const { t, num } = usePrefs();
  const nav = useNavigate();
  const q = useApi(() => getRecord(id), [id]);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const close = async () => {
    setBusy(true);
    try { await closeRecord(id); nav("/reporter", { replace: true }); } catch { setErr("network"); setBusy(false); }
  };
  const delPhoto = async (pid) => {
    setErr("");
    try { await deleteRecordPhoto(id, pid); q.reload(); } catch (x) { setErr(x.code === "last_photo" ? "e_lastPhoto" : "network"); }
  };
  return (
    <Loaded q={q}>{(r) => (
      <>
        <Link className="link backlink" to="/reporter">← {t("backHome")}</Link>
        <div className="row between">
          <h1>{r.name_hint || t("unknownPerson")} <span className="muted">#{num(r.id)}</span></h1>
          <div className="row">
            <PrintButton kind="record" data={r} />
            <Link className="ghost" to={`/records/${r.id}/edit`}>{t("edit")}</Link>
          </div>
        </div>
        <p className="muted">{t("matchesCount", { n: r.match_count })} · {t("familyViews", { n: r.family_views })}</p>
        {err && <p className="error" role="alert">{t(err)}</p>}
        {r.merges.length > 0 && <div className="cards">{r.merges.map((m) => <MergeCard key={m.id} mr={m} onDone={q.reload} />)}</div>}
        <RecordDetails r={r} onDeletePhoto={delPhoto} />
        <section className="panel danger">
          <h2>{t("closeRecordQ")}</h2>
          <p>{t("closeRecordHelp")}</p>
          {!ask ? <button className="ghost danger" onClick={() => setAsk(true)}>{t("closeRecord")}</button> : (
            <Confirm text={t("confirmCloseRecord")} yes={t("yesDelete")} onYes={close} onNo={() => setAsk(false)} busy={busy} />
          )}
        </section>
      </>
    )}</Loaded>
  );
}
