import { Link, Navigate } from "react-router-dom";
import { getToken } from "../../api.js";
import { usePrefs } from "../../prefs.jsx";
import { Icon, Toggles } from "../../components/ui.jsx";

// Step 1: the visitor is welcomed. One big action: report a missing person.
export default function Welcome() {
  const { t } = usePrefs();
  if (getToken()) return <Navigate to="/home" replace />;
  return (
    <div className="page">
      <Toggles />
      <main className="welcome">
        <h1 className="brand">{t("brand")}</h1>
        <p className="tagline">{t("tagline")}</p>
        <p className="lead">{t("wl_lead")}</p>
        <Link to="/report" className="primary hugebtn">{t("reportBtn")}</Link>
        <ol className="how">
          {["wl_how1", "wl_how2", "wl_how3"].map((k, i) => (
            <li key={k} className="panel"><span className="howno">{i + 1}</span><span>{t(k)}</span></li>
          ))}
        </ol>
        <div className="row center welcomelinks">
          <span>{t("haveAccount")}</span> <Link className="ghost" to="/login">{t("wl_familyLogin")}</Link>
        </div>

        <section className="panel authstrip">
          <span className="staffico"><Icon name="shield" /></span>
          <div className="grow">
            <h2>{t("au_title")}</h2>
            <p>{t("au_strip")}</p>
          </div>
          <Link className="primary inline" to="/authority">{t("au_open")} →</Link>
        </section>
      </main>
    </div>
  );
}
