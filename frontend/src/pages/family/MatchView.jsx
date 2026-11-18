import { Link, useParams } from "react-router-dom";
import { getFamilyMatch } from "../../api.js";
import { useApi } from "../../hooks.js";
import PrintButton from "../../components/PrintSheet.jsx";
import { usePrefs } from "../../prefs.jsx";
import { useSession } from "../../session.jsx";
import { useEffect } from "react";
import { Band, Icon, Loaded, PersonFacts, PhotoGrid, Score, StatusPill } from "../../components/ui.jsx";

export default function MatchView() {
  const { id } = useParams();
  const { t, dateTime } = usePrefs();
  const { refreshUnread } = useSession();
  const q = useApi(() => getFamilyMatch(id), [id]);
  useEffect(() => { if (q.data) refreshUnread(); }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Loaded q={q}>{(m) => (
      <>
        <Link className="link backlink" to={`/cases/${m.case_id}`}>← {t("backToCase", { name: m.case_name })}</Link>
        <section className="panel">
          <div className="scorehead">
            {!m.restricted && <Score value={m.score} big />}
            <div>
              <h1>{t("matchTitle")}</h1>
              <p>{t("forCase", { name: m.case_name })}</p>
              <div className="row"><Band band={m.band} />{m.status === "confirmed" && <StatusPill status="confirmed" />}</div>
            </div>
          </div>
          {m.restricted ? (
            <p className="warn">{t("restrictedLong")}</p>
          ) : (
            <>
              <p className="warn">{t("matchNote")}</p>
              {m.reasons.length > 0 && (
                <>
                  <h2 className="gap">{t("whyMatch")}</h2>
                  <ul className="chips">{m.reasons.map((r) => <li key={r} className="pill hot">{t(`r_${r}`)}</li>)}</ul>
                </>
              )}
            </>
          )}
        </section>

        {!m.restricted && (
          <>
            <section className="panel">
              <h2>{t("whereNow")}</h2>
              <p className="big"><strong>{m.record.found_place}</strong>{m.record.found_area ? `, ${m.record.found_area}` : ""}</p>
              <p>{t(`src_${m.record.source}`)}{m.record.organization ? ` · ${m.record.organization}` : ""} · {t(`div_${m.record.division}`)}</p>
              <p className="muted">{t("foundDate", { date: dateTime(m.record.found_at) })}</p>
              <p>{t(`cond_${m.record.condition}`)}</p>
              <p>{t("contact")}: {m.record.contact_name} {m.record.contact_phone}</p>
              <div className="row mt">
                <a className="primary inline" href={`tel:${m.record.contact_phone}`}><Icon name="phone" /> {t("callNow")}</a>
                <PrintButton kind="record" data={m.record} label={t("printTakeAlong")} />
              </div>
            </section>
            <section className="panel">
              <h2>{t("foundPerson")}</h2>
              <PhotoGrid kind="record" photos={m.record.photo_ids} alt={t("foundPhoto")} />
              <PersonFacts p={m.record} hide={["division"]} />
            </section>
          </>
        )}
      </>
    )}</Loaded>
  );
}
