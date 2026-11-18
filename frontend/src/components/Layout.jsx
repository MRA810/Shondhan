import { useEffect } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { usePrefs } from "../prefs.jsx";
import { HOME, useSession } from "../session.jsx";
import { Icon, Loading, Toggles } from "./ui.jsx";
import Toasts from "./Toasts.jsx";

// Page links per role. The "add" action and the bell are shown separately so they stand out.
const NAV = {
  family: [["/dashboard", "home", "nav_home"], ["/profile", "user", "nav_profile"]],
  medical: [["/reporter", "home", "nav_home"], ["/profile", "user", "nav_profile"]],
  police: [["/reporter", "home", "nav_home"], ["/reports", "search", "nav_cases"], ["/profile", "user", "nav_profile"]],
  officer: [["/officer", "list", "nav_queue"], ["/reports", "search", "nav_cases"], ["/officer/records", "file", "nav_records"], ["/profile", "user", "nav_profile"]],
  admin: [["/admin", "home", "nav_overview"], ["/admin/users", "users", "nav_users"], ["/officer", "list", "nav_queue"], ["/audit", "shield", "nav_audit"], ["/profile", "user", "nav_profile"]],
  auditor: [["/audit", "shield", "nav_audit"], ["/profile", "user", "nav_profile"]],
};
const ADD = { family: ["/cases/new", "nav_report"], police: ["/records/new", "nav_newRecord"], medical: ["/records/new", "nav_newRecord"] };

function Bell({ unread, compact }) {
  const { t, num } = usePrefs();
  return (
    <NavLink to="/notifications" className={({ isActive }) => `bell-btn ${unread ? "has" : ""} ${isActive ? "active" : ""} ${compact ? "tab" : ""}`}
      aria-label={unread ? `${t("nav_alerts")}: ${t("unreadN", { n: unread })}` : t("nav_alerts")}>
      <span className="bell-ico"><Icon name="bell" />{unread > 0 && <span className="bell-count">{num(unread > 99 ? 99 : unread)}</span>}</span>
      <span className="bell-label">{t("nav_alerts")}</span>
    </NavLink>
  );
}

export default function Layout() {
  const { t } = usePrefs();
  const { status, user, unread, refreshUnread, retry, logout } = useSession();
  const loc = useLocation();
  useEffect(() => { if (status === "ready") refreshUnread(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  // the unread count in the browser tab title too
  useEffect(() => { document.title = `${unread ? `(${unread}) ` : ""}${t("brand")} · Shondhan`; }, [unread, t]);

  if (status === "loading") return <div className="page"><Loading /></div>;
  if (status === "error") {
    return (
      <div className="page"><div className="panel center" role="alert">
        <p>{t("loadFail")}</p><button className="ghost" onClick={retry}>{t("retry")}</button>
      </div></div>
    );
  }
  const links = NAV[user.role];
  const add = ADD[user.role];
  const linkCls = ({ isActive }) => (isActive ? "tab active" : "tab");
  return (
    <div className="app">
      <a className="skip" href="#main">{t("skip")}</a>
      <header className="navbar">
        <div className="navinner">
          <Link to={HOME[user.role]} className="logo"><span className="logomark"><Icon name="search" /></span>{t("brand")}</Link>
          <nav className="navlinks" aria-label={t("mainNav")}>
            {links.map(([to, icon, label]) => (
              <NavLink key={to} to={to} end className={linkCls}><Icon name={icon} /><span>{t(label)}</span></NavLink>
            ))}
          </nav>
          <div className="navactions">
            {add && <NavLink to={add[0]} className="addbtn"><Icon name="plus" /><span>{t(add[1])}</span></NavLink>}
            <Bell unread={unread} />
            <Toggles />
            <span className="userchip" title={user.organization || ""}><b>{user.full_name}</b><small>{t(`role_${user.role}`)}</small></span>
            <button className="logoutbtn" onClick={() => logout()}><Icon name="logout" /><span>{t("logout")}</span></button>
          </div>
        </div>
      </header>

      {/* phones: big buttons at the bottom; "add" is the raised centre button */}
      <nav className="tabbar" aria-label={t("mainNav")}>
        {links.slice(0, 1).map(([to, icon, label]) => (
          <NavLink key={to} to={to} end className={linkCls}><Icon name={icon} /><span>{t(label)}</span></NavLink>
        ))}
        {links.slice(1, add ? 2 : 3).map(([to, icon, label]) => (
          <NavLink key={to} to={to} end className={linkCls}><Icon name={icon} /><span>{t(label)}</span></NavLink>
        ))}
        {add && <NavLink to={add[0]} className="tab addtab"><span className="addcircle"><Icon name="plus" /></span><span>{t(add[1])}</span></NavLink>}
        <Bell unread={unread} compact />
        {links.slice(add ? 2 : 3).map(([to, icon, label]) => (
          <NavLink key={to} to={to} end className={linkCls}><Icon name={icon} /><span>{t(label)}</span></NavLink>
        ))}
      </nav>

      <main id="main" className="content"><Outlet /></main>
      <Toasts />
    </div>
  );
}

// Lets only some roles open a page; everyone else is sent to their own home.
export function RoleRoute({ roles, children }) {
  const { user } = useSession();
  return roles.includes(user.role) ? children : <Navigate to={HOME[user.role]} replace />;
}

export function HomeRedirect() {
  const { user } = useSession();
  return <Navigate to={HOME[user.role]} replace />;
}
