// Text and link for one notification. Params are stored on the server so messages survive deletes.
export function notifText(t, n) {
  const p = n.params || {};
  const key = n.kind === "system" ? `n_${p.msg || "welcome"}` : `n_${n.kind}`;
  return t(key, { name: p.name || "", pct: p.pct, place: p.place || "", org: p.org || "" });
}

export function notifLink(n, role) {
  if (role === "family") {
    if (n.match_id) return `/matches/${n.match_id}`;
    if (n.case_id) return `/cases/${n.case_id}`;
  }
  if (["police", "medical"].includes(role) && n.record_id) return `/records/${n.record_id}`;
  return null;
}
