import { useState } from "react";
import { Link } from "react-router-dom";
import { resetPassword } from "../api.js";
import { normDigits, serverErrors, validPhone } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";
import OtpField from "../components/OtpField.jsx";
import { Field } from "../components/TraitInputs.jsx";
import AuthShell from "./AuthShell.jsx";

export default function Forgot() {
  const { t } = usePrefs();
  const [f, setF] = useState({ phone: "", otp: "", password: "", password2: "" });
  const [err, setErr] = useState({});
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const x = {};
    if (!validPhone(f.phone)) x.phone = "e_phone";
    if (f.otp.length !== 6) x.otp = "e_otp";
    if (f.password.length < 8) x.password = "e_pw";
    if (f.password !== f.password2) x.password2 = "e_pwMatch";
    setErr(x);
    if (Object.keys(x).length) return;
    setBusy(true); setMsg("");
    try {
      await resetPassword({ phone: normDigits(f.phone).replace(/[\s-]/g, ""), otp: f.otp, password: f.password });
      setDone(true);
    } catch (x2) {
      if (x2.code === "validation") {
        const se = serverErrors(x2.fields);
        if (x2.fields.otp) se.otp = `err_${x2.fields.otp[0]}`;
        if (se.password) se.password = "e_pw";
        setErr(se);
      } else setMsg("network");
    } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      {done ? (
        <div className="glass">
          <h2>{t("fp_doneTitle")}</h2>
          <p>{t("fp_done")}</p>
          <Link className="primary" to="/login">{t("loginTitle")}</Link>
        </div>
      ) : (
        <form className="glass" onSubmit={submit} noValidate>
          <h2>{t("fp_title")}</h2>
          <p className="note">{t("fp_lead")}</p>
          <Field id="phone" label={t("phone")} error={err.phone}>
            <input id="phone" inputMode="tel" autoComplete="tel" placeholder={t("idHint")} value={f.phone} onChange={set("phone")} aria-invalid={!!err.phone} />
          </Field>
          <OtpField phone={f.phone} purpose="reset" value={f.otp} onChange={(v) => setF({ ...f, otp: v })} error={err.otp} />
          <Field id="password" label={t("fp_new")} hint={t("pwHint")} error={err.password}>
            <input id="password" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} aria-invalid={!!err.password} />
          </Field>
          <Field id="password2" label={t("pw2")} error={err.password2}>
            <input id="password2" type="password" autoComplete="new-password" value={f.password2} onChange={set("password2")} aria-invalid={!!err.password2} />
          </Field>
          {msg && <p className="error" role="alert">{t(msg)}</p>}
          <button className="primary" disabled={busy}>{busy ? t("loading") : t("fp_save")}</button>
          <p className="note"><Link to="/login">{t("back")}</Link></p>
        </form>
      )}
    </AuthShell>
  );
}
