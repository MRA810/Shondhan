import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken } from "./api.js";

const BN = "০১২৩৪৫৬৭৮৯";
export const fmtNum = (n, lang) => (lang === "bn" ? String(n).replace(/\d/g, (d) => BN[d]) : String(n));
export const normDigits = (s) => String(s).replace(/[০-৯]/g, (d) => BN.indexOf(d));

// Loads data; sends the person to login if the session expired.
export function useApi(fn, deps = []) {
  const nav = useNavigate();
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((data) => setState({ data, error: "", loading: false }))
      .catch((x) => {
        if (x.code === "unauthorized") { clearToken(); nav("/login"); return; }
        setState({ data: null, error: x.code === "notfound" ? "notFound" : "network", loading: false });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(load, [load]);
  return { ...state, reload: load };
}
