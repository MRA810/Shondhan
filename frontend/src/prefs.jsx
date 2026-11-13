import { createContext, useContext, useEffect, useState } from "react";
import { messages } from "./i18n.js";

const Ctx = createContext();
export const usePrefs = () => useContext(Ctx);

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

export function Prefs({ children }) {
  const [lang, setLang] = useState(localStorage.getItem("lang") || "bn"); // Bangla first
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark"); // dark default
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lang", lang);
    localStorage.setItem("theme", theme);
  }, [lang, theme]);

  // t("key") or t("key", { name: "Rahim" }) fills {name} in the message
  const t = (k, vars) => {
    const m = messages[lang][k] ?? k;
    return vars ? m.replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? "") : m;
  };
  const num = (n) => (lang === "bn" ? String(n).replace(/\d/g, (d) => BN_DIGITS[d]) : String(n));
  const locale = lang === "bn" ? "bn-BD" : "en-GB";
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "");
  const dateTime = (iso) =>
    iso ? new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

  return <Ctx.Provider value={{ lang, setLang, theme, setTheme, t, num, date, dateTime }}>{children}</Ctx.Provider>;
}
