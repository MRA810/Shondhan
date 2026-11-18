import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { login } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import { HOME } from "../session.jsx";
import AuthShell from "./AuthShell.jsx";

export default function Login() {
  const { t } = usePrefs();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const as = ["police", "medical", "staff"].includes(params.get("as")) ? params.get("as") : "";
  const [ident, setIdent] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!ident.trim() || !pw) return setErr("required");
    setBusy(true); setErr("");
    try {
      const d = await login(ident.trim(), pw);
      nav(HOME[d.user.role] || "/", { replace: true });
    } catch (x) {
      setErr(["invalid", "locked", "pending"].includes(x.code) ? x.code : "network");
    } finally { setBusy(false); }
  };

  return (
    <AuthShell>
      <form className="glass" onSubmit={submit} noValidate>
        <h2>{as ? t(`login_${as}`) : t("loginTitle")}</h2>
        {as && <p className="note">{t("login_staffHint")}</p>}
        <label htmlFor="ident">{t("id")}</label>
        <input id="ident" autoComplete="username" inputMode="email" placeholder={t("idHint")} value={ident} onChange={(e) => setIdent(e.target.value)} />
        <label htmlFor="pw">{t("pw")}</label>
        <div className="pwrow">
          <input id="pw" type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="button" className="chip" onClick={() => setShow(!show)} aria-pressed={show}>{show ? t("hide") : t("show")}</button>
        </div>
        <p className="note right"><Link to="/forgot">{t("forgotQ")}</Link></p>
        {err && <p className="error" role="alert">{t(err)}</p>}
        <button className="primary" disabled={busy}>{busy ? t("loading") : t("submit")}</button>
        {as ? (
          as === "staff" ? <p className="note">{t("au_staffNote")}</p>
            : <p className="note">{t("login_noStaff")} <Link to={`/signup/staff?role=${as}`}>{t("wl_staffApply")}</Link></p>
        ) : (
          <>
            <p className="note">{t("noAccount")} <Link to="/report">{t("reportBtn")}</Link></p>
            <p className="note">{t("staffQ")} <Link to="/authority">{t("au_title")}</Link></p>
          </>
        )}
        <p className="note">{as ? <Link to="/authority">← {t("au_title")}</Link> : <Link to="/">← {t("backHome")}</Link>}</p>
      </form>
    </AuthShell>
  );
}
