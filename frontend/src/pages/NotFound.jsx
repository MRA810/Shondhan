import { Link } from "react-router-dom";
import { usePrefs } from "../prefs.jsx";

export default function NotFound() {
  const { t } = usePrefs();
  return (
    <div className="panel center">
      <h1>{t("notFound")}</h1>
      <Link className="ghost" to="/">{t("backHome")}</Link>
    </div>
  );
}
