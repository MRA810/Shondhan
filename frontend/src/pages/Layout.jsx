import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import { Session, useSession } from "../session.jsx";
import Toggles from "./Toggles.jsx";

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  bell: "M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 004 0",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8M4 21a8 8 0 0116 0",
};

function Shell() {
  const { t, num } = usePrefs();
  const { user, summary, status, errorCode, retry } = useSession();
  const nav = useNavigate();
  const unread = summary?.stats.unread || 0;
  const tab = ({ isActive }) => "tab" + (isActive ? " active" : "");

  return (
    <div className="shell">
      <header className="topbar panel">
        <Link to="/dashboard" className="logo">{t("brand")}</Link>
        <nav className="tabs" aria-label={t("brand")}>
          <NavLink to="/dashboard" className={tab}><Icon d={ICONS.home} />{t("navHome")}</NavLink>
          <NavLink to="/notifications" className={tab}>
            <Icon d={ICONS.bell} />{t("navNotif")}
            {unread > 0 && <span className="badge" aria-label={`${unread}`}>{num(unread)}</span>}
          </NavLink>
          <NavLink to="/profile" className={tab}><Icon d={ICONS.user} />{t("navProfile")}</NavLink>
        </nav>
        <div className="topright">
          <Toggles />
          <button className="chip" onClick={() => { clearToken(); nav("/login"); }}>{t("logout")}</button>
        </div>
      </header>

      <main className="content">
        {status === "loading" && <p className="muted center" role="status">{t("loading")}</p>}
        {status === "error" && (
          <div className="panel empty" role="alert">
            <p>{t("loadFail")}</p>
            {errorCode && <p className="muted">({errorCode})</p>}
            <button className="ghost" onClick={retry}>{t("retry")}</button>
          </div>
        )}
        {status === "ready" && user.role !== "family" && <div className="panel empty"><p>{t("staffOnly")}</p></div>}
        {status === "ready" && user.role === "family" && <Outlet />}
      </main>
    </div>
  );
}

// Wraps every private page: one login check, one data load, one header.
export default function Layout() {
  return <Session><Shell /></Session>;
}
