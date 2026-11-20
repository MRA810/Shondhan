import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createCase, registerWithReport } from "../../api.js";
import { normDigits, serverErrors, validPhone } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { DIVISIONS, ID_TYPES, RELATIONS } from "../../traits.js";
import { clothText, markText, traitsText } from "../../components/ui.jsx";
import MarksFigure from "../../body/MarksFigure.jsx";
import OtpField from "../../components/OtpField.jsx";
import { ClothingEditor, Field, MarksEditor, PhotoPicker, Select, TraitsPicker } from "../../components/TraitInputs.jsx";

const DRAFT_KEY = "shondhan_report_draft";
const EMPTY = {
  person_name: "", relationship: "", gender: "", person_age: "", height_cm: "", last_seen_place: "", division: "",
  last_seen_at: "", traits: {}, cannot_speak: false, clothing: [], belongings: "", marks: [], id_type: "", id_number: "", notes: "",
  marks_answer: "", // "yes" | "no" | "unsure": asked straight out so marks are not skipped by accident
  // the family member's own details (new visitors only)
  full_name: "", phone: "", email: "", age: "", password: "", password2: "", consent: false, otp: "",
};
// photos cannot go into sessionStorage, so they live here while the tab is open
const files = { photos: [], documents: [] };

const loadDraft = () => {
  try {
    const d = { ...EMPTY, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "{}"), password: "", password2: "", otp: "" };
    if (d.marks.length && !d.marks_answer) d.marks_answer = "yes";
    return d;
  }
  catch { return { ...EMPTY }; }
};
export const clearDraft = () => {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  files.photos = []; files.documents = [];
};

const num = (v) => normDigits(v).trim();
const STEPS_REPORT = ["who", "basics", "lastSeen", "looks", "clothing", "marks", "idinfo", "photos", "docs", "review"];
const STEPS_GUEST = [...STEPS_REPORT, "you", "verify"];
// which page each server field lives on (to jump back when the server finds a problem)
const FIELD_STEP = {
  person_name: "who", relationship: "who", gender: "basics", person_age: "basics", height_cm: "basics",
  last_seen_place: "lastSeen", division: "lastSeen", last_seen_at: "lastSeen", traits: "looks", cannot_speak: "looks",
  clothing: "clothing", belongings: "clothing", marks: "marks", id_type: "idinfo", id_number: "idinfo", notes: "idinfo",
  photos: "photos", documents: "docs", full_name: "you", phone: "you", email: "you", age: "you",
  password: "verify", otp: "verify", consent: "verify",
};

function check(step, f) {
  const e = {};
  if (step === "who") {
    if (!f.person_name.trim()) e.person_name = "e_pname";
    if (!f.relationship) e.relationship = "e_rel";
  }
  if (step === "basics") {
    if (!f.gender) e.gender = "e_gender";
    const a = num(f.person_age), h = num(f.height_cm);
    if (a && (Number.isNaN(+a) || +a < 0 || +a > 120)) e.person_age = "e_ageRange";
    if (h && (Number.isNaN(+h) || +h < 40 || +h > 250)) e.height_cm = "e_height";
  }
  if (step === "lastSeen" && f.last_seen_at && new Date(f.last_seen_at) > new Date()) e.last_seen_at = "e_future";
  if (step === "marks") {
    if (!f.marks_answer) e.marks_answer = "e_marksAnswer";
    else if (f.marks_answer === "yes" && !f.marks.length) e.marks_answer = "e_marksNone";
  }
  if (step === "photos" && files.photos.length < 3) e.photos = "e_photos";
  if (step === "you") {
    if (!f.full_name.trim()) e.full_name = "e_name";
    if (!validPhone(f.phone)) e.phone = "e_phone";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = "e_email";
    const a = num(f.age);
    if (!a || +a < 18 || +a > 120) e.age = "e_age";
  }
  if (step === "verify") {
    if (f.otp.length !== 6) e.otp = "e_otp";
    if (f.password.length < 8) e.password = "e_pw";
    if (f.password !== f.password2) e.password2 = "e_pwMatch";
    if (!f.consent) e.consent = "e_consent";
  }
  return e;
}

