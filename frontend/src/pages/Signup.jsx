import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, register, setToken } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import Toggles from "./Toggles.jsx";

const RELS = ["parent", "spouse", "child", "sibling", "relative", "friend", "other"];
const BN = "০১২৩৪৫৬৭৮৯";
const norm = (s) => s.replace(/[০-৯]/g, (d) => BN.indexOf(d));

export default function Signup() {
  const { t } = usePrefs();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ full_name: "", phone: "", email: "", age: "", relationship: "", password: "", password2: "", consent: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  function checkStep1() {
    if (!f.full_name.trim()) return "e_name";
    if (!/^01\d{9}$/.test(norm(f.phone.trim()))) return "e_phone";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return "e_email";
    const age = parseInt(norm(f.age), 10);
    if (!age || age < 18) return "e_age";
    if (!f.relationship) return "e_rel";
    return "";
  }
  function checkStep2() {
    if (f.password.length < 8) return "e_pw";
    if (f.password !== f.password2) return "e_pwMatch";
    if (!f.consent) return "e_consent";
    return "";
  }
  function serverError(fields = {}) {
    const m = (k) => (fields[k] || []).join(" ");
    if (m("phone")) { setStep(1); return m("phone").includes("exists") ? "phoneExists" : "e_phone"; }
    if (m("email")) { setStep(1); return m("email").includes("exists") ? "emailExists" : "e_email"; }
    if (m("age")) { setStep(1); return "e_age"; }
    if (m("password")) return "e_pw";
    return "network";
  }

  function next(e) { e.preventDefault(); const x = checkStep1(); setErr(x); if (!x) setStep(2); }
  async function submit(e) {
    e.preventDefault();
    const x = checkStep2(); setErr(x); if (x) return;
    setBusy(true);
    try {
      const phone = norm(f.phone.trim());
      await register({ full_name: f.full_name.trim(), phone, email: f.email.trim(), age: parseInt(norm(f.age), 10),
                       relationship: f.relationship, password: f.password, consent: f.consent });
      const data = await login(phone, f.password);
      setToken(data.access);
      nav("/dashboard");
    } catch (x) {
      setErr(x.code === "validation" ? serverError(x.fields) : "network");
    } finally { setBusy(false); }
  }

  return (
    <main className="page">
      <Toggles />
      <section className="split">
        <div className="intro">
          <h1 className="brand">{t("brand")}</h1>
          <p className="tagline">{t("tagline")}</p>
        </div>
        <form className="glass" onSubmit={step === 1 ? next : submit} noValidate>
          <h2>{t("signup")}</h2>
          <p className="note">{t(step === 1 ? "step1" : "step2")} ({step}/2)</p>
          {step === 1 ? (<>
            <label htmlFor="n">{t("fullName")}</label>
            <input id="n" value={f.full_name} onChange={set("full_name")} autoComplete="name" />
            <label htmlFor="p">{t("phone")}</label>
            <input id="p" value={f.phone} onChange={set("phone")} placeholder={t("idHint")} inputMode="tel" autoComplete="tel" />
            <label htmlFor="e">{t("email")}</label>
            <input id="e" value={f.email} onChange={set("email")} inputMode="email" autoComplete="email" />
            <label htmlFor="a">{t("age")}</label>
            <input id="a" value={f.age} onChange={set("age")} inputMode="numeric" />
            <label htmlFor="r">{t("relation")}</label>
            <select id="r" value={f.relationship} onChange={set("relationship")}>
              <option value="">{t("choose")}</option>
              {RELS.map((r) => <option key={r} value={r}>{t("rel_" + r)}</option>)}
            </select>
          </>) : (<>
            <label htmlFor="pw">{t("pw")}</label>
            <input id="pw" type="password" value={f.password} onChange={set("password")} placeholder={t("pwHint")} autoComplete="new-password" />
            <label htmlFor="pw2">{t("pw2")}</label>
            <input id="pw2" type="password" value={f.password2} onChange={set("password2")} autoComplete="new-password" />
            <label className="check"><input type="checkbox" checked={f.consent} onChange={set("consent")} /> <span>{t("consent")}</span></label>
          </>)}
          {err && <p className="error" role="alert">{t(err)}</p>}
          <div className="btnrow">
            {step === 2 && <button type="button" className="chip" onClick={() => { setStep(1); setErr(""); }}>{t("back")}</button>}
            <button className="primary" disabled={busy}>{step === 1 ? t("next") : busy ? t("loading") : t("create")}</button>
          </div>
          <p className="note">{t("haveAccount")} <Link to="/login">{t("loginTitle")}</Link></p>
        </form>
      </section>
    </main>
  );
}
