import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createRecord, getRecord, updateRecord } from "../../api.js";
import { normDigits, serverErrors, validPhone } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { useSession } from "../../session.jsx";
import { CONDITIONS, DIVISIONS, ID_TYPES } from "../../traits.js";
import { Loading, LoadError } from "../../components/ui.jsx";
import { ClothingEditor, Field, MarksEditor, PhotoPicker, Select, TraitsPicker } from "../../components/TraitInputs.jsx";

const pad = (n) => String(n).padStart(2, "0");
const toLocalInput = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const PLAIN = ["condition", "name_hint", "gender", "belongings", "id_type", "id_number", "medical_notes", "notes",
  "division", "found_place", "found_area", "contact_name", "contact_phone"];

// Scenarios 1 and 2: police station or medical team posts a person in their care.
export default function RecordForm() {
  const { id } = useParams();
  const editing = !!id;
  const { t } = usePrefs();
  const { user } = useSession();
  const nav = useNavigate();
  const medical = user.role === "medical";
  const [f, setF] = useState({
    condition: "", name_hint: "", gender: "", age_min: "", age_max: "", height_cm: "", traits: {}, clothing: [],
    belongings: "", marks: [], id_type: "", id_number: "", medical_notes: "", notes: "",
    division: user.division || "", found_place: user.organization || "", found_area: "", found_at: toLocalInput(),
    contact_name: user.full_name || "", contact_phone: user.phone || "",
  });
  const [load, setLoad] = useState(editing ? "loading" : "");
  const [photos, setPhotos] = useState([]);
  const [docs, setDocs] = useState([]);
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingMark, setPendingMark] = useState(false);
  const [pendingCloth, setPendingCloth] = useState(false);

  useEffect(() => {
    if (!editing) return;
    getRecord(id).then((r) => {
      const next = {};
      for (const k of Object.keys(f)) next[k] = r[k] ?? "";
      next.found_at = toLocalInput(r.found_at);
      setF(next);
      setLoad("");
    }).catch((x) => setLoad(x.code === "notFound" ? "notFound" : "network"));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const val = (k, v) => setF({ ...f, [k]: v });
  if (load === "loading") return <Loading />;
  if (load) return <LoadError error={load} />;

  const submit = async (e) => {
    e.preventDefault();
    const x = {};
    if (!f.condition) x.condition = "e_condition";
    if (!f.gender) x.gender = "e_gender";
    const lo = normDigits(f.age_min), hi = normDigits(f.age_max);
    if ((lo && (+lo < 0 || +lo > 120)) || (hi && (+hi < 0 || +hi > 120))) x.age_min = "e_ageRange";
    else if (lo && hi && +lo > +hi) x.age_min = "e_ageOrder";
    if (!f.division) x.division = "e_div";
    if (!f.found_place.trim()) x.found_place = "required";
    if (!f.found_at) x.found_at = "required";
    else if (new Date(f.found_at) > new Date()) x.found_at = "e_future";
    if (!validPhone(f.contact_phone)) x.contact_phone = "e_phone";
    if (!editing && photos.length < 1) x.photos = "e_onePhoto";
    if (pendingMark) x.marks = "e_markUnfinished";
    if (pendingCloth) x.clothing = "e_clothUnfinished";
    setErr(x);
    if (Object.keys(x).length) { setMsg("err_form"); return; }

    const fd = new FormData();
    PLAIN.forEach((k) => fd.append(k, f[k] ?? ""));
    fd.set("contact_phone", normDigits(f.contact_phone));
    ["age_min", "age_max", "height_cm"].forEach((k) => fd.append(k, normDigits(f[k])));
    fd.append("found_at", new Date(f.found_at).toISOString());
    fd.append("traits", JSON.stringify(f.traits || {}));
    fd.append("clothing", JSON.stringify(f.clothing || []));
    fd.append("marks", JSON.stringify(f.marks || []));
    photos.forEach((p) => fd.append("photos", p));
    docs.forEach((p) => fd.append("documents", p));
    setBusy(true); setMsg("");
    try {
      const res = editing ? await updateRecord(id, fd) : await createRecord(fd);
      nav(`/records/${res.id}`, { replace: true });
    } catch (x2) {
      if (x2.code === "validation") { setErr(serverErrors(x2.fields)); setMsg("err_form"); } else setMsg("network");
    } finally { setBusy(false); }
  };

  const inv = (k) => ({ "aria-invalid": !!err[k], "aria-describedby": err[k] ? `${k}-err` : undefined });
  return (
    <form className="panel formwide" onSubmit={submit} noValidate>
      <h1>{t(editing ? "editRecord" : "newRecordTitle")}</h1>
      <p className="muted">{t(medical ? "medicalIntro" : "policeIntro")}</p>

      <h2 className="gap">{t("sec_condition")}</h2>
      <fieldset className="radios cond" aria-describedby={err.condition ? "condition-err" : undefined}>
        <legend className="sr">{t("sec_condition")}</legend>
        {CONDITIONS.map((c) => (
          <label key={c} className={`radio ${f.condition === c ? "on" : ""} ${c === "deceased" ? "sensitive" : ""}`}>
            <input type="radio" name="condition" value={c} checked={f.condition === c} onChange={set("condition")} />
            <span><strong>{t(`cond_${c}`)}</strong><span className="block small muted">{t(`condh_${c}`)}</span></span>
          </label>
        ))}
      </fieldset>
      {err.condition && <p className="fielderr" id="condition-err" role="alert">{t(err.condition)}</p>}
      {f.condition === "deceased" && <p className="warn">{t("deceasedNote")}</p>}

      <h2 className="gap">{t("sec_person")}</h2>
      <Field id="name_hint" label={t("f_nameHint")} hint={t("nameHintHelp")}><input id="name_hint" maxLength={100} value={f.name_hint} onChange={set("name_hint")} /></Field>
      <div className="grid2">
        <div><Select id="gender" label={t("c_gender")} value={f.gender} onChange={(v) => val("gender", v)} options={["male", "female", "other", "unknown"]} prefix="g_" error={err.gender} /></div>
        <div><Field id="height_cm" label={t("height")}><input id="height_cm" inputMode="numeric" value={f.height_cm} onChange={set("height_cm")} /></Field></div>
        <div><Field id="age_min" label={t("ageMin")} error={err.age_min}><input id="age_min" inputMode="numeric" value={f.age_min} onChange={set("age_min")} {...inv("age_min")} /></Field></div>
        <div><Field id="age_max" label={t("ageMax")}><input id="age_max" inputMode="numeric" value={f.age_max} onChange={set("age_max")} /></Field></div>
      </div>
      <TraitsPicker value={f.traits || {}} onChange={(v) => val("traits", v)} />

      <h2 className="gap">{t(medical ? "sec_marksMedical" : "sec_marks")}</h2>
      <p className="hint">{t(medical ? "marksHintMedical" : "marksHintPolice")}</p>
      <MarksEditor value={f.marks || []} onChange={(v) => val("marks", v)} medical onPending={setPendingMark} />
      {err.marks && <p className="fielderr big" role="alert">{t(err.marks)}</p>}
      {medical && <Field id="medical_notes" label={t("f_medicalNotes")}><textarea id="medical_notes" rows={3} maxLength={500} value={f.medical_notes} onChange={set("medical_notes")} /></Field>}

      <h2 className="gap">{t("sec_clothing")}</h2>
      <ClothingEditor value={f.clothing || []} onChange={(v) => val("clothing", v)} onPending={setPendingCloth} />
      {err.clothing && <p className="fielderr big" role="alert">{t(err.clothing)}</p>}
      <Field id="belongings" label={t("belongings")}><input id="belongings" maxLength={300} placeholder={t("belongingsPh")} value={f.belongings} onChange={set("belongings")} /></Field>

      <h2 className="gap">{t("idInfo")}</h2>
      <div className="grid2">
        <div><Select id="id_type" label={t("idType")} value={f.id_type} onChange={(v) => val("id_type", v)} options={ID_TYPES} prefix="id_" blank="notSure" /></div>
        <div><Field id="id_number" label={t("idNumber")}><input id="id_number" maxLength={40} value={f.id_number} onChange={set("id_number")} /></Field></div>
      </div>

      <h2 className="gap">{t("sec_location")}</h2>
      <Select id="division" label={t("division")} value={f.division} onChange={(v) => val("division", v)} options={DIVISIONS} prefix="div_" error={err.division} />
      <Field id="found_place" label={t(medical ? "f_hospital" : "f_station")} error={err.found_place}><input id="found_place" maxLength={200} value={f.found_place} onChange={set("found_place")} {...inv("found_place")} /></Field>
      <Field id="found_area" label={t(medical ? "f_ward" : "f_area")}><input id="found_area" maxLength={150} value={f.found_area} onChange={set("found_area")} /></Field>
      <Field id="found_at" label={t(medical ? "f_admittedAt" : "f_foundAt")} error={err.found_at}><input id="found_at" type="datetime-local" value={f.found_at} onChange={set("found_at")} {...inv("found_at")} /></Field>
      <div className="grid2">
        <div><Field id="contact_name" label={t("f_contactName")}><input id="contact_name" maxLength={100} value={f.contact_name} onChange={set("contact_name")} /></Field></div>
        <div><Field id="contact_phone" label={t("f_contactPhone")} error={err.contact_phone}><input id="contact_phone" inputMode="tel" value={f.contact_phone} onChange={set("contact_phone")} {...inv("contact_phone")} /></Field></div>
      </div>
      <Field id="notes" label={t("c_notes")}><textarea id="notes" rows={3} maxLength={500} value={f.notes} onChange={set("notes")} /></Field>

      <h2 className="gap">{t(editing ? "addPhotos" : "r_photos")}</h2>
      <p className="hint">{t("r_photosHelp")}</p>
      <PhotoPicker id="photos" files={photos} onChange={setPhotos} max={8} onError={(e2) => setErr({ ...err, photos: e2 })} />
      {err.photos && <p className="fielderr" role="alert">{t(err.photos)}</p>}
      <h2 className="gap">{t("c_docs")}</h2>
      <p className="hint">{t("r_docsHelp")}</p>
      <PhotoPicker id="documents" files={docs} onChange={setDocs} max={4} onError={(e2) => setErr({ ...err, documents: e2 })} />
      {err.documents && <p className="fielderr" role="alert">{t(err.documents)}</p>}

      {msg && <p className="error" role="alert">{t(msg)}</p>}
      <div className="btnrow">
        <Link className="ghost" to={editing ? `/records/${id}` : "/reporter"}>{t("cancel")}</Link>
        <button className="primary" disabled={busy}>{busy ? t("loading") : t(editing ? "save" : "r_submit")}</button>
      </div>
    </form>
  );
}
