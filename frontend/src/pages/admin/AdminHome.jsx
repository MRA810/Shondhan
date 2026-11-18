import { useState } from "react";
import { Link } from "react-router-dom";
import { getAdminSummary, rejectUser, userAction } from "../../api.js";
import { useApi } from "../../hooks.js";
import { usePrefs } from "../../prefs.jsx";
import { Loaded } from "../../components/ui.jsx";

function PendingRow({ u, onDone }) {
  const { t, dateTime } = usePrefs();
  const [busy, setBusy] = useState(false);
  const act = async (fn) => { setBusy(true); try { await fn(); onDone(); } catch { setBusy(false); } };
  return (
    <li className="panel card">
      <h3>{u.organization}</h3>
      <p>{t(`role_${u.role}`)} · {u.full_name} · {u.designation}</p>
      <p className="small">{t("s_staff_id")}: {u.staff_id} · {u.phone}{u.email && ` · ${u.email}`} · {u.division && t(`div_${u.division}`)}</p>
      <p className="small muted">{t("requestedOn", { date: dateTime(u.date_joined) })}</p>
      <p className="small">{t("verifyHint")}</p>
      <div className="row">
        <button className="primary inline" disabled={busy} onClick={() => act(() => userAction(u.id, "approve"))}>{t("approve")}</button>
        <button className="ghost danger" disabled={busy} onClick={() => act(() => rejectUser(u.id))}>{t("reject")}</button>
      </div>
    </li>
  );
}

export default function AdminHome() {
  const { t, num } = usePrefs();
  const q = useApi(getAdminSummary);
  return (
    <Loaded q={q}>{(d) => (
      <>
        <div className="hero"><h1>{t("adminTitle")}</h1><p className="muted">{t("adminLead")}</p></div>
        <div className="stats four">
          {[["cases", "stat_cases"], ["records", "stat_records"], ["pending_matches", "st_pending"], ["reunited", "stat_reunited"]].map(([k, l]) => (
            <div key={k} className="panel stat"><b>{num(d.counts[k])}</b><span>{t(l)}</span></div>
          ))}
        </div>
        <div className="sec"><h2>{t("pendingStaff")}</h2></div>
        {d.pending.length === 0 ? <p className="panel empty muted">{t("noPending")}</p> : (
          <ul className="cards plainlist">{d.pending.map((u) => <PendingRow key={u.id} u={u} onDone={q.reload} />)}</ul>
        )}
        <div className="sec"><h2>{t("activeUsers")}</h2><Link className="link" to="/admin/users">{t("manageUsers")}</Link></div>
        <div className="panel">
          <ul className="rolecounts">
            {["family", "police", "medical", "officer", "admin", "auditor"].map((r) => (
              <li key={r}><b>{num(d.roles[r] || 0)}</b> {t(`role_${r}`)}</li>
            ))}
          </ul>
          <p className="small muted">{t("mergedTotal", { n: d.counts.merges })} · {t("matchesTotal", { n: d.counts.matches })}</p>
        </div>
      </>
    )}</Loaded>
  );
}
