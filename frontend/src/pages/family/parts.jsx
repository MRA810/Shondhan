import { Link } from "react-router-dom";
import { usePrefs } from "../../prefs.jsx";
import { Band, Photo, Score, StatusPill } from "../../components/ui.jsx";

export function MatchCard({ m, showCase = true }) {
  const { t, date } = usePrefs();
  const r = m.record;
  return (
    <Link to={`/matches/${m.id}`} className="listrow">
      {m.restricted ? <div className="thumb nophoto" aria-hidden="true" /> : <Photo kind="record" id={r?.photo_ids?.[0]} alt={t("foundPhoto")} />}
      <div>
        <h3>{m.restricted ? t("restricted") : r.found_place}</h3>
        <p className="meta">
          {showCase && <span>{t("forCase", { name: m.case_name })}</span>}
          {!m.restricted && <span>{t(`src_${r.source}`)}</span>}
          {!m.restricted && <span>{date(r.found_at)}</span>}
        </p>
      </div>
      <div className="tags"><Band band={m.band} />{m.status === "confirmed" && <StatusPill status="confirmed" />}</div>
      {m.restricted ? <span /> : <Score value={m.score} />}
      <span className="chev" aria-hidden="true">›</span>
    </Link>
  );
}
