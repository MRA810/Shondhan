const BASE = import.meta.env.VITE_API_URL || "";
const ACCESS = "shondhan_token";
const REFRESH = "shondhan_refresh";

export const getToken = () => sessionStorage.getItem(ACCESS);
export const setToken = (t) => sessionStorage.setItem(ACCESS, t);
export const clearToken = () => { sessionStorage.removeItem(ACCESS); sessionStorage.removeItem(REFRESH); };

function send(path, { method = "GET", body, auth } = {}) {
  const isForm = body instanceof FormData; // file uploads: the browser sets the multipart header itself
  const headers = isForm ? {} : { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${getToken()}`;
  return fetch(`${BASE}/api/${path}`, { method, headers, body: isForm ? body : body && JSON.stringify(body) });
}

// Access tokens last 15 minutes. Trade the refresh token for a new one (shared, so parallel calls refresh once).
let refreshing = null;
function refreshAccess() {
  const refresh = sessionStorage.getItem(REFRESH);
  if (!refresh) return Promise.resolve(false);
  refreshing ||= send("auth/refresh/", { method: "POST", body: { refresh } })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = await res.json();
      setToken(data.access);
      if (data.refresh) sessionStorage.setItem(REFRESH, data.refresh);
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function call(path, opts = {}) {
  let res;
  try {
    res = await send(path, opts);
    if (opts.auth && res.status === 401 && (await refreshAccess())) res = await send(path, opts);
  } catch {
    throw { code: "network" };
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 400) throw { code: "validation", fields: data };
  if (!res.ok) throw { code: data.code || (res.status === 401 ? "invalid" : "network"), status: res.status };
  return data;
}

export const login = async (identifier, password) => {
  const data = await call("auth/login/", { method: "POST", body: { identifier, password } });
  setToken(data.access);
  if (data.refresh) sessionStorage.setItem(REFRESH, data.refresh);
  return data;
};
export const register = (body) => call("auth/register/", { method: "POST", body });
export const me = () => call("auth/me/", { auth: true });
export const updateProfile = (body) => call("auth/me/", { method: "PATCH", body, auth: true });

// family dashboard
export const getSummary = () => call("family/summary/", { auth: true });
export const getNotifications = () => call("family/notifications/", { auth: true });
export const markRead = (ids) => call("family/notifications/read/", { method: "POST", body: ids ? { ids } : {}, auth: true });
export const closeCase = (id) => call(`family/cases/${id}/`, { method: "DELETE", auth: true });
export const createCase = (formData) => call("family/cases/", { method: "POST", body: formData, auth: true });

// Pictures are private (need the login token), so an <img src> cannot load them directly: fetch, then use a blob URL.
export async function getPhoto(caseId, photoId) {
  const path = `family/cases/${caseId}/photos/${photoId}/`;
  let res = await send(path, { auth: true });
  if (res.status === 401 && (await refreshAccess())) res = await send(path, { auth: true });
  if (!res.ok) throw { code: "network", status: res.status };
  return URL.createObjectURL(await res.blob());
}
