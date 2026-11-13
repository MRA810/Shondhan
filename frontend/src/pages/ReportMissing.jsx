import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCase } from "../api.js";
import Shell from "../components/Shell.jsx";
import { normDigits } from "../hooks.js";
import { DIVISIONS } from "../i18n.dash.js";
import { usePrefs } from "../prefs.jsx";

const GENDERS = ["unknown", "male", "female", "other"];
const MAX = 5 * 1024 * 1024;
const EMPTY = { person_name: "", age_approx: "", gender: "unknown", height_cm: "", division: "", last_seen_place: "",
                last_seen_date: "", clothing: "", body_marks: "", description: "", cannot_speak: false };

function usePreviews(files) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls]);
  return urls;
}

function Picker({ files, setFiles, label, setErr }) {
  const { t } = usePrefs();
  const urls = usePreviews(files);
  function add(e) {
    const picked = [...e.target.files];
    e.target.value = "";
    if (picked.some((f) => !f.type.startsWith("image/"))) return setErr("e_img");
    if (picked.some((f) => f.size > MAX)) return setErr("e_big");
    setErr("");
    setFiles([...files, ...picked]);
  }
  return (
    <>
      <label className="chip filebtn">
        {label}
        <input type="file" accept="image/*" multiple onChange={add} className="sr" />
      </label>
      <ul className="previews">
        {urls.map((u, i) => (
          <li key={u}>
            <img src={u} alt="" />
            <button type="button" className="chip" onClick={() => setFiles(files.filter((_, j) => j !== i))}>{t("remove")}</button>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function ReportMissing() {
  const { t } = usePrefs();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [f, setF] = useState(EMPTY);
  const [photos, setPhotos] = useState([]);
  const [ids, setIds] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  function next(e) {
    e.preventDefault();
    const x = !f.person_name.trim() ? "e_pname" : !f.division ? "e_pdiv" : "";
    setErr(x);
    if (!x) setStep(2);
  }

  async function submit(e) {
    e.preventDefault();
    if (photos.length < 3) return setErr("e_photos");
    setBusy(true); setErr("");
    const fd = new FormData();
    Object.entries({ ...f, person_name: f.person_name.trim(), age_approx: normDigits(f.age_approx),
                     height_cm: normDigits(f.height_cm) })
      .forEach(([k, v]) => { if (v !== "") fd.append(k, v); });
    photos.forEach((p) => fd.append("photo_files", p));
    ids.forEach((p) => fd.append("id_files", p));
    try {
      const c = await createCase(fd);
      nav(`/cases/${c.id}`);
    } catch (x) {
      const fl = x.fields || {};
      if (x.code !== "validation") setErr("network");
      else if (fl.person_name) { setStep(1); setErr("e_pname"); }
      else if (fl.division) { setStep(1); setErr("e_pdiv"); }
      else if (fl.photo_files || fl.id_files) setErr(JSON.stringify(fl).includes("too_big") ? "e_big" : "e_photos");
      else { setStep(1); setErr("network"); }
    } finally { setBusy(false); }
  }

  return (
    <Shell narrow>
      <form className="glass" onSubmit={step === 1 ? next : submit} noValidate>
        <h2>{t("rp_title")}</h2>
        <p className="note">{t(step === 1 ? "rp_step1" : "rp_step2")} ({step}/2)</p>

        {step === 1 ? (<>
          <label htmlFor="pn">{t("pName")}</label>
          <input id="pn" value={f.person_name} onChange={set("person_name")} />
          <label htmlFor="pa">{t("pAge")}</label>
          <input id="pa" value={f.age_approx} onChange={set("age_approx")} inputMode="numeric" />
          <label htmlFor="pg">{t("gender")}</label>
          <select id="pg" value={f.gender} onChange={set("gender")}>
            {GENDERS.map((g) => <option key={g} value={g}>{t("g_" + g)}</option>)}
          </select>
          <label htmlFor="ph">{t("height")}</label>
          <input id="ph" value={f.height_cm} onChange={set("height_cm")} inputMode="numeric" />
          <label htmlFor="pd">{t("division")}</label>
          <select id="pd" value={f.division} onChange={set("division")}>
            <option value="">{t("choose")}</option>
            {DIVISIONS.map((d) => <option key={d} value={d}>{t("div_" + d)}</option>)}
          </select>
          <label htmlFor="pp">{t("lastSeenPlace")}</label>
          <input id="pp" value={f.last_seen_place} onChange={set("last_seen_place")} />
          <label htmlFor="pt">{t("lastSeenDate")}</label>
          <input id="pt" type="date" value={f.last_seen_date} onChange={set("last_seen_date")} />
          <label htmlFor="pc">{t("clothing")}</label>
          <textarea id="pc" rows="2" value={f.clothing} onChange={set("clothing")} />
          <label htmlFor="pm">{t("marks")}</label>
          <textarea id="pm" rows="2" value={f.body_marks} onChange={set("body_marks")} />
          <label htmlFor="pe">{t("desc")}</label>
          <textarea id="pe" rows="2" value={f.description} onChange={set("description")} />
          <label className="check"><input type="checkbox" checked={f.cannot_speak} onChange={set("cannot_speak")} /> <span>{t("cannotSpeak")}</span></label>
        </>) : (<>
          <h3>{t("ph_title")}</h3>
          <Picker files={photos} setFiles={setPhotos} label={t("ph_add")} setErr={setErr} />
          <p className="note">{photos.length} {t("ph_count")}</p>
          <h3>{t("id_title")}</h3>
          <p className="note">{t("id_hint")}</p>
          <Picker files={ids} setFiles={setIds} label={t("ph_add")} setErr={setErr} />
        </>)}

        {err && <p className="error" role="alert">{t(err)}</p>}
        <div className="btnrow">
          {step === 2 && <button type="button" className="chip" onClick={() => { setStep(1); setErr(""); }}>{t("back")}</button>}
          <button className="primary" disabled={busy}>{step === 1 ? t("next") : busy ? t("loading") : t("submit_post")}</button>
        </div>
      </form>
    </Shell>
  );
}
