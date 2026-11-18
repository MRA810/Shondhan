import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken, getNotifications, me } from "./api.js";

// Holds the logged-in user, the unread count and the pop-up messages, so every private page shares one copy.
const Ctx = createContext();
export const useSession = () => useContext(Ctx);

export const HOME = { family: "/dashboard", police: "/reporter", medical: "/reporter", officer: "/officer", admin: "/admin", auditor: "/audit" };

// alerts worth a pop-up (the welcome message is not)
const POPUP_KINDS = ["match", "verified", "officer", "reunited", "merge", "merged", "approved"];
const SHOWN_KEY = "shondhan_popped"; // ids already shown as a pop-up, so a reload does not repeat them
const POLL_MS = 30000;

const readShown = () => { try { return new Set(JSON.parse(sessionStorage.getItem(SHOWN_KEY) || "[]")); } catch { return new Set(); } };
const saveShown = (set) => { try { sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...set].slice(-200))); } catch { /* ignore */ } };

export function Session({ children }) {
  const nav = useNavigate();
  const [state, setState] = useState({ status: "loading", user: null });
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState([]);
  const shown = useRef(readShown());

  // logout goes to the main page; an expired session goes to the login page
  const logout = useCallback((to = "/") => { clearToken(); try { sessionStorage.removeItem(SHOWN_KEY); } catch { /* ignore */ } nav(to, { replace: true }); }, [nav]);

  const load = useCallback(async () => {
    try {
      const user = await me();
      setState({ status: "ready", user });
    } catch (e) {
      if (e.status === 401) return logout("/login");
      setState({ status: "error", user: null });
    }
  }, [logout]);

  const refreshUnread = useCallback(() => {
    getNotifications().then((d) => {
      setUnread(d.unread);
      const fresh = d.items.filter((n) => !n.is_read && POPUP_KINDS.includes(n.kind) && !shown.current.has(n.id)).slice(0, 3);
      if (fresh.length) {
        fresh.forEach((n) => shown.current.add(n.id));
        saveShown(shown.current);
        setToasts((cur) => [...fresh.reverse(), ...cur].slice(0, 3));
      }
    }).catch(() => {});
  }, []);
  const dismiss = useCallback((id) => setToasts((cur) => cur.filter((n) => n.id !== id)), []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (state.status !== "ready") return undefined;
    refreshUnread();
    const id = setInterval(refreshUnread, POLL_MS); // new matches show up without a reload
    return () => clearInterval(id);
  }, [state.status, refreshUnread]);

  const setUser = (user) => setState((s) => ({ ...s, user }));
  const retry = () => { setState({ status: "loading", user: null }); load(); };

  return (
    <Ctx.Provider value={{ ...state, unread, refreshUnread, setUser, retry, logout, toasts, dismiss }}>
      {children}
    </Ctx.Provider>
  );
}
