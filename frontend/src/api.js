const BASE = import.meta.env.VITE_API_URL || "";
const KEY = "shondhan_token";

export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (t) => sessionStorage.setItem(KEY, t);
export const clearToken = () => sessionStorage.removeItem(KEY);

async function call(path, { method = "GET", body, auth } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${getToken()}`;
  let res;
  try {
    res = await fetch(`${BASE}/api/auth/${path}`, { method, headers, body: body && JSON.stringify(body) });
  } catch {
    throw { code: "network" };
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 400) throw { code: "validation", fields: data };
  if (!res.ok) throw { code: data.code || (res.status === 401 ? "invalid" : "network"), status: res.status };
  return data;
}

export const login = (identifier, password) => call("login/", { method: "POST", body: { identifier, password } });
export const me = () => call("me/", { auth: true });
export const register = (body) => call("register/", { method: "POST", body });
