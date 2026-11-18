import { Link } from "react-router-dom";
import { usePrefs } from "../../prefs.jsx";
import { Toggles } from "../../components/ui.jsx";

// Step 2: one big page that says what is needed, then a large Start button.
export function StartContent({ to, guest }) {
  const { t } = usePrefs();
  const needs = ["st_need1", "st_need2", "st_need3", guest && "st_need4"].filter(Boolean);
  return (
    <section className="panel startpage">
      <h1>{t("newCaseTitle")}</h1>
      <p className="big">{t("st_lead")}</p>
      <h2>{t("st_needTitle")}</h2>
      <ul className="needs">{needs.map((k) => <li key={k}>{t(k)}</li>)}</ul>
      <p className="muted">{t("st_time")}</p>
      <p className="warn">{t("st_privacy")}</p>
      <Link to={to} className="primary hugebtn">{t("st_start")}</Link>
      {guest && <p className="note center">{t("haveAccount")} <Link to="/login">{t("submit")}</Link></p>}
    </section>
  );
}

export default function ReportStart() {
  return (
    <div className="page">
      <Toggles />
      <main className="guestmain"><StartContent to="/report/steps?s=1" guest /></main>
    </div>
  );
}
