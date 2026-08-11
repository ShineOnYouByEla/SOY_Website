/* ============================================================
   Anmeldung, Sessions, Bremse gegen Passwort-Raten
   ============================================================ */

import { randomToken, sha256Hex } from "./crypto.js";

export const SESSION_COOKIE = "soy_session";
/* Wie lange eine vollstaendig angemeldete Sitzung gilt. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/* Kurze Frist fuer den Zwischenschritt zwischen Passwort und MFA-Code. */
export const MFA_PENDING_TTL_MS = 10 * 60 * 1000;

/* ---------- Sessions ---------- */

/**
 * Legt eine Sitzung an und gibt das Klartext-Token zurueck.
 * Gespeichert wird nur dessen SHA-256 — wer die Datenbank liest,
 * kann sich damit nicht anmelden.
 */
export async function createSession(env, userId, { mfaDone, ip, userAgent, now }) {
  const token = randomToken(32);
  const id = await sha256Hex(token);
  const ttl = mfaDone ? SESSION_TTL_MS : MFA_PENDING_TTL_MS;

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, created_at, expires_at, last_seen, mfa_done, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, userId, now, now + ttl, now, mfaDone ? 1 : 0, ip || null, (userAgent || "").slice(0, 255))
    .run();

  return { token, id, expiresAt: now + ttl };
}

/** Sitzung samt Benutzer laden; abgelaufene Sitzungen zaehlen als nicht vorhanden. */
export async function loadSession(env, token, now) {
  if (!token) return null;
  const id = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.id, s.user_id, s.expires_at, s.mfa_done,
            u.email, u.name, u.role, u.disabled, u.totp_enabled
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`
  )
    .bind(id)
    .first();

  if (!row) return null;
  if (row.expires_at <= now || row.disabled) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    return null;
  }
  return row;
}

/** Nach bestandenem zweiten Faktor die Sitzung hochstufen und verlaengern. */
export async function completeMfa(env, sessionId, now) {
  await env.DB.prepare("UPDATE sessions SET mfa_done = 1, expires_at = ?, last_seen = ? WHERE id = ?")
    .bind(now + SESSION_TTL_MS, now, sessionId)
    .run();
}

export async function destroySession(env, sessionId) {
  await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sessionId).run();
}

/** Alle Sitzungen eines Benutzers beenden – z. B. nach einem Passwortwechsel. */
export async function destroyAllSessions(env, userId, exceptId = null) {
  if (exceptId) {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND id != ?").bind(userId, exceptId).run();
  } else {
    await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  }
}

/** Abgelaufene Sitzungen und alte Protokolleintraege wegraeumen. */
export async function cleanup(env, now) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM login_attempts WHERE first_at <= ?").bind(now - 24 * 60 * 60 * 1000),
    env.DB.prepare("DELETE FROM audit_log WHERE at <= ?").bind(now - 180 * 24 * 60 * 60 * 1000),
    // Abgelaufene und verbrauchte Einladungen brauchen wir nicht aufzuheben.
    env.DB.prepare("DELETE FROM invites WHERE expires_at <= ? OR used_at IS NOT NULL").bind(now),
  ]);
}

/* ---------- Bremse gegen Passwort-Raten ---------- */

const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

/**
 * Prueft, ob ein Schluessel (E-Mail oder IP) gerade gesperrt ist.
 * @returns {Promise<number>} 0 = frei, sonst Sekunden bis zur Freigabe
 */
export async function checkRateLimit(env, key, now) {
  const row = await env.DB.prepare("SELECT count, first_at, blocked_until FROM login_attempts WHERE key = ?")
    .bind(key)
    .first();
  if (!row) return 0;
  if (row.blocked_until && row.blocked_until > now) {
    return Math.ceil((row.blocked_until - now) / 1000);
  }
  return 0;
}

/** Fehlversuch zaehlen und bei Bedarf sperren. */
export async function registerFailure(env, key, now) {
  const row = await env.DB.prepare("SELECT count, first_at FROM login_attempts WHERE key = ?").bind(key).first();

  // Neuer Zeitraum: Zaehler faengt von vorne an.
  if (!row || now - row.first_at > ATTEMPT_WINDOW_MS) {
    await env.DB.prepare(
      `INSERT INTO login_attempts (key, count, first_at, blocked_until) VALUES (?, 1, ?, NULL)
       ON CONFLICT(key) DO UPDATE SET count = 1, first_at = ?, blocked_until = NULL`
    )
      .bind(key, now, now)
      .run();
    return;
  }

  const count = row.count + 1;
  const blockedUntil = count >= MAX_ATTEMPTS ? now + BLOCK_MS : null;
  await env.DB.prepare("UPDATE login_attempts SET count = ?, blocked_until = ? WHERE key = ?")
    .bind(count, blockedUntil, key)
    .run();
}

/** Nach erfolgreicher Anmeldung den Zaehler loeschen. */
export async function clearFailures(env, keys) {
  await env.DB.batch(
    keys.map((k) => env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(k))
  );
}

/* ---------- Protokoll ---------- */

export async function audit(env, { userId, email, action, detail, ip, now }) {
  await env.DB.prepare(
    "INSERT INTO audit_log (at, user_id, email, action, detail, ip) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(now, userId || null, email || null, action, detail ? String(detail).slice(0, 500) : null, ip || null)
    .run();
}

/* ---------- Cookie ---------- */

/**
 * @param {boolean} secure  false nur fuer den Betrieb ohne TLS im eigenen Netz.
 *   Ohne dieses Flag wuerde der Browser den Cookie ueber http gar nicht
 *   zuruecksenden und die Anmeldung schluege still fehl.
 */
export function sessionCookie(token, maxAgeSeconds, secure = true) {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : null,
    // Strict: der Cookie wird bei Aufrufen von fremden Seiten gar nicht
    // erst mitgeschickt — zusammen mit der Origin-Pruefung der CSRF-Schutz.
    // Wirkt auch ohne TLS.
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
  ];
  return parts.filter(Boolean).join("; ");
}

export function clearCookie(secure = true) {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    secure ? "Secure" : null,
    "SameSite=Strict",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}

export function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}
