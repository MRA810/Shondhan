import { useState } from "react";
import { updateProfile } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import { useSession } from "../session.jsx";

const RELS = ["parent", "spouse", "child", "sibling", "relative", "friend", "other"];
const DIVS = ["dhaka", "chattogram", "rajshahi", "khulna", "barishal", "sylhet", "rangpur", "mymensingh"];
const BN = "০১২৩৪৫৬৭৮৯";
const norm = (s) => s.replace(/[০-৯]/g, (d) => BN.indexOf(d));

export default function Profile() {
  const { t, num } = usePrefs();
  const { user, setUser, reload } = useSession();
  const [f, setF] = useState({
    full_name: user.full_name || "", email: user.email || "", age: user.age ?? "", relationship: user.relationship || "",
    alt_phone: user.alt_phone || "", division: user.division || "", address: user.address || "",
  });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setOk(false); setF({ ...f, [k]: e.target.value }); };

  function check() {
    if (!f.full_name.trim()) return "e_name";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return "e_email";
    const age = parseInt(norm(String(f.age)), 10);
    if (!age || age < 18) return "e_age";
    if (!f.relationship) return "e_rel";
    if (f.alt_phone && !/^01\d{9}$/.test(norm(f.alt_phone.trim()))) return "e_phone";
    return "";
  }

  function serverError(fields = {}) {
    const m = (k) => (fields[k] || []).join(" ");
    if (m("email")) return m("email").includes("exists") ? "emailExists" : "e_email";
    if (m("age")) return "e_age";
    if (m("alt_phone")) return "e_phone";
    if (m("full_name")) return "e_name";
    return "network";
  }

  async function submit(e) {
    e.preventDefault();
    const x = check(); setErr(x); setOk(false); if (x) return;
    setBusy(true);
    try {
      const saved = await updateProfile({
        full_name: f.full_name.trim(), email: f.email.trim(), age: parseInt(norm(String(f.age)), 10),
        relationship: f.relationship, alt_phone: norm(f.alt_phone.trim()), division: f.division, address: f.address.trim(),
      });
      setUser(saved); reload(); setOk(true);
      setF((p) => ({ ...p, alt_phone: saved.alt_phone, address: saved.address }));  // show what the server stored
    } catch (x) {
      setErr(x.code === "validation" ? serverError(x.fields) : "network");
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="sec"><h1>{t("profileTitle")}</h1></div>
      <form className="panel formwide" onSubmit={submit} noValidate>
        <h2>{t("step1")}</h2>
        <label htmlFor="pn">{t("fullName")}</label>
        <input id="pn" value={f.full_name} onChange={set("full_name")} autoComplete="name" />
        <label htmlFor="pp">{t("phone")}</label>
        <input id="pp" value={num(user.phone || "")} disabled aria-describedby="pph" />
        <p className="note" id="pph">{t("fixedPhone")}</p>
        <label htmlFor="pe">{t("email")}</label>
        <input id="pe" value={f.email} onChange={set("email")} inputMode="email" autoComplete="email" />
        <label htmlFor="pa">{t("age")}</label>
        <input id="pa" value={f.age} onChange={set("age")} inputMode="numeric" />
        <label htmlFor="pr">{t("relation")}</label>
        <select id="pr" value={f.relationship} onChange={set("relationship")}>
          <option value="">{t("choose")}</option>
          {RELS.map((r) => <option key={r} value={r}>{t("rel_" + r)}</option>)}
        </select>

        <h2 className="gap">{t("contactInfo")}</h2>
        <label htmlFor="pap">{t("altPhone")}</label>
        <input id="pap" value={f.alt_phone} onChange={set("alt_phone")} placeholder={t("idHint")} inputMode="tel" autoComplete="tel" />
        <label htmlFor="pd">{t("division")}</label>
        <select id="pd" value={f.division} onChange={set("division")}>
          <option value="">{t("choose")}</option>
          {DIVS.map((d) => <option key={d} value={d}>{t("div_" + d)}</option>)}
        </select>
        <label htmlFor="pad">{t("address")}</label>
        <input id="pad" value={f.address} onChange={set("address")} autoComplete="street-address" />

        {err && <p className="error" role="alert">{t(err)}</p>}
        {ok && <p className="success" role="status">{t("saved")}</p>}
        <button className="primary" disabled={busy}>{busy ? t("loading") : t("save")}</button>
      </form>
    </>
  );
}
