import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { closeCase, getCase } from "../../api.js";
import { useApi } from "../../hooks.js";
import { useSession } from "../../session.jsx";
import PrintButton from "../../components/PrintSheet.jsx";
import { usePrefs } from "../../prefs.jsx";
import { Confirm, Loaded, PersonFacts, PhotoGrid, ageText } from "../../components/ui.jsx";
import { MatchCard } from "./parts.jsx";

export default function CaseView() {
  const { id } = useParams();
  const { t, date } = usePrefs();
  const nav = useNavigate();
  const { user } = useSession();
  const [params] = useSearchParams();
  const q = useApi(() => getCase(id), [id]);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const found = async () => {
    setBusy(true);
    try { await closeCase(id); nav("/dashboard", { replace: true }); } catch { setErr("network"); setBusy(false); }
  };
  return (
    <Loaded q={q}>{(c) => {
      const photos = c.photos.filter((p) => p.kind === "photo");
      const docs = c.photos.filter((p) => p.kind === "document");
      return (
        <>
          <Link className="link backlink" to="/dashboard">← {t("backHome")}</Link>
          {params.get("new") && <p className="success big" role="status">{t("wz_posted")}</p>}
          <section className="panel">
            <div className="row between">
              <h1>{c.person_name}</h1>
              <PrintButton kind="case" data={c} label={t("printPoster")} contact={{ name: user.full_name, phone: user.phone, alt: user.alt_phone }} />
            </div>
            <p className="hint">{t("printPosterHelp")}</p>
            <p className="muted">{[ageText(t, c), t(`rel_${c.relationship}`) && t("youAre", { rel: t(`rel_${c.relationship}`) })].filter(Boolean).join(" · ")}</p>
            <p className="muted small">{t("postedOn", { date: date(c.created_at) })} · {t("officialViews", { n: c.official_views })}</p>
            <PhotoGrid kind="case" photos={photos} alt={t("photoAlt", { name: c.person_name })} />
            <PersonFacts p={c} />
            {docs.length > 0 && <><h3>{t("idDocs")}</h3><PhotoGrid kind="case" photos={docs} alt={t("idDocs")} small /></>}
          </section>

          <div className="sec"><h2>{t("matchesTitle")}</h2></div>
          {c.matches.length === 0 ? <p className="panel empty muted">{t("matchesNone")}</p> : (
            <div className="rowlist">{c.matches.map((m) => <MatchCard key={m.id} m={m} showCase={false} />)}</div>
          )}

          <section className="panel danger mt">
            <h2>{t("foundQ")}</h2>
            <p>{t("foundHelp")}</p>
            {!ask ? <button className="ghost danger" onClick={() => setAsk(true)}>{t("foundBtn")}</button> : (
              <Confirm text={t("confirmFound")} yes={t("yesDelete")} onYes={found} onNo={() => setAsk(false)} busy={busy} />
            )}
            {err && <p className="error" role="alert">{t(err)}</p>}
          </section>
        </>
      );
    }}</Loaded>
  );
}
