import { useEffect, useState } from "react";
import { getNotifications, markRead } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import { useSession } from "../session.jsx";

// One line of text + time for a notification. Shared with the dashboard preview.
export function NotificationText({ n }) {
  const { t, num, dateTime } = usePrefs();
  const text =
    n.kind === "match" ? t("n_match", { name: n.case_name, pct: num(n.score) })
    : n.kind === "officer" ? t("n_officer", { name: n.case_name })
    : t("n_system");
  return (
    <>
      <span className="dot" aria-hidden="true" />
      <span className="grow">
        {!n.is_read && <span className="pill hot">{t("newTag")}</span>} {text}
        <span className="muted block">{dateTime(n.created_at)}</span>
      </span>
    </>
  );
}

export default function Notifications() {
  const { t } = usePrefs();
  const { reload } = useSession();
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = () => getNotifications().then((d) => { setItems(d); setFailed(false); }).catch(() => setFailed(true));
  useEffect(() => { load(); }, []);

  async function readAll() {
    try { await markRead(); await load(); reload(); } catch { setFailed(true); }
  }

  const hasUnread = items?.some((n) => !n.is_read);
  return (
    <>
      <div className="sec">
        <h1>{t("notifTitle")}</h1>
        {hasUnread && <button className="ghost" onClick={readAll}>{t("markAll")}</button>}
      </div>
      {failed && <p className="error" role="alert">{t("loadFail")}</p>}
      {items === null && !failed && <p className="muted" role="status">{t("loading")}</p>}
      {items?.length === 0 && <div className="panel empty"><p>{t("noNotif")}</p></div>}
      {items?.length > 0 && (
        <ul className="notifs panel">
          {items.map((n) => (
            <li key={n.id} className={n.is_read ? "" : "unread"}><NotificationText n={n} /></li>
          ))}
        </ul>
      )}
    </>
  );
}
