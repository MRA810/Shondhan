import { useState } from "react";
import { getAudit } from "../../api.js";
import { useApi } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { Loaded } from "../../components/ui.jsx";

const ROLES = ["family", "police", "medical", "officer", "admin", "auditor"];
const TARGETS = ["case", "record", "match", "merge", "user"];

// Append-only ledger: who created, viewed, changed or deleted what.
export default function AuditLog() {
  const { t, num, dateTime } = usePrefs();
  const [p, setP] = useState({ action: "", actor_role: "", target_type: "", target_id: "", page: 1 });
  const q = useApi(() => getAudit(Object.fromEntries(Object.entries(p).filter(([, v]) => v !== ""))), [JSON.stringify(p)]);
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value, page: 1 });
  const detail = (d) => Object.entries(d || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" · ");
  return (
    <>
      <div className="hero"><h1>{t("auditTitle")}</h1><p className="muted">{t("auditLead")}</p></div>
      <div className="panel filtersgrid">
        <div><label htmlFor="fa">{t("a_action")}</label>
          <select id="fa" value={p.action} onChange={set("action")}><option value="">{t("all")}</option>
            {(q.data?.actions || []).map((a) => <option key={a} value={a}>{t(`act_${a}`)}</option>)}</select></div>
        <div><label htmlFor="fr">{t("s_role")}</label>
          <select id="fr" value={p.actor_role} onChange={set("actor_role")}><option value="">{t("all")}</option>
            {ROLES.map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}</select></div>
        <div><label htmlFor="ft">{t("a_target")}</label>
          <select id="ft" value={p.target_type} onChange={set("target_type")}><option value="">{t("all")}</option>
            {TARGETS.map((x) => <option key={x} value={x}>{t(`tt_${x}`)}</option>)}</select></div>
        <div><label htmlFor="fi">{t("a_targetId")}</label><input id="fi" inputMode="numeric" value={p.target_id} onChange={set("target_id")} /></div>
      </div>
      <Loaded q={q}>{(d) => (
        <>
          <p className="muted mt">{t("auditTotal", { n: d.total })}</p>
          <div className="panel tablewrap">
            <table className="datatable">
              <thead><tr><th>{t("a_when")}</th><th>{t("a_who")}</th><th>{t("a_action")}</th><th>{t("a_target")}</th><th>{t("a_detail")}</th><th>IP</th></tr></thead>
              <tbody>
                {d.items.map((a) => (
                  <tr key={a.id}>
                    <td>{dateTime(a.at)}</td>
                    <td>{a.who || "—"}{a.role && <span className="block small muted">{t(`role_${a.role}`)}</span>}</td>
                    <td>{t(`act_${a.action}`)}</td>
                    <td>{a.target_type ? `${t(`tt_${a.target_type}`)} #${num(a.target_id)}` : "—"}</td>
                    <td className="small">{detail(a.detail)}</td>
                    <td className="small">{a.ip || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row pager">
            <button className="ghost" disabled={d.page <= 1} onClick={() => setP({ ...p, page: d.page - 1 })}>{t("prev")}</button>
            <span>{t("pageOf", { a: d.page, b: d.pages })}</span>
            <button className="ghost" disabled={d.page >= d.pages} onClick={() => setP({ ...p, page: d.page + 1 })}>{t("nextPage")}</button>
          </div>
        </>
      )}</Loaded>
    </>
  );
}
