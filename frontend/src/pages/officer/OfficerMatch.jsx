import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getOfficerMatch, reunite, reviewMatch } from "../../api.js";
import { useApi } from "../../hooks.js";
import MarksFigure from "../../body/MarksFigure.jsx";
import { usePrefs } from "../../prefs.jsx";
import { Band, Confirm, Icon, Loaded, Photo, PhotoGrid, Score, StatusPill, ageText, clothText, markText, traitsText } from "../../components/ui.jsx";

function Compare({ c, r, reasons }) {
  const { t, dateTime } = usePrefs();
  const rows = [
    ["gender", "gender", t(`g_${c.gender}`), t(`g_${r.gender}`)],
    ["age", "age", ageText(t, c), ageText(t, r)],
    ["height", "height", c.height_cm ? t("cm", { n: c.height_cm }) : "", r.height_cm ? t("cm", { n: r.height_cm }) : ""],
    ["division", "division", c.division ? t(`div_${c.division}`) : "", t(`div_${r.division}`)],
    ["looks", "looks", traitsText(t, c.traits).join(", "), traitsText(t, r.traits).join(", ")],
    ["clothing", "clothing", [...c.clothing.map((x) => clothText(t, x)), c.belongings].filter(Boolean).join(", "),
      [...r.clothing.map((x) => clothText(t, x)), r.belongings].filter(Boolean).join(", ")],
    ["marks", "marks", c.marks.map((m) => markText(t, m)).join("; "), r.marks.map((m) => markText(t, m)).join("; ")],
    ["idDoc", "id", c.id_number ? `${t(`id_${c.id_type || "other"}`)} ${c.id_number}` : "", r.id_number ? `${t(`id_${r.id_type || "other"}`)} ${r.id_number}` : ""],
    ["name", "name", c.person_name, r.name_hint],
    ["when", "", c.last_seen_at ? `${t("lastSeenShort")} ${dateTime(c.last_seen_at)}` : "", `${t("foundShort")} ${dateTime(r.found_at)}`],
    ["where", "", c.last_seen_place, `${r.found_place}${r.found_area ? `, ${r.found_area}` : ""}`],
    ["speech", "mute", c.cannot_speak ? t("cannotSpeak") : "", t(`cond_${r.condition}`)],
  ];
  return (
    <div className="tablewrap">
      <table className="compare">
        <thead><tr><th scope="col">{t("trait")}</th><th scope="col">{t("side_family")}</th><th scope="col">{t("side_found")}</th></tr></thead>
        <tbody>
          {rows.filter(([, , a, b]) => a || b).map(([k, reason, a, b]) => (
            <tr key={k} className={reason && reasons.includes(reason) ? "hit" : ""}>
              <th scope="row">{t(`f_${k}`)}{reason && reasons.includes(reason) && <span className="sr"> ({t("matched")})</span>}</th>
              <td>{a || "—"}</td><td>{b || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OfficerMatch() {
  const { id } = useParams();
  const { t, dateTime } = usePrefs();
  const nav = useNavigate();
  const q = useApi(() => getOfficerMatch(id), [id]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState("");
  const decide = async (decision) => {
    setBusy(true); setErr("");
    try { await reviewMatch(id, decision, note); await q.reload(); } catch { setErr("network"); }
    setBusy(false);
  };
  const doReunite = async () => {
    setBusy(true);
    try { await reunite(id); nav("/officer", { replace: true }); } catch { setErr("network"); setBusy(false); }
  };
  return (
    <Loaded q={q}>{(m) => {
      const c = m.case, r = m.record, o = c.owner;
      const cPhotos = c.photos.filter((p) => p.kind === "photo"), rPhotos = r.photos.filter((p) => p.kind === "photo");
      return (
        <>
          <Link className="link backlink" to="/officer">← {t("nav_queue")}</Link>
          <section className="panel">
            <div className="scorehead">
              <Score value={m.score} big />
              <div>
                <h1>{t("reviewTitle", { name: c.person_name })}</h1>
                <div className="row"><Band band={m.band} />{m.restricted && <Band band="restricted" />}<StatusPill status={m.status} /></div>
                {m.reviewed_by && <p className="small muted">{t("reviewedBy", { who: m.reviewed_by, at: dateTime(m.reviewed_at) })}{m.review_note ? `: ${m.review_note}` : ""}</p>}
              </div>
            </div>
            {m.restricted && <p className="warn">{t("officerRestricted")}</p>}
            <ul className="chips">{m.reasons.map((x) => <li key={x} className="pill hot">{t(`r_${x}`)}</li>)}</ul>
          </section>

          <section className="panel facepanel">
            <h2>{t("faceTitle")}</h2>
            {m.face_score != null && m.face_pair ? (
              <>
                <div className="facepair">
                  <Photo kind="case" id={m.face_pair[0]} alt={t("photoAlt", { name: c.person_name })} className="gridphoto" />
                  <strong className="facepct">{t("faceScore", { n: m.face_score })}</strong>
                  <Photo kind="record" id={m.face_pair[1]} alt={t("foundPhoto")} className="gridphoto" />
                </div>
                <p className="small muted">{t("faceHelp")}</p>
              </>
            ) : <p className="small muted">{t("faceNone")}</p>}
          </section>

          <div className="sidebyside">
            <section className="panel">
              <h2>{t("side_family")}</h2>
              <PhotoGrid kind="case" photos={cPhotos} alt={t("photoAlt", { name: c.person_name })} small highlight={m.face_pair} />
              <p><strong>{o.full_name}</strong> · {t(`rel_${c.relationship}`)}</p>
              <p><a className="link" href={`tel:${o.phone}`}><Icon name="phone" /> {o.phone}</a>{o.alt_phone && <> · <a className="link" href={`tel:${o.alt_phone}`}>{o.alt_phone}</a></>}</p>
              {o.address && <p className="small muted">{o.address}</p>}
              <Link className="link small" to={`/reports/${c.id}`}>{t("openCase")}</Link>
            </section>
            <section className="panel">
              <h2>{t("side_found")}</h2>
              <PhotoGrid kind="record" photos={rPhotos} alt={t("foundPhoto")} small highlight={m.face_pair} />
              <p><strong>{r.organization || r.found_place}</strong> · {t(`src_${r.source}`)}</p>
              <p><a className="link" href={`tel:${r.contact_phone}`}><Icon name="phone" /> {r.contact_phone}</a> {r.contact_name}</p>
              {r.medical_notes && <p className="small">{t("f_medicalNotes")}: {r.medical_notes}</p>}
              <Link className="link small" to={`/officer/records/${r.id}`}>{t("openRecord")}</Link>
            </section>
          </div>

          <section className="panel">
            <h2>{t("compareTitle")}</h2>
            <Compare c={c} r={r} reasons={m.reasons} />
            <MarksFigure marks={c.marks} second={r.marks} firstLabel={t("side_family")} secondLabel={t("side_found")} />
          </section>

          <section className="panel">
            <h2>{t("decisionTitle")}</h2>
            <p className="muted">{t("decisionHelp")}</p>
            {m.status === "pending" ? (
              <>
                <label htmlFor="note">{t("reviewNote")}</label>
                <textarea id="note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="row mt">
                  <button className="primary inline" disabled={busy} onClick={() => decide("confirm")}><Icon name="check" /> {t("confirmMatch")}</button>
                  <button className="ghost danger" disabled={busy} onClick={() => decide("reject")}>{t("rejectMatch")}</button>
                </div>
              </>
            ) : m.status === "confirmed" ? (
              <>
                <p>{t("confirmedNext")}</p>
                {!ask ? <button className="primary inline" onClick={() => setAsk(true)}>{t("reunite")}</button> : (
                  <Confirm text={t("confirmReunite")} yes={t("reuniteYes")} onYes={doReunite} onNo={() => setAsk(false)} busy={busy} />
                )}
              </>
            ) : <p>{t("rejectedInfo")}</p>}
            {err && <p className="error" role="alert">{t(err)}</p>}
          </section>

          <section className="panel">
            <h2>{t("visitsTitle")}</h2>
            {m.record_views.length === 0 ? <p className="muted">{t("noVisits")}</p> : (
              <ul className="plain">{m.record_views.map((v, i) => <li key={i}>{v.who} · {t(`role_${v.role}`)} · {dateTime(v.at)}</li>)}</ul>
            )}
          </section>
        </>
      );
    }}</Loaded>
  );
}
