const BASE = import.meta.env.VITE_API_URL || "";
const KEY = "shondhan_token";

export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (t) => sessionStorage.setItem(KEY, t);
export const clearToken = () => sessionStorage.removeItem(KEY);

async function call(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  const isForm = body instanceof FormData;
  if (body && !isForm) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization = `Bearer ${getToken()}`;
  let res;
  try {
    res = await fetch(`${BASE}/api/${path}`, {
      method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw { code: "network" };
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 400) throw { code: "validation", fields: data };
  if (res.status === 401 && auth) throw { code: "unauthorized" };
  if (res.status === 404) throw { code: "notfound" };
  if (!res.ok) throw { code: data.code || "network", status: res.status };
  return data;
}

// auth
export const login = (identifier, password) =>
  call("auth/login/", { method: "POST", body: { identifier, password }, auth: false });
export const register = (body) => call("auth/register/", { method: "POST", body, auth: false });
export const me = () => call("auth/me/");
export const getProfile = () => call("auth/profile/");
export const saveProfile = (body) => call("auth/profile/", { method: "PATCH", body });

// family dashboard
export const dashboard = () => call("dashboard/");
export const createCase = (formData) => call("cases/", { method: "POST", body: formData });
export const getCase = (id) => call(`cases/${id}/`);
export const getCaseMatches = (id) => call(`cases/${id}/matches/`);
export const closeCase = (id) => call(`cases/${id}/`, { method: "DELETE" }); // found: removed completely
export const getMatch = (id) => call(`matches/${id}/`);
export const notifications = () => call("notifications/");
export const unreadCount = () => call("notifications/unread/");
export const readAll = () => call("notifications/read-all/", { method: "POST" });
