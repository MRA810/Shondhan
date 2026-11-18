import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { registerStaff } from "../api.js";
import { normDigits, serverErrors, validPhone } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";
import { DIVISIONS } from "../traits.js";
import { Field, Select } from "../components/TraitInputs.jsx";
import AuthShell from "./AuthShell.jsx";
import OtpField from "../components/OtpField.jsx";

// Police stations and medical teams ask for an account; an admin approves it.
export default function StaffSignup() {
  const { t } = usePrefs();
  const [params] = useSearchParams();
  const [f, setF] = useState({ role: params.get("role") === "medical" ? "medical" : "police", full_name: "", phone: "", email: "", organization: "", designation: "",
    staff_id: "", division: "", password: "", password2: "", consent: false, otp: "" });
  const [err, setErr] = useState({});
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const x = {};
    for (const k of ["full_name", "organization", "designation", "staff_id"]) if (!f[k].trim()) x[k] = "required";
    if (!validPhone(f.phone)) x.phone = "e_phone";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) x.email = "e_email";
    if (!f.division) x.division = "e_div";
    if (f.password.length < 8) x.password = "e_pw";
    if (f.password !== f.password2) x.password2 = "e_pwMatch";
    if (!f.consent) x.consent = "e_consent";
    if (f.otp.length !== 6) x.otp = "e_otp";
    setErr(x);
    if (Object.keys(x).length) return;
    setBusy(true); setMsg("");
    try {
      await registerStaff({ ...f, phone: normDigits(f.phone).replace(/[\s-]/g, "") });
      setDone(true);
    } catch (x2) {
      if (x2.code === "validation") {
        const se = serverErrors(x2.fields);
        if (se.phone === "err_exists") se.phone = "phoneExists";
        if (se.email === "err_exists") se.email = "emailExists";
        if (se.password) se.password = "e_pw";
        if (x2.fields.otp) se.otp = `err_${x2.fields.otp[0]}`;
        setErr(se);
      } else setMsg("network");
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <AuthShell>
        <div className="glass">
          <h2>{t("staffSentTitle")}</h2>
          <p>{t("staffSent")}</p>
          <Link className="primary" to="/login">{t("loginTitle")}</Link>
        </div>
      </AuthShell>
    );
  }
  const inp = (k, props = {}) => (
    <Field id={k} label={t(`s_${k}`)} error={err[k]}>
      <input id={k} value={f[k]} onChange={set(k)} aria-invalid={!!err[k]} {...props} />
    </Field>
  );
  return (
    <AuthShell>
      <form className="glass" onSubmit={submit} noValidate>
        <h2>{t("staffSignup")}</h2>
        <p className="note">{t("staffNote")}</p>
        <fieldset className="radios">
          <legend>{t("s_role")}</legend>
          {["police", "medical"].map((r) => (
            <label key={r} className={f.role === r ? "radio on" : "radio"}>
              <input type="radio" name="role" value={r} checked={f.role === r} onChange={set("role")} /> {t(`role_${r}`)}
            </label>
          ))}
        </fieldset>
        {inp("organization", { placeholder: t(f.role === "police" ? "ph_station" : "ph_hospital") })}
        <Select id="division" label={t("division")} value={f.division} onChange={(v) => setF({ ...f, division: v })} options={DIVISIONS} prefix="div_" error={err.division} />
        {inp("full_name", { autoComplete: "name" })}
        {inp("designation")}
        {inp("staff_id")}
        {inp("phone", { inputMode: "tel", autoComplete: "tel" })}
        {inp("email", { type: "email", autoComplete: "email" })}
        {inp("password", { type: "password", autoComplete: "new-password" })}
        {inp("password2", { type: "password", autoComplete: "new-password" })}
        <OtpField phone={f.phone} value={f.otp} onChange={(v) => setF({ ...f, otp: v })} error={err.otp} />
        <label className="check"><input type="checkbox" checked={f.consent} onChange={set("consent")} /> {t("staffConsent")}</label>
        {err.consent && <p className="fielderr" role="alert">{t(err.consent)}</p>}
        {msg && <p className="error" role="alert">{t(msg)}</p>}
        <button className="primary" disabled={busy}>{busy ? t("loading") : t("staffSend")}</button>
        <p className="note">{t("haveAccount")} <Link to="/login">{t("submit")}</Link></p>
      </form>
    </AuthShell>
  );
}
