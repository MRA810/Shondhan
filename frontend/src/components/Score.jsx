import { fmtNum } from "../hooks.js";
import { usePrefs } from "../prefs.jsx";

export default function Score({ value, big }) {
  const { lang } = usePrefs();
  return (
    <div className={big ? "score big" : "score"} style={{ "--p": value }} role="img" aria-label={`${value}%`}>
      <span>{fmtNum(value, lang)}%</span>
    </div>
  );
}
