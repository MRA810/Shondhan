import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { clearToken, unreadCount } from "../api.js";
import { fmtNum } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";
import Toggles from "../pages/Toggles.jsx";

export default function Shell({ children, narrow }) {
  const { t, lang } = usePrefs();
  const nav = useNavigate();
  const [unread, setUnread] = useState(0);
  useEffect(() => { unreadCount().then((d) => setUnread(d.count)).catch(() => {}); }, []);
  const cls = ({ isActive }) => (isActive ? "navlink active" : "navlink");
  return (
    <main className="page">
      <header className="topbar">
        <Link to="/dashboard" className="logo">{t("brand")}</Link>
        <Toggles />
        <nav className="nav" aria-label="main">
          <NavLink to="/dashboard" end className={cls}>{t("nav_home")}</NavLink>
          <NavLink to="/report" className={cls}>{t("nav_report")}</NavLink>
          <NavLink to="/notifications" className={cls}>
            {t("nav_alerts")}{unread > 0 && <span className="badge">{fmtNum(unread, lang)}</span>}
          </NavLink>
          <NavLink to="/profile" className={cls}>{t("nav_profile")}</NavLink>
          <button className="navlink" onClick={() => { clearToken(); nav("/login"); }}>{t("logout")}</button>
        </nav>
      </header>
      <div className={narrow ? "content narrow" : "content"}>{children}</div>
    </main>
  );
}
