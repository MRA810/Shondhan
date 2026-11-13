import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken, getSummary, me } from "./api.js";

// Holds the logged-in user and the family dashboard data, so every private page shares one copy.
const Ctx = createContext();
export const useSession = () => useContext(Ctx);

export function Session({ children }) {
  const nav = useNavigate();
  const [state, setState] = useState({ status: "loading", user: null, summary: null });

  const load = useCallback(async () => {
    try {
      const user = await me();
      const summary = user.role === "family" ? await getSummary() : null;
      setState({ status: "ready", user, summary });
    } catch (e) {
      if (e.status === 401) { clearToken(); nav("/login", { replace: true }); return; }
      console.error("Shondhan: could not load dashboard data", e);
      setState((s) => ({ ...s, status: "error", errorCode: e.status || e.code }));
    }
  }, [nav]);

  useEffect(() => { load(); }, [load]);

  const retry = () => { setState((s) => ({ ...s, status: "loading" })); load(); };
  const setUser = (user) => setState((s) => ({ ...s, user }));

  return <Ctx.Provider value={{ ...state, reload: load, retry, setUser }}>{children}</Ctx.Provider>;
}
