import { createContext, useContext, useEffect, useState } from "react";
import { messages } from "./i18n.js";

const Ctx = createContext();
export const usePrefs = () => useContext(Ctx);

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };

export function Prefs({ children }) {
  const [lang, setLang] = useState(read("lang", "bn")); // Bangla first
  const [theme, setTheme] = useState(read("theme", "dark")); // dark default
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("lang", lang); localStorage.setItem("theme", theme); } catch { /* private mode */ }
  }, [lang, theme]);

  const num = (n) => (n == null ? "" : lang === "bn" ? String(n).replace(/\d/g, (d) => BN_DIGITS[d]) : String(n));
  // t("key") or t("key", { name: "Rahim" }) fills {name} in the message; numbers use Bangla digits in Bangla.
  const t = (k, vars) => {
    const m = messages[lang][k] ?? messages.en[k] ?? k;
    return vars ? m.replace(/\{(\w+)\}/g, (_, v) => (typeof vars[v] === "number" ? num(vars[v]) : vars[v] ?? "")) : m;
  };
  const locale = lang === "bn" ? "bn-BD" : "en-GB";
  const date = (iso) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "");
  const dateTime = (iso) =>
    iso ? new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";

  return <Ctx.Provider value={{ lang, setLang, theme, setTheme, t, num, date, dateTime }}>{children}</Ctx.Provider>;
}
