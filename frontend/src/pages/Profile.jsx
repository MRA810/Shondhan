import { useState } from "react";
import { updateProfile } from "../api.js";
import { serverErrors, validPhone } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";
import { useSession } from "../session.jsx";
import { DIVISIONS, RELATIONS } from "../traits.js";
import { Field, Select } from "../components/TraitInputs.jsx";

export default function Profile() {
  const { t } = usePrefs();
  const { user, setUser } = useSession();
  const family = user.role === "family";
  const [f, setF] = useState({
    full_name: user.full_name || "", email: user.email || "", age: user.age ?? "", relationship: user.relationship || "",
    alt_phone: user.alt_phone || "", division: user.division || "", address: user.address || "", designation: user.designation || "",
  });
  const [err, setErr] = useState({});
  const [state, setState] = useState("");
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setState(""); };

  const save = async (e) => {
    e.preventDefault();
    const x = {};
    if (!f.full_name.trim()) x.full_name = "e_name";
    if (f.alt_phone && !validPhone(f.alt_phone)) x.alt_phone = "e_phone";
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) x.email = "e_email";
    if (family && (Number(f.age) < 18 || Number(f.age) > 120)) x.age = "e_age";
    setErr(x);
    if (Object.keys(x).length) return;
    setState("busy");
    const body = { full_name: f.full_name, email: f.email, alt_phone: f.alt_phone, division: f.division, address: f.address };
    if (family) Object.assign(body, { age: Number(f.age), relationship: f.relationship });
    else body.designation = f.designation;
    try {
      setUser(await updateProfile(body));
      setState("saved");
    } catch (x2) {
      if (x2.code === "validation") {
        const se = serverErrors(x2.fields);
        if (se.email === "err_exists") se.email = "emailExists";
        setErr(se);
      }
      setState(x2.code === "validation" ? "" : "error");
    }
  };

  return (
    <form className="panel formwide" onSubmit={save} noValidate>
      <h1>{t("profileTitle")}</h1>
      <label htmlFor="pphone">{t("phone")}</label>
      <input id="pphone" value={user.phone || ""} disabled aria-describedby="pphone-hint" />
      <p className="hint" id="pphone-hint">{t("fixedPhone")}</p>
      {!family && (
        <>
          <label htmlFor="porg">{t("s_organization")}</label>
          <input id="porg" value={user.organization || ""} disabled />
        </>
      )}
      <Field id="full_name" label={t("fullName")} error={err.full_name}><input id="full_name" value={f.full_name} onChange={set("full_name")} /></Field>
      <Field id="email" label={t("email")} error={err.email}><input id="email" type="email" value={f.email} onChange={set("email")} /></Field>
      {family ? (
        <div className="grid2">
          <div><Field id="age" label={t("age")} error={err.age}><input id="age" inputMode="numeric" value={f.age} onChange={set("age")} /></Field></div>
          <div><Select id="rel" label={t("relationDefault")} value={f.relationship} onChange={(v) => setF({ ...f, relationship: v })} options={RELATIONS} prefix="rel_" /></div>
        </div>
      ) : (
        <Field id="designation" label={t("s_designation")}><input id="designation" value={f.designation} onChange={set("designation")} /></Field>
      )}
      <h2 className="gap">{t("contactInfo")}</h2>
      <Field id="alt_phone" label={t("altPhone")} error={err.alt_phone}><input id="alt_phone" inputMode="tel" value={f.alt_phone} onChange={set("alt_phone")} /></Field>
      <Select id="division" label={t("divisionOpt")} value={f.division} onChange={(v) => { setF({ ...f, division: v }); setState(""); }} options={DIVISIONS} prefix="div_" />
      <Field id="address" label={t("address")}><textarea id="address" rows={2} maxLength={200} value={f.address} onChange={set("address")} /></Field>
      {state === "saved" && <p className="success" role="status">{t("saved")}</p>}
      {state === "error" && <p className="error" role="alert">{t("network")}</p>}
      <button className="primary" disabled={state === "busy"}>{state === "busy" ? t("loading") : t("save")}</button>
    </form>
  );
}
