import { useState } from "react";
import { createUser, getUsers, userAction } from "../../api.js";
import { serverErrors, useApi, validPhone, normDigits } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { useSession } from "../../session.jsx";
import { Loaded } from "../../components/ui.jsx";
import { Field, Select } from "../../components/TraitInputs.jsx";

const ROLES = ["family", "police", "medical", "officer", "admin", "auditor"];

function NewUser({ onDone }) {
  const { t } = usePrefs();
  const blank = { full_name: "", phone: "", email: "", role: "officer", organization: "", designation: "", password: "" };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState({});
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setOk(false); };
  const submit = async (e) => {
    e.preventDefault();
    const x = {};
    if (!f.full_name.trim()) x.full_name = "e_name";
    if (!validPhone(f.phone)) x.phone = "e_phone";
    if (f.password.length < 8) x.password = "e_pw";
    setErr(x);
    if (Object.keys(x).length) return;
    try {
      await createUser({ ...f, phone: normDigits(f.phone) });
      setF(blank); setOk(true); onDone();
    } catch (x2) {
      if (x2.code === "validation") {
        const se = serverErrors(x2.fields);
        if (se.phone === "err_exists") se.phone = "phoneExists";
        if (se.password) se.password = "e_pw";
        setErr(se);
      }
    }
  };
  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h2>{t("createStaff")}</h2>
      <p className="muted small">{t("createStaffHelp")}</p>
      <div className="grid2">
        <div><Select id="nrole" label={t("s_role")} value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLES.slice(1)} prefix="role_" blank="" /></div>
        <div><Field id="nname" label={t("fullName")} error={err.full_name}><input id="nname" value={f.full_name} onChange={set("full_name")} /></Field></div>
        <div><Field id="nphone" label={t("phone")} error={err.phone}><input id="nphone" inputMode="tel" value={f.phone} onChange={set("phone")} /></Field></div>
        <div><Field id="nemail" label={t("email")}><input id="nemail" type="email" value={f.email} onChange={set("email")} /></Field></div>
        <div><Field id="norg" label={t("s_organization")}><input id="norg" value={f.organization} onChange={set("organization")} /></Field></div>
        <div><Field id="ndes" label={t("s_designation")}><input id="ndes" value={f.designation} onChange={set("designation")} /></Field></div>
        <div><Field id="npw" label={t("tempPassword")} error={err.password}><input id="npw" type="text" autoComplete="off" value={f.password} onChange={set("password")} /></Field></div>
      </div>
      {ok && <p className="success" role="status">{t("userCreated")}</p>}
      <button className="primary inline mt">{t("create")}</button>
    </form>
  );
}

export default function AdminUsers() {
  const { t, dateTime } = usePrefs();
  const { user: meUser } = useSession();
  const [role, setRole] = useState("");
  const [query, setQuery] = useState("");
  const [typed, setTyped] = useState("");
  const q = useApi(() => getUsers(role, query), [role, query]);
  const act = (id, a) => userAction(id, a).then(q.reload).catch(() => {});
  return (
    <>
      <h1 className="hero">{t("nav_users")}</h1>
      <NewUser onDone={q.reload} />
      <form className="searchbar mt" role="search" onSubmit={(e) => { e.preventDefault(); setQuery(typed); }}>
        <label htmlFor="uq" className="sr">{t("search")}</label>
        <input id="uq" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("searchUsersPh")} />
        <label htmlFor="urole" className="sr">{t("s_role")}</label>
        <select id="urole" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">{t("allRoles")}</option>
          {ROLES.map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}
        </select>
        <button className="primary inline">{t("search")}</button>
      </form>
      <Loaded q={q}>{(users) => (
        <div className="panel tablewrap">
          <table className="datatable">
            <thead><tr><th>{t("fullName")}</th><th>{t("s_role")}</th><th>{t("phone")}</th><th>{t("s_organization")}</th><th>{t("lastLogin")}</th><th>{t("status")}</th><th><span className="sr">{t("actions")}</span></th></tr></thead>
            <tbody>
              {users.map((u) => {
                const locked = u.locked_until && new Date(u.locked_until) > new Date();
                const waiting = !u.is_active && !u.approved_at && u.role !== "family";
                return (
                  <tr key={u.id}>
                    <td>{u.full_name || "—"}</td><td>{t(`role_${u.role}`)}</td><td>{u.phone}</td><td>{u.organization}</td>
                    <td>{u.last_login ? dateTime(u.last_login) : "—"}</td>
                    <td>{waiting ? t("waiting") : u.is_active ? (locked ? t("locked_short") : t("active")) : t("inactive")}</td>
                    <td className="actions">
                      {waiting && <button className="ghost" onClick={() => act(u.id, "approve")}>{t("approve")}</button>}
                      {!waiting && u.is_active && u.id !== meUser.id && <button className="ghost danger" onClick={() => act(u.id, "deactivate")}>{t("deactivate")}</button>}
                      {!waiting && !u.is_active && <button className="ghost" onClick={() => act(u.id, "activate")}>{t("activate")}</button>}
                      {locked && <button className="ghost" onClick={() => act(u.id, "unlock")}>{t("unlock")}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}</Loaded>
    </>
  );
}
