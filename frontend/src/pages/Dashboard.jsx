import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken, me } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import Toggles from "./Toggles.jsx";

export default function Dashboard() {
  const { t } = usePrefs();
  const nav = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    me().then(setUser).catch(() => { clearToken(); nav("/login"); });
  }, [nav]);

  return (
    <main className="page">
      <Toggles />
      <section className="glass wide">
        <h2>{t("welcome")}{user ? `, ${user.full_name}` : ""}</h2>
        <p>{t("dashSoon")}</p>
        <button className="primary" onClick={() => { clearToken(); nav("/login"); }}>{t("logout")}</button>
      </section>
    </main>
  );
}
