import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPhoto } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import MarksFigure from "../body/MarksFigure.jsx";

const PATHS = {
  home: "M3 11 12 3l9 8v10h-6v-6H9v6H3z",
  plus: "M12 5v14M5 12h14",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.3-4.3",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3",
  file: "M6 2h9l5 5v15H6zM14 2v6h6",
  phone: "M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2z",
  check: "M5 12l5 5 9-11",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
  close: "M6 6l12 12M18 6 6 18",
};

export const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);

export function Toggles() {
  const { lang, setLang, theme, setTheme, t } = usePrefs();
  return (
    <div className="toggles">
      <button type="button" className="chip" onClick={() => setLang(lang === "bn" ? "en" : "bn")} lang={lang === "bn" ? "en" : "bn"}>
        {t("lang")}
      </button>
      <button type="button" className="chip" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-pressed={theme === "light"}>
        {theme === "dark" ? t("light") : t("dark")}
      </button>
    </div>
  );
}

// A private picture: fetched with the login token, shown from a blob URL.
export function Photo({ kind, id, alt, className = "thumb" }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    setSrc("");
    if (id) getPhoto(kind, id).then((u) => live && setSrc(u)).catch(() => {});
    return () => { live = false; };
  }, [kind, id]);
  if (!id) return <div className={`${className} nophoto`} aria-hidden="true" />;
  return src ? <img className={className} src={src} alt={alt} /> : <div className={`${className} nophoto`} role="img" aria-label={alt} />;
}

export function Score({ value, big }) {
  const { num } = usePrefs();
  return (
    <div className={big ? "score big" : "score"} style={{ "--p": value ?? 0 }} role="img" aria-label={`${value}%`}>
      <span>{num(value)}%</span>
    </div>
  );
}

export function Loading() {
  const { t } = usePrefs();
  return <p className="muted center" role="status">{t("loading")}</p>;
}

export function LoadError({ error, retry }) {
  const { t } = usePrefs();
  return (
    <div className="panel center" role="alert">
      <p>{t(error === "notFound" ? "notFound" : error === "forbidden" ? "forbidden" : "loadFail")}</p>
      {error === "network" && retry && <button className="ghost" onClick={retry}>{t("retry")}</button>}
      {error !== "network" && <Link className="ghost" to="/">{t("backHome")}</Link>}
    </div>
  );
}

// Wraps a page that needs data: shows loading / error, else renders children(data).
export function Loaded({ q, children }) {
  if (q.loading && !q.data) return <Loading />;
  if (q.error) return <LoadError error={q.error} retry={q.reload} />;
  return q.data ? children(q.data) : null;
}

export function Band({ band, score }) {
  const { t, num } = usePrefs();
  if (band === "restricted") return <span className="pill">{t("band_restricted")}</span>;
  return <span className={`pill ${band === "high" ? "hot" : ""}`}>{t(`band_${band}`)}{score != null ? ` · ${num(score)}%` : ""}</span>;
}

export function StatusPill({ status }) {
  const { t } = usePrefs();
  return <span className={`pill ${status === "confirmed" ? "ok" : status === "rejected" ? "bad" : ""}`}>{t(`st_${status}`)}</span>;
}

export function Confirm({ text, yes, onYes, onNo, busy, danger = true }) {
  const { t } = usePrefs();
  return (
    <div className="confirm" role="alertdialog" aria-live="assertive">
      <p className="warn">{text}</p>
      <div className="row">
        <button className={danger ? "ghost danger" : "primary inline"} onClick={onYes} disabled={busy}>{yes}</button>
        <button className="ghost" onClick={onNo} disabled={busy}>{t("cancel")}</button>
      </div>
    </div>
  );
}

export const ageText = (t, p) => {
  if (p.person_age != null) return t("ageYears", { n: p.person_age });
  if (p.age_min != null && p.age_max != null) return t("ageRange", { a: p.age_min, b: p.age_max });
  if (p.age_min != null) return t("ageFrom", { n: p.age_min });
  return "";
};

export const markText = (t, m) =>
  [t(`mark_${m.type}`), [t(`body_${m.region}`), m.part ? t(`part_${m.part}`) : ""].filter(Boolean).join(", ")].join(": ")
  + (m.detail ? ` (${m.detail})` : "");

export const clothText = (t, c) => [c.color ? t(`color_${c.color}`) : "", t(`cloth_${c.item}`)].filter(Boolean).join(" ");

export const traitsText = (t, tr = {}) =>
  Object.entries(tr).filter(([, v]) => v).map(([k, v]) => `${t(`tr_${k}`)}: ${t(`tv_${k}_${v}`)}`);

// Description of a person, from either side (family case or found record).
export function PersonFacts({ p, hide = [], figure = true }) {
  const { t, num, dateTime } = usePrefs();
  const rows = [];
  const add = (k, v) => { if (v && !hide.includes(k)) rows.push([k, v]); };
  add("gender", p.gender && p.gender !== "unknown" ? t(`g_${p.gender}`) : p.gender === "unknown" ? t("g_unknown") : "");
  add("age", ageText(t, p));
  add("height", p.height_cm ? t("cm", { n: p.height_cm }) : "");
  add("looks", traitsText(t, p.traits).join(" · "));
  add("clothing", (p.clothing || []).map((c) => clothText(t, c)).join(", "));
  add("belongings", p.belongings);
  add("marks", (p.marks || []).map((m, i) => `${num(i + 1)}. ${markText(t, m)}`).join(" · "));
  add("idDoc", p.id_type && p.id_type !== "none" ? `${t(`id_${p.id_type}`)}${p.id_number ? `: ${p.id_number}` : ""}` : "");
  add("cannotSpeak", p.cannot_speak ? t("yes") : "");
  add("lastSeenPlace", p.last_seen_place);
  add("lastSeenDate", p.last_seen_at ? dateTime(p.last_seen_at) : "");
  add("division", p.division ? t(`div_${p.division}`) : "");
  add("medicalNotes", p.medical_notes);
  add("notes", p.notes);
  if (!rows.length) return <p className="muted">{t("noDetails")}</p>;
  return (
    <>
      <dl className="facts">
        {rows.map(([k, v]) => (
          <div key={k}><dt>{t(`f_${k}`)}</dt><dd>{typeof v === "number" ? num(v) : v}</dd></div>
        ))}
      </dl>
      {figure && <MarksFigure marks={p.marks} />}
    </>
  );
}

export function PhotoGrid({ kind, photos, alt, small }) {
  if (!photos?.length) return null;
  return (
    <ul className={small ? "photos small" : "photos"}>
      {photos.map((p) => <li key={p.id ?? p}><Photo kind={kind} id={p.id ?? p} alt={alt} className="gridphoto" /></li>)}
    </ul>
  );
}

// Section title in the dashboard style: UPPERCASE TITLE [count]
export function SecTitle({ title, count, children }) {
  const { num } = usePrefs();
  return (
    <div className="sec">
      <h2>{title}{count != null && <span className="countbadge" aria-label={String(count)}>{num(count)}</span>}</h2>
      {children}
    </div>
  );
}
