import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { markRead } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import { useSession } from "../session.jsx";
import { Icon } from "./ui.jsx";
import { notifLink, notifText } from "./notify.js";

const TITLE = { match: "alertTitle", verified: "alertVerifiedTitle", officer: "alertOfficerTitle", reunited: "toast_reunited",
  merge: "mergeTitle", merged: "toast_merged", approved: "toast_approved" };

function Toast({ n }) {
  const { t } = usePrefs();
  const { user, dismiss, refreshUnread } = useSession();
  const timer = useRef(null);
  const to = notifLink(n, user.role) || "/notifications";
  // stays 20 s; pointing at it or focusing it keeps it open
  const start = () => { timer.current = setTimeout(() => dismiss(n.id), 20000); };
  const stop = () => clearTimeout(timer.current);
  useEffect(() => { start(); return stop; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = () => { markRead([n.id]).then(refreshUnread).catch(() => {}); dismiss(n.id); };
  return (
    <div className={`toast kind-${n.kind}`} role="alert" onMouseEnter={stop} onMouseLeave={start} onFocus={stop} onBlur={start}>
      <span className="toast-ico" aria-hidden="true"><Icon name="bell" /></span>
      <div className="toast-body">
        <strong>{t(TITLE[n.kind] || "notifTitle")}</strong>
        <p>{notifText(t, n)}</p>
        <Link to={to} className="primary inline" onClick={open}>{t("alertSee")} →</Link>
      </div>
      <button type="button" className="toast-x" aria-label={t("close")} onClick={() => dismiss(n.id)}><Icon name="close" /></button>
    </div>
  );
}

// Pop-ups that slide in, on any page, the moment a new match or alert arrives.
export default function Toasts() {
  const { t } = usePrefs();
  const { toasts } = useSession();
  return (
    <div className="toasts" aria-live="assertive">
      {toasts.map((n) => <Toast key={n.id} n={n} />)}
      {/* phones show only the newest pop-up; this says how many more are waiting */}
      {toasts.length > 1 && <Link to="/notifications" className="toasts-more">{t("toast_more", { n: toasts.length - 1 })} →</Link>}
    </div>
  );
}
