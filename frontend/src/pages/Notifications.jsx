import { Link } from "react-router-dom";
import { getNotifications, markRead } from "../api.js";
import { useApi } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";
import { useSession } from "../session.jsx";
import { Loaded } from "../components/ui.jsx";
import { notifLink, notifText } from "../components/notify.js";

export function NotifList({ items, onOpen }) {
  const { t, dateTime } = usePrefs();
  const { user } = useSession();
  if (!items.length) return <p className="empty muted">{t("noNotif")}</p>;
  return (
    <ul className="notifs">
      {items.map((n) => {
        const to = notifLink(n, user.role);
        const body = (
          <>
            <span className="dot" aria-hidden="true" />
            <span className="grow">
              {!n.is_read && <span className="sr">{t("newTag")}: </span>}
              {notifText(t, n)}
              <span className="block muted small">{dateTime(n.created_at)}</span>
            </span>
          </>
        );
        return (
          <li key={n.id} className={n.is_read ? "" : "unread"}>
            {to ? <Link to={to} onClick={() => onOpen?.(n)} className="notiflink">{body}</Link> : body}
          </li>
        );
      })}
    </ul>
  );
}

export default function Notifications() {
  const { t } = usePrefs();
  const { refreshUnread } = useSession();
  const q = useApi(getNotifications);
  const readAll = () => markRead().then(() => { q.reload(); refreshUnread(); });
  const open = (n) => { if (!n.is_read) markRead([n.id]).then(refreshUnread); };
  return (
    <>
      <div className="sec first">
        <h1>{t("notifTitle")}</h1>
        {q.data?.unread > 0 && <button className="ghost" onClick={readAll}>{t("markAll")}</button>}
      </div>
      <Loaded q={q}>{(d) => <div className="panel flush"><NotifList items={d.items} onOpen={open} /></div>}</Loaded>
    </>
  );
}
