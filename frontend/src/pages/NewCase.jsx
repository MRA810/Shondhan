import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCase } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import { useSession } from "../session.jsx";

const RELS = ["parent", "spouse", "child", "sibling", "relative", "friend", "other"];
const GENDERS = ["male", "female", "other"];
const MARKS = ["none", "scar", "tattoo", "birthmark", "other"];
const MAX_PHOTOS = 8, MAX_DOCS = 4, MAX_MB = 5;
const BN = "০১২৩৪৫৬৭৮৯";
const norm = (s) => s.replace(/[০-৯]/g, (d) => BN.indexOf(d));

// Thumbnails of the files chosen so far, with a remove button on each.
function Previews({ files, onRemove }) {
  const { t } = usePrefs();
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return (
    <ul className="previews">
      {files.map((f, i) => (
        <li key={f.name + f.size + i}>
          <img src={urls[i]} alt="" />
          <button type="button" className="x" onClick={() => onRemove(i)} aria-label={`${t("c_remove")}: ${f.name}`}>×</button>
        </li>
      ))}
    </ul>
  );
}

function FilePicker({ id, label, onPick }) {
  return (
    <label className="ghost filebtn" htmlFor={id}>
      ＋ {label}
      <input id={id} type="file" accept="image/*" multiple onChange={(e) => { onPick([...e.target.files]); e.target.value = ""; }} />
    </label>
  );
}

export default function NewCase() {
  const { t, num } = usePrefs();
  const { user, reload } = useSession();
  const nav = useNavigate();
  const [f, setF] = useState({
    person_name: "", person_age: "", gender: "", relationship: user.relationship || "", last_seen_date: "",
    last_seen_place: "", clothing: "", marks_type: "none", marks_detail: "", notes: "",
  });
  const [photos, setPhotos] = useState([]);
  const [docs, setDocs] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const today = new Date().toISOString().slice(0, 10);

  function check() {
    if (!f.person_name.trim()) return "e_pname";
    if (!f.gender) return "e_gender";
    if (!f.relationship) return "e_rel";
    if (f.last_seen_date && new Date(f.last_seen_date) > new Date()) return "e_future";
    if (photos.length < 3) return "e_photos";
    if (photos.length > MAX_PHOTOS) return "e_manyPhotos";
    if (docs.length > MAX_DOCS) return "e_docs";
    if ([...photos, ...docs].some((x) => x.size > MAX_MB * 1024 * 1024)) return "e_big";
    return "";
  }

  function serverError(fields = {}) {
    const m = (k) => JSON.stringify(fields[k] || "");
    if (m("photos").includes("too_big") || m("documents").includes("too_big")) return "e_big";
    if (m("photos").includes("image") || m("documents").includes("image")) return "e_notImage";
    if (m("photos") !== '""') return "e_photos";
    if (m("documents") !== '""') return "e_docs";
    if (m("person_name") !== '""') return "e_pname";
    if (m("gender") !== '""') return "e_gender";
    if (m("relationship") !== '""') return "e_rel";
    if (m("last_seen_at") !== '""') return "e_future";
    return "network";
  }

  async function submit(e) {
    e.preventDefault();
    const x = check(); setErr(x); if (x) return;
    const fd = new FormData();
    fd.append("person_name", f.person_name.trim());
    fd.append("gender", f.gender);
    fd.append("relationship", f.relationship);
    const age = parseInt(norm(f.person_age), 10);
    if (!Number.isNaN(age)) fd.append("person_age", age);
    if (f.last_seen_date) fd.append("last_seen_at", new Date(f.last_seen_date + "T00:00:00").toISOString());
    for (const k of ["last_seen_place", "clothing", "marks_type", "notes"]) fd.append(k, f[k].trim());
    fd.append("marks_detail", f.marks_type === "none" ? "" : f.marks_detail.trim());
    photos.forEach((p) => fd.append("photos", p));
    docs.forEach((d) => fd.append("documents", d));
    setBusy(true);
    try {
      await createCase(fd);
      await reload();
      nav("/dashboard");
    } catch (x) {
      setErr(x.code === "validation" ? serverError(x.fields) : x.code === "limit" ? "limit" : "network");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="sec"><h1>{t("newCaseTitle")}</h1></div>
      <form className="panel formwide" onSubmit={submit} noValidate>
        <p className="muted">{t("caseIntro")}</p>

        <label htmlFor="cn">{t("c_name")}</label>
        <input id="cn" value={f.person_name} onChange={set("person_name")} />
        <div className="grid2">
          <div>
            <label htmlFor="ca">{t("c_age")}</label>
            <input id="ca" value={f.person_age} onChange={set("person_age")} inputMode="numeric" />
          </div>
          <div>
            <label htmlFor="cg">{t("c_gender")}</label>
            <select id="cg" value={f.gender} onChange={set("gender")}>
              <option value="">{t("choose")}</option>
              {GENDERS.map((g) => <option key={g} value={g}>{t("g_" + g)}</option>)}
            </select>
          </div>
        </div>
        <label htmlFor="cr">{t("relation")}</label>
        <select id="cr" value={f.relationship} onChange={set("relationship")}>
          <option value="">{t("choose")}</option>
          {RELS.map((r) => <option key={r} value={r}>{t("rel_" + r)}</option>)}
        </select>

        <label htmlFor="cd">{t("c_date")}</label>
        <input id="cd" type="date" max={today} value={f.last_seen_date} onChange={set("last_seen_date")} />
        <label htmlFor="cp">{t("c_place")}</label>
        <input id="cp" value={f.last_seen_place} onChange={set("last_seen_place")} />

        <label htmlFor="cc">{t("c_clothing")}</label>
        <input id="cc" value={f.clothing} onChange={set("clothing")} />
        <label htmlFor="cm">{t("c_marks")}</label>
        <select id="cm" value={f.marks_type} onChange={set("marks_type")}>
          {MARKS.map((m) => <option key={m} value={m}>{t("m_" + m)}</option>)}
        </select>
        {f.marks_type !== "none" && (
          <>
            <label htmlFor="cmd">{t("c_marksDetail")}</label>
            <input id="cmd" value={f.marks_detail} onChange={set("marks_detail")} />
          </>
        )}
        <label htmlFor="cno">{t("c_notes")}</label>
        <textarea id="cno" rows={3} maxLength={500} value={f.notes} onChange={set("notes")} />

        <h2 className="gap">{t("c_photos")}</h2>
        <p className="note">{t("c_photosHelp")}</p>
        <Previews files={photos} onRemove={(i) => { setErr(""); setPhotos(photos.filter((_, j) => j !== i)); }} />
        <div className="row">
          <FilePicker id="cph" label={t("c_add")} onPick={(l) => { setErr(""); setPhotos([...photos, ...l].slice(0, MAX_PHOTOS)); }} />
          <span className={"pill" + (photos.length >= 3 ? " ok" : "")} aria-live="polite">{t("c_count", { n: num(photos.length) })}</span>
        </div>

        <h2 className="gap">{t("c_docs")}</h2>
        <p className="note">{t("c_docsHelp")}</p>
        <Previews files={docs} onRemove={(i) => { setErr(""); setDocs(docs.filter((_, j) => j !== i)); }} />
        <FilePicker id="cdo" label={t("c_add")} onPick={(l) => { setErr(""); setDocs([...docs, ...l].slice(0, MAX_DOCS)); }} />

        {err && <p className="error" role="alert">{t(err)}</p>}
        <button className="primary" disabled={busy}>{busy ? t("loading") : t("c_submit")}</button>
      </form>
    </>
  );
}
