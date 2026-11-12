import { createContext, useContext, useEffect, useState } from "react";
import { messages } from "./i18n.js";

const Ctx = createContext();
export const usePrefs = () => useContext(Ctx);

export function Prefs({ children }) {
  const [lang, setLang] = useState(localStorage.getItem("lang") || "bn"); // Bangla first
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "dark"); // dark default
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lang", lang);
    localStorage.setItem("theme", theme);
  }, [lang, theme]);
  const t = (k) => messages[lang][k] ?? k;
  return <Ctx.Provider value={{ lang, setLang, theme, setTheme, t }}>{children}</Ctx.Provider>;
}
