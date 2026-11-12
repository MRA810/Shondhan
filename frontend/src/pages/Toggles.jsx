import { usePrefs } from "../prefs.jsx";
export default function Toggles() {
  const { lang, setLang, theme, setTheme, t } = usePrefs();
  return (
    <div className="toggles">
      <button className="chip" onClick={() => setLang(lang === "bn" ? "en" : "bn")}>{t("lang")}</button>
      <button className="chip" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
        {theme === "dark" ? t("light") : t("dark")}
      </button>
    </div>
  );
}
