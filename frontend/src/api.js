const BASE = import.meta.env.VITE_API_URL || "";
const ACCESS = "shondhan_token";
const REFRESH = "shondhan_refresh";

export const getToken = () => sessionStorage.getItem(ACCESS);
const setTokens = (access, refresh) => {
  sessionStorage.setItem(ACCESS, access);
  if (refresh) sessionStorage.setItem(REFRESH, refresh);
};
export const clearToken = () => { sessionStorage.removeItem(ACCESS); sessionStorage.removeItem(REFRESH); photoCache.clear(); };

function send(path, { method = "GET", body, auth = true } = {}) {
  const isForm = body instanceof FormData; // file uploads: the browser sets the multipart header itself
  const headers = isForm ? {} : { "Content-Type": "application/json" };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;
  return fetch(`${BASE}/api/${path}`, { method, headers, body: isForm ? body : body && JSON.stringify(body) });
}

// Access tokens last 15 minutes. Trade the refresh token for a new one (shared, so parallel calls refresh once).
let refreshing = null;
function refreshAccess() {
  const refresh = sessionStorage.getItem(REFRESH);
  if (!refresh) return Promise.resolve(false);
  refreshing ||= send("auth/refresh/", { method: "POST", body: { refresh }, auth: false })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.access, data.refresh);
      return true;
    })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function raw(path, opts = {}) {
  let res = await send(path, opts);
  if (opts.auth !== false && res.status === 401 && (await refreshAccess())) res = await send(path, opts);
  return res;
}

async function call(path, opts = {}) {
  let res;
  try {
    res = await raw(path, opts);
  } catch {
    throw { code: "network" };
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.status === 400) throw { code: "validation", fields: data, status: 400 };
  if (res.status === 429 && data.code === "otp_wait") throw { code: "otp_wait", wait: data.wait, status: 429 };
  if (!res.ok) {
    const fallback = { 401: opts.auth === false ? "invalid" : "unauthorized", 403: "forbidden", 404: "notFound", 429: "locked" }[res.status];
    throw { code: data.code || fallback || "network", status: res.status };
  }
  return data;
}

export const api = {
  get: (path) => call(path),
  post: (path, body) => call(path, { method: "POST", body: body ?? {} }),
  patch: (path, body) => call(path, { method: "PATCH", body }),
  del: (path) => call(path, { method: "DELETE" }),
};

// auth
export const login = async (identifier, password) => {
  const data = await call("auth/login/", { method: "POST", body: { identifier, password }, auth: false });
  setTokens(data.access, data.refresh);
  return data;
};
export const register = (body) => call("auth/register/", { method: "POST", body, auth: false });
export const sendOtp = (phone, purpose) => call("auth/otp/send/", { method: "POST", body: { phone, purpose }, auth: false });
export const resetPassword = (body) => call("auth/password/reset/", { method: "POST", body, auth: false });
// new family: report + own details + SMS code in one go; logs them in
export const registerWithReport = async (fd) => {
  const data = await call("auth/register-report/", { method: "POST", body: fd, auth: false });
  setTokens(data.access, data.refresh);
  return data;
};
export const registerStaff = (body) => call("auth/register-staff/", { method: "POST", body, auth: false });
export const me = () => api.get("auth/me/");
export const updateProfile = (body) => api.patch("auth/me/", body);

// notifications (every role)
export const getNotifications = () => api.get("notifications/");
export const markRead = (ids) => api.post("notifications/read/", ids ? { ids } : {});

// family
export const getSummary = () => api.get("family/summary/");
export const createCase = (fd) => call("family/cases/", { method: "POST", body: fd });
export const getCase = (id) => api.get(`family/cases/${id}/`);
export const closeCase = (id) => api.del(`family/cases/${id}/`);
export const getFamilyMatch = (id) => api.get(`family/matches/${id}/`);

// police / medical
export const getReporterSummary = () => api.get("reporter/summary/");
export const getRecords = () => api.get("reporter/records/");
export const createRecord = (fd) => call("reporter/records/", { method: "POST", body: fd });
export const getRecord = (id) => api.get(`reporter/records/${id}/`);
export const updateRecord = (id, fd) => call(`reporter/records/${id}/`, { method: "PATCH", body: fd });
export const closeRecord = (id) => api.del(`reporter/records/${id}/`);
export const deleteRecordPhoto = (id, photoId) => api.del(`reporter/records/${id}/photos/${photoId}/`);
export const decideMerge = (id, approve) => api.post(`reporter/merges/${id}/`, { approve });

// case officer
export const getQueue = (status, kind) => api.get(`officer/queue/?status=${status}${kind ? `&kind=${kind}` : ""}`);
export const getOfficerMatch = (id) => api.get(`officer/matches/${id}/`);
export const reviewMatch = (id, decision, note) => api.post(`officer/matches/${id}/`, { decision, note });
export const reunite = (id) => api.post(`officer/matches/${id}/reunite/`);
// every family report (police, case officers, admins)
export const getReports = (params) => api.get(`reports/?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "" && v != null))}`);
export const getReport = (id) => api.get(`reports/${id}/`);
export const getOfficerRecords = (q, condition) =>
  api.get(`officer/records/?q=${encodeURIComponent(q || "")}${condition ? `&condition=${condition}` : ""}`);
export const getOfficerRecord = (id) => api.get(`officer/records/${id}/`);

// admin / auditor
export const getAdminSummary = () => api.get("admin/summary/");
export const getUsers = (role, q) => api.get(`admin/users/?role=${role || ""}&q=${encodeURIComponent(q || "")}`);
export const createUser = (body) => api.post("admin/users/", body);
export const userAction = (id, action) => api.patch(`admin/users/${id}/`, { action });
export const rejectUser = (id) => api.del(`admin/users/${id}/`);
export const getAudit = (params) => api.get(`audit/?${new URLSearchParams(params)}`);

// Pictures are private (they need the login token), so an <img src> cannot load them directly:
// fetch, then use a blob URL. Kept in memory so lists do not download the same picture twice.
const photoCache = new Map();
export function getPhoto(kind, photoId) {
  const key = `${kind}/${photoId}`;
  if (!photoCache.has(key)) {
    const p = raw(`photos/${key}/`).then(async (res) => {
      if (!res.ok) throw { code: "network", status: res.status };
      return URL.createObjectURL(await res.blob());
    });
    p.catch(() => photoCache.delete(key));
    photoCache.set(key, p);
  }
  return photoCache.get(key);
}