export default function ReportWizard({ guest }) {
  const { t, num: n } = usePrefs();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const steps = guest ? STEPS_GUEST : STEPS_REPORT;
  const idx = Math.min(Math.max(parseInt(params.get("s") || "1", 10) - 1, 0), steps.length - 1);
  const step = steps[idx];
  const [f, setF] = useState(loadDraft);
  const [, setFilesTick] = useState(0);
  const [err, setErr] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingMark, setPendingMark] = useState(false); // a place tapped on the figure but no type chosen yet
  const [pendingCloth, setPendingCloth] = useState(false); // a clothing item picked but not added
  const top = useRef(null);
  const base = guest ? "/report/steps" : "/cases/new/steps";

  // keep the typed answers if the page is reloaded (photos must be chosen again)
  useEffect(() => {
    const { password, password2, otp, ...keep } = f; // never store secrets
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(keep)); } catch { /* private mode */ }
  }, [f]);
  // a later page opened directly (bookmark, reload): go back to the first unfinished page
  useEffect(() => {
    for (let i = 0; i < idx; i++) {
      if (Object.keys(check(steps[i], f)).length) { setParams({ s: String(i + 1) }, { replace: true }); return; }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { top.current?.focus(); window.scrollTo(0, 0); }, [step]);
  useEffect(() => {
    const warn = (e) => { if (f.person_name) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [f.person_name]);

  // fixing a field removes its error message straight away
  const clearErr = (k) => { if (err[k] || msg) { const { [k]: _, ...rest } = err; setErr(rest); setMsg(""); } };
  const set = (k) => (e) => { clearErr(k); setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }); };
  const val = (k, v) => { clearErr(k); setF({ ...f, [k]: v }); };
  const goTo = (s) => { setErr({}); setMsg(""); setParams({ s: String(steps.indexOf(s) + 1) }); };
  const next = () => {
    if (step === "marks" && pendingMark) { setErr({ marks_answer: "e_markUnfinished" }); return; }
    if (step === "clothing" && pendingCloth) { setErr({ clothing: "e_clothUnfinished" }); return; }
    const e = check(step, f);
    setErr(e);
    if (Object.keys(e).length) return;
    setMsg("");
    setParams({ s: String(idx + 2) });
  };
  const back = () => { setErr({}); setMsg(""); if (idx === 0) nav(guest ? "/report" : "/dashboard"); else setParams({ s: String(idx) }); };

  const submit = async () => {
    for (const s of steps) {
      const e = check(s, f);
      if (Object.keys(e).length) { setErr(e); setMsg("err_form"); setParams({ s: String(steps.indexOf(s) + 1) }); return; }
    }
    const fd = new FormData();
    ["person_name", "relationship", "gender", "division", "last_seen_place", "belongings", "id_type", "id_number", "notes"]
      .forEach((k) => fd.append(k, f[k]));
    if (f.person_age !== "") fd.append("person_age", num(f.person_age));
    if (f.height_cm !== "") fd.append("height_cm", num(f.height_cm));
    if (f.last_seen_at) fd.append("last_seen_at", new Date(f.last_seen_at).toISOString());
    fd.append("cannot_speak", f.cannot_speak ? "true" : "false");
    fd.append("traits", JSON.stringify(f.traits));
    fd.append("clothing", JSON.stringify(f.clothing));
    fd.append("marks", JSON.stringify(f.marks_answer === "yes" ? f.marks : []));
    files.photos.forEach((p) => fd.append("photos", p));
    files.documents.forEach((p) => fd.append("documents", p));
    if (guest) {
      fd.append("full_name", f.full_name.trim());
      fd.append("phone", num(f.phone).replace(/[\s-]/g, ""));
      fd.append("email", f.email);
      fd.append("age", num(f.age));
      fd.append("password", f.password);
      fd.append("consent", "true");
      fd.append("otp", f.otp);
    }
    setBusy(true); setMsg("");
    try {
      const res = guest ? await registerWithReport(fd) : await createCase(fd);
      const id = guest ? res.case_id : res.id;
      clearDraft();
      nav(`/cases/${id}?new=1`, { replace: true });
    } catch (x) {
      if (x.code === "validation") {
        const se = serverErrors(x.fields);
        if (se.phone === "err_exists") se.phone = "phoneExists";
        if (se.email === "err_exists") se.email = "emailExists";
        if (se.password) se.password = "e_pw";
        if (x.fields.otp) se.otp = `err_${x.fields.otp[0]}`;
        setErr(se);
        setMsg("err_form");
        const first = steps.find((s) => Object.keys(se).some((k) => FIELD_STEP[k] === s));
        if (first && first !== step) setParams({ s: String(steps.indexOf(first) + 1) });
      } else setMsg(x.code === "limit" ? "limit" : "network");
    } finally { setBusy(false); }
  };

  const inv = (k) => ({ "aria-invalid": !!err[k], "aria-describedby": err[k] ? `${k}-err` : undefined });
  // review: every section, with what was given, or a clear "not given" so nothing is missed by accident
  // (worked out on every render, not cached: the photos live outside React state)
  const reviewSections = (() => {
    const join = (...parts) => parts.filter(Boolean).join(" · ");
    const marks = f.marks_answer === "no" ? t("mk_none") : f.marks_answer === "unsure" ? t("mk_unsure")
      : f.marks.map((m, i) => `${n(i + 1)}. ${markText(t, m)}`).join(" · ");
    return [
      ["who", join(f.person_name, f.relationship && t(`rel_${f.relationship}`)), true],
      ["basics", join(f.gender && t(`g_${f.gender}`), f.person_age && t("ageYears", { n: +num(f.person_age) }), f.height_cm && t("cm", { n: +num(f.height_cm) })), true],
      ["lastSeen", join(f.last_seen_place, f.division && t(`div_${f.division}`), f.last_seen_at && new Date(f.last_seen_at).toLocaleString())],
      ["looks", join(...traitsText(t, f.traits), f.cannot_speak && t("cannotSpeak"))],
      ["clothing", join(f.clothing.map((c) => clothText(t, c)).join(", "), f.belongings)],
      ["marks", marks],
      ["idinfo", join(f.id_type && f.id_type !== "none" && `${t(`id_${f.id_type}`)} ${f.id_number}`.trim(), f.notes)],
      ["photos", files.photos.length ? t("c_count", { n: files.photos.length }) : "", true],
      ["docs", files.documents.length ? t("c_count", { n: files.documents.length }) : ""],
    ];
  })();
  const filled = reviewSections.filter(([, v]) => v).length;

  const last = idx === steps.length - 1;
  const isReview = step === "review";
  return (
    <div className="wizard">
      <div className="wizhead">
        <p className="steps">{t("stepOf", { a: idx + 1, b: steps.length })} · {t(guest && idx >= STEPS_REPORT.length ? "wz_partYou" : "wz_partReport")}</p>
        <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={idx + 1}
          aria-label={t("progress")}><span style={{ width: `${((idx + 1) / steps.length) * 100}%` }} /></div>
      </div>
      <section className="panel formwide wizpage">
        <h1 tabIndex={-1} ref={top}>{t(`wz_${step}`)}</h1>
        <p className="muted">{t(`wzh_${step}`)}</p>

        {step === "who" && (
          <>
            <Field id="person_name" label={t("c_name")} error={err.person_name}>
              <input id="person_name" autoComplete="off" maxLength={100} autoFocus value={f.person_name} onChange={set("person_name")} {...inv("person_name")} />
            </Field>
            <Select id="relationship" label={t("relation")} value={f.relationship} onChange={(v) => val("relationship", v)} options={RELATIONS} prefix="rel_" error={err.relationship} />
          </>
        )}

        {step === "basics" && (
          <>
            <fieldset className="radios" aria-describedby={err.gender ? "gender-err" : undefined}>
              <legend>{t("c_gender")}</legend>
              {["male", "female", "other"].map((g) => (
                <label key={g} className={f.gender === g ? "radio on" : "radio"}>
                  <input type="radio" name="gender" value={g} checked={f.gender === g} onChange={set("gender")} /> {t(`g_${g}`)}
                </label>
              ))}
            </fieldset>
            {err.gender && <p className="fielderr" id="gender-err" role="alert">{t(err.gender)}</p>}
            <div className="grid2">
              <div><Field id="person_age" label={t("c_age")} error={err.person_age}><input id="person_age" inputMode="numeric" value={f.person_age} onChange={set("person_age")} {...inv("person_age")} /></Field></div>
              <div><Field id="height_cm" label={t("height")} error={err.height_cm}><input id="height_cm" inputMode="numeric" value={f.height_cm} onChange={set("height_cm")} {...inv("height_cm")} /></Field></div>
            </div>
          </>
        )}

        {step === "lastSeen" && (
          <>
            <Field id="last_seen_place" label={t("c_place")}><input id="last_seen_place" maxLength={200} value={f.last_seen_place} onChange={set("last_seen_place")} /></Field>
            <Select id="division" label={t("c_division")} value={f.division} onChange={(v) => val("division", v)} options={DIVISIONS} prefix="div_" blank="notSure" />
            <Field id="last_seen_at" label={t("c_date")} error={err.last_seen_at}><input id="last_seen_at" type="datetime-local" value={f.last_seen_at} onChange={set("last_seen_at")} {...inv("last_seen_at")} /></Field>
          </>
        )}

        {step === "looks" && (
          <>
            <TraitsPicker value={f.traits} onChange={(v) => val("traits", v)} />
            <label className="check mt"><input type="checkbox" checked={f.cannot_speak} onChange={set("cannot_speak")} /> {t("cannotSpeak")}</label>
          </>
        )}

        {step === "clothing" && (
          <>
            <ClothingEditor value={f.clothing} onChange={(v) => val("clothing", v)} onPending={setPendingCloth} />
            {err.clothing && <p className="fielderr big" role="alert">{t(err.clothing)}</p>}
            <Field id="belongings" label={t("belongings")}><input id="belongings" maxLength={300} placeholder={t("belongingsPh")} value={f.belongings} onChange={set("belongings")} /></Field>
          </>
        )}

        {step === "marks" && (
          <>
            <fieldset className="radios three" aria-describedby={err.marks_answer ? "marks-err" : undefined}>
              <legend>{t("mk_question", { name: f.person_name || t("unknownPerson") })}</legend>
              {["yes", "no", "unsure"].map((a) => (
                <label key={a} className={f.marks_answer === a ? "radio on" : "radio"}>
                  <input type="radio" name="marks_answer" value={a} checked={f.marks_answer === a} onChange={set("marks_answer")} /> {t(`mk_ans_${a}`)}
                </label>
              ))}
            </fieldset>
            {err.marks_answer && <p className="fielderr big" id="marks-err" role="alert">{t(err.marks_answer)}</p>}
            {f.marks_answer === "yes" && (
              <MarksEditor value={f.marks} onPending={setPendingMark}
                onChange={(v) => { clearErr("marks_answer"); setF({ ...f, marks: v }); }} />
            )}
            {f.marks_answer === "no" && f.marks.length > 0 && <p className="warn">{t("mk_willRemove", { n: f.marks.length })}</p>}
          </>
        )}

        {step === "idinfo" && (
          <>
            <div className="grid2">
              <div><Select id="id_type" label={t("idType")} value={f.id_type} onChange={(v) => val("id_type", v)} options={ID_TYPES} prefix="id_" blank="notSure" /></div>
              <div><Field id="id_number" label={t("idNumber")}><input id="id_number" maxLength={40} value={f.id_number} onChange={set("id_number")} /></Field></div>
            </div>
            <Field id="notes" label={t("c_notes")}><textarea id="notes" rows={4} maxLength={500} value={f.notes} onChange={set("notes")} /></Field>
          </>
        )}

        {step === "photos" && (
          <>
            <PhotoPicker id="photos" files={files.photos} max={8} onError={(e) => setErr({ photos: e })}
              onChange={(v) => { files.photos = v; setFilesTick((x) => x + 1); setErr({}); }} />
            {err.photos && <p className="fielderr" role="alert">{t(err.photos)}</p>}
            <p className="note">{t("privacyNote")}</p>
          </>
        )}

        {step === "docs" && (
          <>
            <PhotoPicker id="documents" files={files.documents} max={4} onError={(e) => setErr({ documents: e })}
              onChange={(v) => { files.documents = v; setFilesTick((x) => x + 1); }} />
            {err.documents && <p className="fielderr" role="alert">{t(err.documents)}</p>}
          </>
        )}

        {isReview && (
          <>
            <div className="completeness">
              <div className="progress"><span style={{ width: `${(filled / reviewSections.length) * 100}%` }} /></div>
              <p><strong>{t("rv_filled", { a: filled, b: reviewSections.length })}</strong> {filled < reviewSections.length && t("rv_more")}</p>
            </div>
            {reviewSections.map(([s2, text, required]) => (
              <div key={s2} className={`reviewrow ${text ? "given" : "missing"}`}>
                <span className="rvicon" aria-hidden="true">{text ? "✓" : "!"}</span>
                <div>
                  <h3>{t(`wz_${s2}`)}{required && <span className="req"> {t("required_short")}</span>}</h3>
                  <p>{text || <em>{t(required ? "rv_missingRequired" : "rv_missing")}</em>}</p>
                  {s2 === "marks" && f.marks_answer === "yes" && <MarksFigure marks={f.marks} />}
                </div>
                <button type="button" className={text ? "ghost" : "primary inline"} onClick={() => goTo(s2)}>{t(text ? "change" : "rv_add")}</button>
              </div>
            ))}
            {files.photos.length < 3 && <p className="error" role="alert">{t("wz_photosLost")}</p>}
          </>
        )}

        {step === "you" && (
          <>
            <Field id="full_name" label={t("fullName")} error={err.full_name}><input id="full_name" autoComplete="name" value={f.full_name} onChange={set("full_name")} {...inv("full_name")} /></Field>
            <Field id="phone" label={t("phone")} hint={t("phoneLoginHint")} error={err.phone}>
              <input id="phone" inputMode="tel" autoComplete="tel" placeholder={t("idHint")} value={f.phone} onChange={set("phone")} {...inv("phone")} />
            </Field>
            {err.phone === "phoneExists" && <p className="note"><Link to="/login">{t("loginInstead")}</Link></p>}
            <Field id="email" label={t("email")} error={err.email}><input id="email" type="email" autoComplete="email" value={f.email} onChange={set("email")} {...inv("email")} /></Field>
            <Field id="age" label={t("age")} error={err.age}><input id="age" inputMode="numeric" value={f.age} onChange={set("age")} {...inv("age")} /></Field>
          </>
        )}

        {step === "verify" && (
          <>
            <OtpField phone={f.phone} value={f.otp} onChange={(v) => val("otp", v)} error={err.otp}
              onExists={() => { setErr({ phone: "phoneExists" }); goTo("you"); }} />
            <Field id="password" label={t("pw")} hint={t("pwHint")} error={err.password}>
              <input id="password" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} {...inv("password")} />
            </Field>
            <Field id="password2" label={t("pw2")} error={err.password2}>
              <input id="password2" type="password" autoComplete="new-password" value={f.password2} onChange={set("password2")} {...inv("password2")} />
            </Field>
            <label className="check"><input type="checkbox" checked={f.consent} onChange={set("consent")} /> {t("consent")}</label>
            {err.consent && <p className="fielderr" role="alert">{t(err.consent)}</p>}
          </>
        )}

        {msg && <p className="error" role="alert">{t(msg)}</p>}
        <div className="btnrow wiznav">
          <button type="button" className="ghost" onClick={back}>{t("back")}</button>
          {last || (isReview && !guest) ? (
            <button type="button" className="primary" onClick={submit} disabled={busy}>
              {busy ? t("loading") : t(guest ? "wz_finish" : "c_submit")}
            </button>
          ) : (
            <button type="button" className="primary" onClick={next}>{t(isReview ? "wz_toAccount" : "next")}</button>
          )}
        </div>
        {!["photos", "review", "you", "verify", "who", "basics", "marks"].includes(step) && <p className="note center">{t("wz_skipOk")}</p>}
      </section>
    </div>
  );
}
