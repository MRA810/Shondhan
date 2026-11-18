import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getPhoto } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import { PIN_COLORS, hasWebGL } from "../body/bodyMap.js";
import { Icon, ageText, clothText, markText, traitsText } from "./ui.jsx";

/*
 * A4 sheet for printing (or "Save as PDF" in the print dialog).
 * kind "case":   the family's missing-person poster. No ID pictures or ID numbers: posters are public.
 * kind "record": a police / hospital information sheet about a person found (internal document).
 */
function Sheet({ kind, data, contact, onReady }) {
  const { t, num, date, dateTime, lang } = usePrefs();
  const [photos, setPhotos] = useState(null);
  const [figures, setFigures] = useState([]);
  const isCase = kind === "case";
  const restricted = !isCase && data.condition === "deceased";
  const ids = data.photos ? data.photos.filter((p) => p.kind === "photo").map((p) => p.id) : data.photo_ids || [];
  const marks = data.marks || [];

  useEffect(() => {
    let live = true;
    const pics = Promise.all(ids.slice(0, 4).map((id) => getPhoto(isCase ? "case" : "record", id).catch(() => null)));
    const pinned = marks.map((m, i) => (m.pos ? { pos: m.pos, color: PIN_COLORS.family, n: i + 1 } : null)).filter(Boolean);
    const figs = pinned.length && hasWebGL()
      ? import("../body/body3d.js").then((b) => b.snapshotViews(pinned)).catch(() => []) : Promise.resolve([]);
    Promise.all([pics, figs]).then(([p, f]) => { if (live) { setPhotos(p.filter(Boolean)); setFigures(f); } });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (photos === null) return undefined;
    // wait until every picture on the sheet has finished loading
    const imgs = [...document.querySelectorAll(".printsheet img")];
    let left = imgs.filter((i) => !i.complete).length;
    if (!left) { onReady(); return undefined; }
    const done = () => { left -= 1; if (left <= 0) onReady(); };
    imgs.forEach((i) => { if (!i.complete) { i.addEventListener("load", done, { once: true }); i.addEventListener("error", done, { once: true }); } });
    return undefined;
  }, [photos]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = [];
  const add = (k, v) => v && rows.push([k, v]);
  add("gender", data.gender ? t(`g_${data.gender}`) : "");
  add("age", ageText(t, data));
  add("height", data.height_cm ? t("cm", { n: data.height_cm }) : "");
  add("looks", traitsText(t, data.traits).join(", "));
  add("clothing", (data.clothing || []).map((c) => clothText(t, c)).join(", "));
  add("belongings", data.belongings);
  add("cannotSpeak", data.cannot_speak ? t("yes") : "");
  if (isCase) {
    add("lastSeenPlace", data.last_seen_place);
    add("lastSeenDate", data.last_seen_at ? dateTime(data.last_seen_at) : "");
    add("division", data.division ? t(`div_${data.division}`) : "");
  } else {
    add("nameHint", data.name_hint);
    add("condition", data.condition ? t(`cond_${data.condition}`) : "");
    add("idDoc", data.id_type && data.id_type !== "none" ? `${t(`id_${data.id_type}`)}${data.id_number ? `: ${data.id_number}` : ""}` : "");
    add("medicalNotes", data.medical_notes);
  }
  add("notes", data.notes);
  const ref = `SH-${isCase ? "C" : "R"}-${String(data.id).padStart(5, "0")}`;

  return (
    <article className={`printsheet ${restricted ? "confidential" : ""}`} lang={document.documentElement.lang}>
      <header className="ps-head">
        <div className="ps-brand">{t("brand")}{lang === "bn" && <span> · Shondhan</span>}</div>
        <div className="ps-ref">{t("pr_ref")}: <b>{ref}</b></div>
      </header>
      {restricted && <p className="ps-conf">{t("pr_confidential")}</p>}
      <h1 className="ps-title">{isCase ? <>{t("pr_missing")}{lang === "bn" && <span> · MISSING</span>}</> : t("pr_found")}</h1>

      <section className="ps-main">
        {photos?.[0] ? <img className="ps-photo" src={photos[0]} alt="" /> : <div className="ps-photo ps-nophoto" />}
        <div className="ps-info">
          <h2 className="ps-name">{isCase ? data.person_name : data.name_hint || t("unknownPerson")}</h2>
          <table className="ps-table"><tbody>
            {rows.map(([k, v]) => <tr key={k}><th>{t(`f_${k}`)}</th><td>{v}</td></tr>)}
          </tbody></table>
        </div>
      </section>
      {photos?.length > 1 && <div className="ps-thumbs">{photos.slice(1).map((u, i) => <img key={i} src={u} alt="" />)}</div>}

      {marks.length > 0 && (
        <section className="ps-marks">
          <h3>{t("f_marks")}</h3>
          <div className={`ps-markgrid figs${figures.length}`}>
            {figures.map((f) => (
              <figure key={f.name}><img src={f.url} alt="" /><figcaption>{t(`pr_${f.name}`)}</figcaption></figure>
            ))}
            <ol>{marks.map((m, i) => <li key={i} value={i + 1}>{markText(t, m)}</li>)}</ol>
          </div>
        </section>
      )}

      <section className="ps-contact">
        {isCase ? (
          <>
            <p className="ps-ask">{t("pr_seen")}</p>
            <p className="ps-phone"><Icon name="phone" /> {contact.phone}{contact.alt ? ` / ${contact.alt}` : ""}</p>
            <p>{contact.name}{data.relationship ? ` (${t(`rel_${data.relationship}`)})` : ""}</p>
            <p className="ps-small">{t("pr_emergency")}</p>
          </>
        ) : (
          <>
            <p className="ps-ask">{t("pr_whereNow")}</p>
            <p className="ps-big">{data.found_place}{data.found_area ? `, ${data.found_area}` : ""}{data.division ? ` · ${t(`div_${data.division}`)}` : ""}</p>
            <p>{t(data.source === "medical" ? "f_admittedAt" : "f_foundAt")}: {dateTime(data.found_at)}</p>
            <p className="ps-phone"><Icon name="phone" /> {data.contact_phone}</p>
            <p>{data.contact_name}{data.organization ? ` · ${data.organization}` : ""}</p>
          </>
        )}
      </section>

      <footer className="ps-foot">
        <span>{t("pr_printed", { date: date(new Date().toISOString()) })}</span>
        <span>{isCase ? t("pr_noId") : t("pr_matchNote")}</span>
        <span>{num(1)}/{num(1)}</span>
      </footer>
    </article>
  );
}

export default function PrintButton({ kind, data, contact = {}, label }) {
  const { t } = usePrefs();
  const [run, setRun] = useState(0); // each click builds a fresh sheet
  const [busy, setBusy] = useState(false);
  // The sheet stays mounted (it is invisible on screen) so phones that print after print() returns still have it.
  const ready = () => setTimeout(() => { window.print(); setBusy(false); }, 150);
  return (
    <>
      <button type="button" className="ghost" onClick={() => { setBusy(true); setRun(run + 1); }} disabled={busy} title={t("printHint")}>
        🖨 {busy ? t("pr_preparing") : label || t("print")}
      </button>
      {run > 0 && createPortal(<Sheet key={run} kind={kind} data={data} contact={contact} onReady={ready} />, document.body)}
    </>
  );
}
