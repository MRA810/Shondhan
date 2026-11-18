import { usePrefs } from "../prefs.jsx";
import { Toggles } from "../components/ui.jsx";

export default function AuthShell({ children }) {
  const { t } = usePrefs();
  return (
    <div className="page">
      <Toggles />
      <div className="split">
        <section>
          <h1 className="brand">{t("brand")}</h1>
          <p className="tagline">{t("tagline")}</p>
        </section>
        <main>{children}</main>
      </div>
    </div>
  );
}
