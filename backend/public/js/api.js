/* ============================================================
   Zugriff auf die Backend-API
   ------------------------------------------------------------
   Ein einziger Ort fuer Fehlerbehandlung und Sitzungsablauf.
   ============================================================ */

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    /** Liste von Klartextfehlern aus der Inhaltspruefung, falls vorhanden. */
    this.errors = details?.errors || null;
    this.mfaRequired = Boolean(details?.mfaRequired);
  }
}

/* Wird gesetzt, damit die Oberflaeche auf einen Sitzungsablauf reagieren kann. */
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(method, path, { json, body, headers } = {}) {
  const init = {
    method,
    // Der Sitzungs-Cookie ist HttpOnly und SameSite=Strict.
    credentials: "same-origin",
    headers: { ...(headers || {}) },
  };

  if (json !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(json);
  } else if (body !== undefined) {
    init.body = body;
  }

  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError("Keine Verbindung zum Server. Bitte Internetverbindung prüfen.", 0);
  }

  const isJson = (res.headers.get("Content-Type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => ({})) : null;

  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized(data);
    throw new ApiError(data?.error || `Fehler ${res.status}`, res.status, data);
  }
  return data;
}

export const api = {
  /* --- Sitzung --- */
  session: () => request("GET", "/api/session"),
  setupStatus: () => request("GET", "/api/setup/status"),
  setup: (payload) => request("POST", "/api/setup", { json: payload }),
  login: (email, password) => request("POST", "/api/auth/login", { json: { email, password } }),
  logout: () => request("POST", "/api/auth/logout", { json: {} }),
  verifyMfa: (payload) => request("POST", "/api/auth/mfa", { json: payload }),
  startMfaSetup: () => request("POST", "/api/auth/mfa/setup", { json: {} }),
  activateMfa: (code) => request("POST", "/api/auth/mfa/activate", { json: { code } }),
  changePassword: (currentPassword, newPassword) =>
    request("POST", "/api/auth/password", { json: { currentPassword, newPassword } }),
  newRecoveryCodes: (password) => request("POST", "/api/auth/recovery-codes", { json: { password } }),

  /* --- Inhalte --- */
  getContent: () => request("GET", "/api/content"),
  saveDraft: (content) => request("PUT", "/api/content", { json: { content } }),
  discardDraft: () => request("DELETE", "/api/content"),
  publish: (message, expectedHead) => request("POST", "/api/content/publish", { json: { message, expectedHead } }),
  contentStatus: () => request("GET", "/api/content/status"),

  /* --- Dateien --- */
  listMedia: () => request("GET", "/api/media"),
  uploadMedia: (file, filename) => {
    const form = new FormData();
    form.append("file", file);
    form.append("filename", filename);
    return request("POST", "/api/media", { body: form });
  },
  deletePendingMedia: (path) => request("DELETE", `/api/media/pending/${encodeURIComponent(path)}`),

  listKataloge: () => request("GET", "/api/kataloge"),
  uploadKatalog: (file, filename, title) => {
    const form = new FormData();
    form.append("file", file);
    form.append("filename", filename);
    if (title) form.append("title", title);
    return request("POST", "/api/kataloge", { body: form });
  },
  deleteKatalog: (name) => request("DELETE", `/api/kataloge/${encodeURIComponent(name)}`),

  /* --- Sonstiges --- */
  audit: () => request("GET", "/api/audit"),
  health: () => request("GET", "/api/health"),
};
