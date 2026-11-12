import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken, me, getCases, getCaseMatches } from "../api.js";
import { usePrefs } from "../prefs.jsx";
import Toggles from "./Toggles.jsx";

export default function Dashboard() {
  const { t } = usePrefs();
  const nav = useNavigate();
  const [user, setUser] = useState(null);
  const [cases, setCases] = useState([]);
  const [error, setError] = useState(null);

  // Load authenticated user profile
  useEffect(() => {
    me()
      .then(setUser)
      .catch(() => {
        clearToken();
        nav("/login");
      });
  }, [nav]);

  // Load family cases for this user
  useEffect(() => {
    if (!user) return;
    getCases()
      .then((data) => setCases(data))
      .catch((e) => setError(e?.code || "Failed to load cases"));
  }, [user]);

  const renderCase = (c) => (
    <details key={c.id} className="case-card glass">
      <summary>{c.name} (Age: {c.age}, {c.gender})</summary>
      <p><strong>Last seen:</strong> {c.last_seen_location} on {c.last_seen_date}</p>
      <p><strong>Traits:</strong> {c.traits || "—"}</p>
      <p><strong>Attire:</strong> {c.attire || "—"}</p>
      <p><strong>Contact:</strong> {c.contact_phone} {c.contact_email && `| ${c.contact_email}`}</p>
      <p><strong>Status:</strong> {c.status}</p>
    </details>
  );

  return (
    <main className="page">
      <Toggles />
      <section className="glass wide">
        <h2>{t("welcome")}{user ? `, ${user.full_name}` : ""}</h2>
        {user && (
          <div className="profile-card glass">
            <p><strong>ID:</strong> {user.id}</p>
            <p><strong>Name:</strong> {user.full_name}</p>
            <p><strong>Phone:</strong> {user.phone}</p>
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>Role:</strong> {user.role}</p>
            <p><strong>Age:</strong> {user.age}</p>
            <p><strong>Relationship:</strong> {user.relationship}</p>
          </div>
        )}
        <hr />
        <h3>{t("your_cases") || "Your Cases"}</h3>
        {error && <p className="error">{error}</p>}
        {cases.length === 0 ? (
          <p>{t("no_cases") || "No cases reported yet."}</p>
        ) : (
          cases.map(renderCase)
        )}
        <button className="primary" onClick={() => { clearToken(); nav("/login"); }}>{t("logout")}</button>
      </section>
    </main>
  );
}
