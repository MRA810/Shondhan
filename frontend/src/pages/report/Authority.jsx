import { Link, Navigate } from "react-router-dom";
import { getToken } from "../../api.js";
import { usePrefs } from "../../prefs.jsx";
import { Icon, Toggles } from "../../components/ui.jsx";

// "Authority login": every way in for staff, kept apart from the family pages.
export default function Authority() {
  const { t } = usePrefs();
  if (getToken()) return <Navigate to="/home" replace />;
  const groups = [
    { role: "police", icon: "shield", title: "wl_police", text: "wl_policeText", apply: true },
    { role: "medical", icon: "plus", title: "wl_doctor", text: "wl_doctorText", apply: true },
    { role: "staff", icon: "users", title: "au_staff", text: "au_staffText", apply: false },
  ];
  return (
    <div className="page">
      <div className="pagetop">
        <Link to="/" className="logo"><span className="logomark"><Icon name="search" /></span>{t("brand")}</Link>
        <Toggles />
      </div>
      <main className="guestmain wide">
        <h1 className="pagetitle">{t("au_title")}</h1>
        <p className="lead">{t("au_lead")}</p>
        <div className="authgrid">
          {groups.map((g) => (
            <section key={g.role} className="panel authcard">
              <div className="staffhead"><span className="staffico"><Icon name={g.icon} /></span><h2>{t(g.title)}</h2></div>
              <p>{t(g.text)}</p>
              <div className="authbtns">
                <Link className="primary inline" to={`/login?as=${g.role}`}>{t("wl_staffLogin")} →</Link>
                {g.apply ? <Link className="ghost" to={`/signup/staff?role=${g.role}`}>{t("wl_staffApply")}</Link>
                  : <p className="note">{t("au_staffNote")}</p>}
              </div>
            </section>
          ))}
        </div>
        <p className="note center">{t("au_family")} <Link to="/">{t("au_familyLink")}</Link></p>
      </main>
    </div>
  );
}
