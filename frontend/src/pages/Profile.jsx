import { useEffect, useState } from "react";
import { getProfile, saveProfile } from "../api.js";
import Shell from "../components/Shell.jsx";
import { useApi } from "../hooks.js";
import { DIVISIONS } from "../i18n.dash.js";
import { usePrefs } from "../prefs.jsx";

export default function Profile() {
  const { t } = usePrefs();
  const { data, error } = useApi(getProfile);
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setF(data); }, [data]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!f.full_name.trim()) return setErr("e_name");
    setBusy(true); setErr(""); setMsg("");
    try {
      await saveProfile({ full_name: f.full_name.trim(), email: f.email, alt_phone: f.alt_phone,
                          address: f.address, division: f.division });
      setMsg("saved");
    } catch (x) {
      const fl = x.fields || {};
      setErr(x.code !== "validation" ? "network"
        : fl.email ? (fl.email.join(" ").includes("exists") ? "emailExists" : "e_email")
        : fl.alt_phone ? "e_pphone" : "network");
    } finally { setBusy(false); }
  }

  return (
    <Shell narrow>
      <form className="glass" onSubmit={submit} noValidate>
        <h2>{t("profile")}</h2>
        {error && <p className="error" role="alert">{t(error)}</p>}
        {f && (<>
          <label htmlFor="fn">{t("fullName")}</label>
          <input id="fn" value={f.full_name} onChange={set("full_name")} autoComplete="name" />
          <label htmlFor="ph">{t("phone")}</label>
          <input id="ph" value={f.phone || ""} readOnly />
          <label htmlFor="em">{t("email")}</label>
          <input id="em" value={f.email} onChange={set("email")} inputMode="email" autoComplete="email" />
          <label htmlFor="ap">{t("altPhone")}</label>
          <input id="ap" value={f.alt_phone} onChange={set("alt_phone")} inputMode="tel" />
          <label htmlFor="dv">{t("division")}</label>
          <select id="dv" value={f.division} onChange={set("division")}>
            <option value="">{t("choose")}</option>
            {DIVISIONS.map((d) => <option key={d} value={d}>{t("div_" + d)}</option>)}
          </select>
          <label htmlFor="ad">{t("address")}</label>
          <input id="ad" value={f.address} onChange={set("address")} autoComplete="street-address" />
          {err && <p className="error" role="alert">{t(err)}</p>}
          {msg && <p className="ok" role="status">{t(msg)}</p>}
          <button className="primary" disabled={busy}>{busy ? t("loading") : t("save")}</button>
        </>)}
      </form>
    </Shell>
  );
}
