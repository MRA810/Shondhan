import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, setToken } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import Toggles from "./Toggles.jsx";

export default function Login() {
  const { t } = usePrefs();
  const nav = useNavigate();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!id.trim() || !pw) return setErr("required");
    setBusy(true); setErr("");
    try {
      const data = await login(id.trim(), pw);
      setToken(data.access);
      nav("/dashboard");
    } catch (x) {
      setErr(x.code || "network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <Toggles />
      <section className="split">
        <div className="intro">
          <h1 className="brand">{t("brand")}</h1>
          <p className="tagline">{t("tagline")}</p>
        </div>
        <form className="glass" onSubmit={onSubmit} noValidate>
          <h2>{t("loginTitle")}</h2>
          <label htmlFor="id">{t("id")}</label>
          <input id="id" value={id} onChange={(e) => setId(e.target.value)} placeholder={t("idHint")}
                 autoComplete="username" inputMode="email" />
          <label htmlFor="pw">{t("pw")}</label>
          <div className="pwrow">
            <input id="pw" type={show ? "text" : "password"} value={pw}
                   onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
            <button type="button" className="chip" onClick={() => setShow(!show)}>{show ? t("hide") : t("show")}</button>
          </div>
          {err && <p className="error" role="alert">{t(err)}</p>}
          <button className="primary" disabled={busy}>{busy ? t("loading") : t("submit")}</button>
          <p className="note">{t("staffNote")}</p>
        </form>
      </section>
    </main>
  );
}
