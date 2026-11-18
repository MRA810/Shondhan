import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./session.jsx";

export const normDigits = (s) => String(s ?? "").replace(/[০-৯]/g, (d) => "০১২৩৪৫৬৭৮৯".indexOf(d));
export const validPhone = (s) => /^01\d{9}$/.test(normDigits(s).replace(/[\s-]/g, ""));

// Loads data; sends the person to login if the session expired.
export function useApi(fn, deps = []) {
  const { logout } = useSession();
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true; // React's dev mode mounts twice, so switch it back on every mount
    return () => { alive.current = false; };
  }, []);
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return fn()
      .then((data) => alive.current && setState({ data, error: "", loading: false }))
      .catch((x) => {
        if (x.code === "unauthorized") return logout("/login");
        if (alive.current) setState({ data: null, error: x.code === "notFound" ? "notFound" : x.code === "forbidden" ? "forbidden" : "network", loading: false });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

// Turns a server validation answer ({field: ["code"]}) into message keys the form can show.
export function serverErrors(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    const code = Array.isArray(v) ? v[0] : typeof v === "string" ? v : "";
    out[k] = /^[a-z_]+$/.test(code) ? `err_${code}` : "err_generic";
  }
  return out;
}
