/* ============================================================
   Shine On You — Admin-Backend
   ------------------------------------------------------------
   Die Anwendung selbst, ohne Bindung an eine Plattform. Sie
   laeuft sowohl als Cloudflare Worker (src/worker.js) als auch
   unter Node im Docker-Container (src/node.js). Alles, was sich
   zwischen beiden unterscheidet, kommt ueber c.env herein:
     env.DB      Datenbank im Stil der D1-API
     env.ASSETS  Auslieferung der Dateien aus ./public
   Aufbau:
     /              Admin-Oberflaeche
     /api/auth/*    Anmeldung, zweiter Faktor, Konto
     /api/content   Entwurf laden/speichern/veroeffentlichen
     /api/media     Bilder, /api/kataloge  PDFs
     /api/preview   Vorschau-HTML fuer den iframe
   ============================================================ */

import { Hono } from "hono";

export { cleanup } from "./auth.js";

import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  audit,
  checkRateLimit,
  cleanup,
  clearCookie,
  clearFailures,
  completeMfa,
  createSession,
  destroyAllSessions,
  destroySession,
  loadSession,
  readCookie,
  registerFailure,
  sessionCookie,
} from "./auth.js";
import { hashPassword, needsRehash, randomToken, sha256Hex, timingSafeEqual, verifyPassword } from "./crypto.js";
import {
  generateRecoveryCodes,
  generateSecret,
  normalizeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "./totp.js";
import * as gh from "./github.js";
import { iconChoices } from "../../shared/icons.mjs";
import { TITEL_DATEI, baueKataloge, katalogBase, serialisiereEintraege } from "../../shared/kataloge.mjs";
import {
  ValidationError,
  assertValid,
  isEditablePath,
  katalogPath,
  mediaPath,
  previewHtml,
  renderOrThrow,
  validateContent,
} from "./content.js";

const app = new Hono();

/* Bilder: nach der Verkleinerung im Browser bleiben Webbilder deutlich
   darunter. D1 kann pro Feld rund 2 MB speichern. */
const MAX_IMAGE_BYTES = 1_400_000;
const MAX_PDF_BYTES = 30_000_000;

/* ---------- Hilfsfunktionen ---------- */

const now = () => Date.now();
/* Ohne TLS (nur im vertrauenswuerdigen Heimnetz!) darf der Cookie kein
   Secure-Flag tragen — sonst sendet ihn der Browser niemals zurueck. */
const cookieSecure = (env) => env.COOKIE_SECURE !== "false";

/**
 * Erlaubte Herkuenfte fuer schreibende Zugriffe.
 * ADMIN_ORIGIN darf mehrere durch Komma getrennte Adressen enthalten — im
 * Heimnetz ist dasselbe Backend oft sowohl per IP als auch per DNS-Name
 * erreichbar, und beide sollen funktionieren.
 */
const allowedOrigins = (env) =>
  String(env.ADMIN_ORIGIN || "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
const clientIp = (c) => c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "";
const fail = (c, status, message, extra = {}) => c.json({ error: message, ...extra }, status);

/** Fruehzeitige, verstaendliche Meldung statt eines GitHub-401. */
function githubConfigured(env) {
  return Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO && env.GITHUB_BRANCH);
}

function authorLine(user) {
  return {
    name: user.name || user.email.split("@")[0],
    // noreply-Adresse: die echte E-Mail landet sonst dauerhaft in der
    // oeffentlichen Git-Historie.
    email: `${user.email.split("@")[0]}@users.noreply.github.com`,
  };
}

/* ---------- Sicherheits-Header ---------- */

app.use("*", async (c, next) => {
  await next();

  // Die Vorschau laeuft bewusst in einem iframe derselben Herkunft.
  const isPreview = c.req.path.startsWith("/api/preview");

  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  // HSTS nur bei TLS – ueber HTTP waere die Ansage wirkungslos und
  // im Heimnetz sogar hinderlich.
  if (cookieSecure(c.env)) {
    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  c.header("X-Frame-Options", "SAMEORIGIN");

  if (!isPreview) {
    // Bildvorschauen im Admin kommen von der Live-Seite – die muss erlaubt sein.
    const siteOrigin = (() => {
      try {
        return new URL(c.env.SITE_URL).origin;
      } catch {
        return "";
      }
    })();

    c.header(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        `img-src 'self' data: blob:${siteOrigin ? ` ${siteOrigin}` : ""}`,
        "font-src 'self'",
        "connect-src 'self'",
        "frame-src 'self'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        "base-uri 'none'",
        "object-src 'none'",
      ].join("; ")
    );
  }
});

/* ---------- CSRF: schreibende Zugriffe brauchen die eigene Herkunft ---------- */

app.use("/api/*", async (c, next) => {
  const method = c.req.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  const origin = c.req.header("Origin");
  const allowed = allowedOrigins(c.env);
  // Zusammen mit SameSite=Strict am Cookie: doppelt abgesichert.
  if (!origin || !allowed.includes(origin)) {
    return fail(
      c,
      403,
      "Anfrage von einer fremden Herkunft wurde abgelehnt.",
      // Der haeufigste Grund ist ein Tippfehler oder eine zweite Adresse
      // (IP statt DNS-Name). Deshalb sagen wir, was erlaubt waere.
      { origin: origin || null, allowed }
    );
  }
  return next();
});

/* ---------- Sitzung an die Anfrage haengen ---------- */

app.use("/api/*", async (c, next) => {
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  c.set("session", token ? await loadSession(c.env, token, now()) : null);
  return next();
});

/** Voll angemeldet (Passwort + zweiter Faktor). */
async function requireUser(c) {
  const s = c.get("session");
  if (!s) return fail(c, 401, "Nicht angemeldet.");
  if (!s.mfa_done) return fail(c, 401, "Zweiter Faktor fehlt.", { mfaRequired: true });
  return null;
}

/* ============================================================
   Ersteinrichtung
   ============================================================ */

/* Symbolauswahl fuer den Admin – kommt aus derselben Quelle wie der Renderer. */
app.get("/api/icons", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  return c.json({ icons: iconChoices() });
});

app.get("/api/setup/status", async (c) => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  return c.json({ needsSetup: row.n === 0, setupEnabled: c.env.SETUP_ENABLED === "true" });
});

/**
 * Legt den ersten Benutzer an. Geht nur, solange es keinen gibt, SETUP_ENABLED
 * auf true steht und der per `wrangler secret put SETUP_TOKEN` gesetzte
 * Einmalschluessel mitgeschickt wird.
 */
app.post("/api/setup", async (c) => {
  if (c.env.SETUP_ENABLED !== "true") return fail(c, 403, "Ersteinrichtung ist abgeschaltet.");

  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  if (row.n > 0) return fail(c, 403, "Es gibt bereits ein Konto.");

  const { setupToken, email, password, name } = await c.req.json().catch(() => ({}));
  if (!c.env.SETUP_TOKEN) return fail(c, 500, "SETUP_TOKEN ist nicht gesetzt.");
  if (!timingSafeEqual(setupToken || "", c.env.SETUP_TOKEN)) {
    return fail(c, 403, "Einrichtungsschlüssel stimmt nicht.");
  }

  const problem = checkPasswordRules(password);
  if (problem) return fail(c, 400, problem);
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email || "")) return fail(c, 400, "E-Mail-Adresse ist ungültig.");

  const iterations = Number(c.env.PBKDF2_ITERATIONS || 600000);
  const id = randomToken(16);
  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, 'owner', ?)`
  )
    .bind(id, String(email).toLowerCase(), String(name || "").slice(0, 80), await hashPassword(password, iterations), now())
    .run();

  await audit(c.env, { userId: id, email, action: "setup", detail: "Erstes Konto angelegt", ip: clientIp(c), now: now() });
  return c.json({ ok: true });
});

/* ============================================================
   Anmeldung
   ============================================================ */

function checkPasswordRules(password) {
  const p = String(password || "");
  if (p.length < 12) return "Das Passwort muss mindestens 12 Zeichen haben.";
  if (p.length > 200) return "Das Passwort ist zu lang.";
  if (!/[a-zäöüß]/.test(p) || !/[A-ZÄÖÜ]/.test(p)) return "Bitte Groß- und Kleinbuchstaben verwenden.";
  if (!/[0-9]/.test(p)) return "Bitte mindestens eine Ziffer verwenden.";
  return null;
}

app.post("/api/auth/login", async (c) => {
  const t = now();
  const { email, password } = await c.req.json().catch(() => ({}));
  const mail = String(email || "").toLowerCase().trim();
  const ip = clientIp(c);

  const keys = [`mail:${mail}`, `ip:${ip}`];
  for (const key of keys) {
    const wait = await checkRateLimit(c.env, key, t);
    if (wait) {
      return fail(c, 429, `Zu viele Fehlversuche. Bitte in ${Math.ceil(wait / 60)} Minuten erneut versuchen.`);
    }
  }

  const user = await c.env.DB.prepare(
    "SELECT id, email, name, password_hash, totp_enabled, role, disabled FROM users WHERE email = ?"
  )
    .bind(mail)
    .first();

  const ok = user && !user.disabled && (await verifyPassword(password || "", user.password_hash));
  if (!ok) {
    for (const key of keys) await registerFailure(c.env, key, t);
    await audit(c.env, { email: mail, action: "login_failed", ip, now: t });
    // Bewusst dieselbe Meldung fuer falsches Passwort und unbekanntes Konto.
    return fail(c, 401, "E-Mail oder Passwort stimmt nicht.");
  }

  await clearFailures(c.env, keys);

  // Iterationszahl wurde erhoeht? Beim naechsten erfolgreichen Login nachziehen.
  const iterations = Number(c.env.PBKDF2_ITERATIONS || 600000);
  if (needsRehash(user.password_hash, iterations)) {
    await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .bind(await hashPassword(password, iterations), user.id)
      .run();
  }

  // Immer ohne zweiten Faktor starten: erst der Code (oder dessen
  // Einrichtung) macht die Sitzung vollwertig.
  const session = await createSession(c.env, user.id, {
    mfaDone: false,
    ip,
    userAgent: c.req.header("User-Agent"),
    now: t,
  });

  c.header("Set-Cookie", sessionCookie(session.token, Math.floor((session.expiresAt - t) / 1000), cookieSecure(c.env)));
  await audit(c.env, { userId: user.id, email: user.email, action: "login", ip, now: t });

  return c.json({
    ok: true,
    mfaRequired: Boolean(user.totp_enabled),
    // Ohne eingerichteten zweiten Faktor kommt niemand weiter als bis zur
    // Einrichtung — MFA ist Pflicht.
    mfaSetupRequired: !user.totp_enabled,
    user: { email: user.email, name: user.name, role: user.role },
  });
});

app.post("/api/auth/logout", async (c) => {
  const s = c.get("session");
  if (s) {
    await destroySession(c.env, s.id);
    await audit(c.env, { userId: s.user_id, email: s.email, action: "logout", ip: clientIp(c), now: now() });
  }
  c.header("Set-Cookie", clearCookie(cookieSecure(c.env)));
  return c.json({ ok: true });
});

app.get("/api/session", async (c) => {
  const s = c.get("session");
  if (!s) return c.json({ authenticated: false });
  return c.json({
    authenticated: true,
    mfaDone: Boolean(s.mfa_done),
    mfaSetupRequired: !s.totp_enabled,
    user: { email: s.email, name: s.name, role: s.role },
  });
});

/* ---------- Zweiter Faktor: Pruefung ---------- */

app.post("/api/auth/mfa", async (c) => {
  const t = now();
  const s = c.get("session");
  if (!s) return fail(c, 401, "Nicht angemeldet.");
  if (s.mfa_done) return c.json({ ok: true });

  const ip = clientIp(c);
  const key = `mfa:${s.user_id}`;
  const wait = await checkRateLimit(c.env, key, t);
  if (wait) return fail(c, 429, `Zu viele Fehlversuche. Bitte in ${Math.ceil(wait / 60)} Minuten erneut versuchen.`);

  const { code, recoveryCode } = await c.req.json().catch(() => ({}));
  const user = await c.env.DB.prepare(
    "SELECT id, email, totp_secret, totp_enabled, totp_last_step FROM users WHERE id = ?"
  )
    .bind(s.user_id)
    .first();

  if (!user?.totp_enabled) return fail(c, 400, "Für dieses Konto ist kein zweiter Faktor eingerichtet.");

  /* Weg 1: Code aus der Authenticator-App */
  if (code) {
    const step = await verifyTotp(user.totp_secret, code, t, user.totp_last_step);
    if (step === null) {
      await registerFailure(c.env, key, t);
      await audit(c.env, { userId: user.id, email: user.email, action: "mfa_failed", ip, now: t });
      return fail(c, 401, "Der Code stimmt nicht oder ist abgelaufen.");
    }
    await c.env.DB.prepare("UPDATE users SET totp_last_step = ?, last_login_at = ? WHERE id = ?")
      .bind(step, t, user.id)
      .run();
  } else if (recoveryCode) {
    /* Weg 2: Wiederherstellungscode — gilt genau einmal */
    const normalized = normalizeRecoveryCode(recoveryCode);
    const hash = await sha256Hex(`${user.id}:${normalized}`);
    const row = await c.env.DB.prepare(
      "SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL"
    )
      .bind(user.id, hash)
      .first();

    if (!row) {
      await registerFailure(c.env, key, t);
      await audit(c.env, { userId: user.id, email: user.email, action: "recovery_failed", ip, now: t });
      return fail(c, 401, "Dieser Wiederherstellungscode ist ungültig oder bereits verbraucht.");
    }
    await c.env.DB.prepare("UPDATE recovery_codes SET used_at = ? WHERE id = ?").bind(t, row.id).run();
    await audit(c.env, { userId: user.id, email: user.email, action: "recovery_used", ip, now: t });
  } else {
    return fail(c, 400, "Bitte einen Code eingeben.");
  }

  await clearFailures(c.env, [key]);
  await completeMfa(c.env, s.id, t);
  // Cookie mit der neuen, laengeren Laufzeit erneuern.
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  c.header("Set-Cookie", sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), cookieSecure(c.env)));

  const remaining = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM recovery_codes WHERE user_id = ? AND used_at IS NULL"
  )
    .bind(user.id)
    .first();

  return c.json({ ok: true, recoveryCodesLeft: remaining.n });
});

/* ---------- Zweiter Faktor: Einrichtung ---------- */

app.post("/api/auth/mfa/setup", async (c) => {
  const s = c.get("session");
  if (!s) return fail(c, 401, "Nicht angemeldet.");
  // Bereits eingerichtet? Dann nur mit vollstaendiger Anmeldung neu aufsetzen.
  if (s.totp_enabled && !s.mfa_done) return fail(c, 401, "Bitte zuerst den aktuellen Code eingeben.");

  const secret = generateSecret();
  await c.env.DB.prepare("UPDATE users SET totp_pending = ? WHERE id = ?").bind(secret, s.user_id).run();

  return c.json({
    secret,
    uri: otpauthUri(secret, s.email, c.env.MFA_ISSUER || "Shine On You"),
  });
});

app.post("/api/auth/mfa/activate", async (c) => {
  const t = now();
  const s = c.get("session");
  if (!s) return fail(c, 401, "Nicht angemeldet.");

  const { code } = await c.req.json().catch(() => ({}));
  const user = await c.env.DB.prepare("SELECT id, email, totp_pending FROM users WHERE id = ?")
    .bind(s.user_id)
    .first();
  if (!user?.totp_pending) return fail(c, 400, "Es läuft keine Einrichtung. Bitte neu starten.");

  const step = await verifyTotp(user.totp_pending, code, t, null);
  if (step === null) return fail(c, 400, "Der Code stimmt nicht. Prüfe die Uhrzeit auf dem Handy.");

  const codes = generateRecoveryCodes(10);
  const statements = [
    c.env.DB.prepare(
      "UPDATE users SET totp_secret = ?, totp_pending = NULL, totp_enabled = 1, totp_last_step = ? WHERE id = ?"
    ).bind(user.totp_pending, step, user.id),
    // Alte Codes verfallen, sobald ein neuer Faktor eingerichtet wird.
    c.env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ?").bind(user.id),
  ];
  for (const code of codes) {
    statements.push(
      c.env.DB.prepare("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)").bind(
        user.id,
        await sha256Hex(`${user.id}:${normalizeRecoveryCode(code)}`)
      )
    );
  }
  await c.env.DB.batch(statements);

  await completeMfa(c.env, s.id, t);
  const token = readCookie(c.req.raw, SESSION_COOKIE);
  c.header("Set-Cookie", sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), cookieSecure(c.env)));
  await audit(c.env, { userId: user.id, email: user.email, action: "mfa_enabled", ip: clientIp(c), now: t });

  // Die Codes gibt es genau einmal im Klartext — danach nur noch Hashes.
  return c.json({ ok: true, recoveryCodes: codes });
});

/* ---------- Konto ---------- */

app.post("/api/auth/password", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");
  const t = now();

  const { currentPassword, newPassword } = await c.req.json().catch(() => ({}));
  const user = await c.env.DB.prepare("SELECT id, email, password_hash FROM users WHERE id = ?")
    .bind(s.user_id)
    .first();

  if (!(await verifyPassword(currentPassword || "", user.password_hash))) {
    await registerFailure(c.env, `pw:${user.id}`, t);
    return fail(c, 401, "Das aktuelle Passwort stimmt nicht.");
  }
  const problem = checkPasswordRules(newPassword);
  if (problem) return fail(c, 400, problem);

  const iterations = Number(c.env.PBKDF2_ITERATIONS || 600000);
  await c.env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(await hashPassword(newPassword, iterations), user.id)
    .run();
  // Andere Geraete abmelden, falls das Passwort abhandengekommen war.
  await destroyAllSessions(c.env, user.id, s.id);
  await audit(c.env, { userId: user.id, email: user.email, action: "password_changed", ip: clientIp(c), now: t });

  return c.json({ ok: true });
});

app.post("/api/auth/recovery-codes", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");

  const { password } = await c.req.json().catch(() => ({}));
  const user = await c.env.DB.prepare("SELECT id, email, password_hash FROM users WHERE id = ?")
    .bind(s.user_id)
    .first();
  if (!(await verifyPassword(password || "", user.password_hash))) {
    return fail(c, 401, "Das Passwort stimmt nicht.");
  }

  const codes = generateRecoveryCodes(10);
  const statements = [c.env.DB.prepare("DELETE FROM recovery_codes WHERE user_id = ?").bind(user.id)];
  for (const code of codes) {
    statements.push(
      c.env.DB.prepare("INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)").bind(
        user.id,
        await sha256Hex(`${user.id}:${normalizeRecoveryCode(code)}`)
      )
    );
  }
  await c.env.DB.batch(statements);
  await audit(c.env, { userId: user.id, email: user.email, action: "recovery_regenerated", ip: clientIp(c), now: now() });

  return c.json({ ok: true, recoveryCodes: codes });
});

/* ============================================================
   Inhalte
   ============================================================ */

/** Entwurf aus D1 oder — falls keiner da ist — den Live-Stand aus dem Repo. */
async function loadWorking(c) {
  const draft = await c.env.DB.prepare("SELECT content, updated_at, updated_by FROM draft WHERE id = 1").first();
  if (draft) {
    return { content: JSON.parse(draft.content), source: "draft", updatedAt: draft.updated_at, updatedBy: draft.updated_by };
  }
  const file = await gh.getFile(c.env, "content/site.json");
  if (!file) {
    throw new Error(
      `content/site.json wurde in ${c.env.GITHUB_REPO} im Branch „${c.env.GITHUB_BRANCH}" nicht gefunden. ` +
        "Entweder zeigt GITHUB_BRANCH auf den falschen Branch, oder die Datei ist dort noch nicht vorhanden."
    );
  }
  return { content: JSON.parse(new TextDecoder().decode(file.bytes)), source: "live", updatedAt: null, updatedBy: null };
}

app.get("/api/content", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;

  try {
    const working = await loadWorking(c);
    const pending = await c.env.DB.prepare("SELECT path, mime, bytes FROM pending_media ORDER BY path").all();

    return c.json({
      ...working,
      siteUrl: c.env.SITE_URL,
      pendingMedia: pending.results || [],
      head: await gh.getBranchHead(c.env).catch(() => null),
    });
  } catch (err) {
    // Haeufigster Fall: GITHUB_TOKEN fehlt oder ist abgelaufen.
    if (err instanceof gh.GitHubError) {
      return fail(c, 502, `Die Inhalte konnten nicht aus dem Repository geladen werden. ${err.message}`);
    }
    return fail(c, 500, `Die Inhalte konnten nicht geladen werden: ${err.message}`);
  }
});

app.put("/api/content", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");

  const body = await c.req.json().catch(() => null);
  if (!body?.content) return fail(c, 400, "Es wurden keine Inhalte übermittelt.");

  const errors = validateContent(body.content);
  if (errors.length) return fail(c, 400, "Die Inhalte sind noch nicht in Ordnung.", { errors });

  await c.env.DB.prepare(
    `INSERT INTO draft (id, content, updated_at, updated_by) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  )
    .bind(JSON.stringify(body.content), now(), s.email)
    .run();

  return c.json({ ok: true, savedAt: now() });
});

app.delete("/api/content", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM draft WHERE id = 1"),
    c.env.DB.prepare("DELETE FROM pending_media"),
  ]);
  await audit(c.env, { userId: c.get("session").user_id, email: c.get("session").email, action: "draft_discarded", ip: clientIp(c), now: now() });
  return c.json({ ok: true });
});

/* ---------- Vorschau ---------- */

app.get("/api/preview", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;

  try {
    const { content } = await loadWorking(c);
    const pending = await c.env.DB.prepare("SELECT path FROM pending_media").all();
    const html = previewHtml(content, c.env.SITE_URL, (pending.results || []).map((r) => r.path), new URL(c.req.url).origin);
    return c.html(html);
  } catch (err) {
    return c.html(
      `<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:24px;color:#b00">
       <strong>Vorschau nicht möglich:</strong> ${String(err.message).replace(/[<>&]/g, "")}</body>`,
      500
    );
  }
});

/* ---------- Veroeffentlichen ---------- */

app.post("/api/content/publish", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");
  const t = now();

  if (!githubConfigured(c.env)) {
    return fail(c, 503, "Das Backend ist noch nicht mit GitHub verbunden (GITHUB_TOKEN fehlt).");
  }

  try {
    const { content, source } = await loadWorking(c);
    if (source !== "draft") return fail(c, 400, "Es gibt keine ungespeicherten Änderungen zum Veröffentlichen.");

    assertValid(content);
    // Der Renderer muss durchlaufen, bevor irgendetwas committet wird.
    renderOrThrow(content);

    const body = await c.req.json().catch(() => ({}));
    const note = String(body.message || "").trim().slice(0, 120);

    const files = [
      {
        path: "content/site.json",
        content: JSON.stringify(content, null, 2) + "\n",
        encoding: "utf-8",
      },
    ];

    // Bilder aus dem Entwurf gehen im selben Commit mit raus.
    const pending = await c.env.DB.prepare("SELECT path, data_base64 FROM pending_media").all();
    for (const row of pending.results || []) {
      if (!isEditablePath(row.path)) return fail(c, 400, `Unzulässiger Dateipfad: ${row.path}`);
      files.push({ path: row.path, content: row.data_base64, encoding: "base64" });
    }

    const summary = note || "Inhalte über den Admin aktualisiert";
    const result = await gh.commitFiles(c.env, files, {
      message: `${summary}\n\nGeändert über den Website-Admin von ${s.email}.`,
      author: authorLine(s),
      expectedHead: body.expectedHead || undefined,
    });

    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM draft WHERE id = 1"),
      c.env.DB.prepare("DELETE FROM pending_media"),
    ]);
    await audit(c.env, {
      userId: s.user_id,
      email: s.email,
      action: "publish",
      detail: `${result.sha.slice(0, 7)} · ${files.length} Datei(en)`,
      ip: clientIp(c),
      now: t,
    });

    return c.json({ ok: true, commit: result, files: files.length });
  } catch (err) {
    if (err instanceof ValidationError) return fail(c, 400, "Die Inhalte sind noch nicht in Ordnung.", { errors: err.errors });
    if (err instanceof gh.GitHubError) return fail(c, err.status === 409 ? 409 : 502, err.message);
    return fail(c, 500, `Veröffentlichen fehlgeschlagen: ${err.message}`);
  }
});

app.get("/api/content/status", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;

  const draft = await c.env.DB.prepare("SELECT updated_at, updated_by FROM draft WHERE id = 1").first();
  const [history, deploy] = await Promise.all([
    gh.contentHistory(c.env, 10).catch(() => []),
    gh.latestDeployRun(c.env),
  ]);
  return c.json({ draft: draft || null, history, deploy });
});

/* ============================================================
   Bilder
   ============================================================ */

app.get("/api/media", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;

  const [live, pending] = await Promise.all([
    gh.listDirectory(c.env, "assets/img"),
    c.env.DB.prepare("SELECT path, mime, bytes, uploaded_at FROM pending_media ORDER BY path").all(),
  ]);

  return c.json({
    live: live.map((f) => ({ path: f.path, name: f.name, size: f.size })),
    pending: (pending.results || []).map((r) => ({ path: r.path, size: r.bytes, uploadedAt: r.uploaded_at })),
    siteUrl: c.env.SITE_URL,
  });
});

app.post("/api/media", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");

  try {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(c, 400, "Es wurde keine Datei übermittelt.");

    const path = mediaPath(form.get("filename") || file.name);
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) {
      return fail(c, 413, `Das Bild ist mit ${Math.round(buf.length / 1024)} kB zu groß (erlaubt: ${Math.round(MAX_IMAGE_BYTES / 1024)} kB).`);
    }
    if (buf.length === 0) return fail(c, 400, "Die Datei ist leer.");

    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);

    await c.env.DB.prepare(
      `INSERT INTO pending_media (path, data_base64, mime, bytes, uploaded_at, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET data_base64 = excluded.data_base64, mime = excluded.mime,
                                       bytes = excluded.bytes, uploaded_at = excluded.uploaded_at,
                                       uploaded_by = excluded.uploaded_by`
    )
      .bind(path, btoa(bin), file.type || "application/octet-stream", buf.length, now(), s.email)
      .run();

    return c.json({ ok: true, path, size: buf.length });
  } catch (err) {
    if (err instanceof ValidationError) return fail(c, 400, err.message);
    return fail(c, 500, `Hochladen fehlgeschlagen: ${err.message}`);
  }
});

/** Liefert ein noch nicht veroeffentlichtes Bild fuer die Vorschau aus. */
app.get("/api/media/pending/:path{.+}", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;

  const path = decodeURIComponent(c.req.param("path"));
  const row = await c.env.DB.prepare("SELECT data_base64, mime FROM pending_media WHERE path = ?").bind(path).first();
  if (!row) return c.notFound();

  const bytes = Uint8Array.from(atob(row.data_base64), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: { "Content-Type": row.mime, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
});

app.delete("/api/media/pending/:path{.+}", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  await c.env.DB.prepare("DELETE FROM pending_media WHERE path = ?").bind(decodeURIComponent(c.req.param("path"))).run();
  return c.json({ ok: true });
});

/* ============================================================
   Kataloge (PDF)
   ------------------------------------------------------------
   Anders als Bilder gehen PDFs sofort ins Repository: sie sind zu
   gross fuer den Entwurf und haengen nicht an der Seitenstruktur.

   Die Katalogliste selbst (kataloge/manifest.json) wird nicht hier
   geschrieben, sondern beim Deploy aus den vorhandenen PDFs und
   kataloge/titel.json erzeugt. Das Admin pflegt deshalb nur die
   Dateien und titel.json — und benutzt dafuer dieselbe Logik wie
   das Build-Skript (shared/kataloge.mjs), damit die Anzeige hier
   der spaeteren Live-Seite entspricht.
   ============================================================ */

const KATALOG_PREFIX = "kataloge/";
const MAX_TITEL_LAENGE = 120;

/** Ordnerinhalt und titel.json einlesen und zur fertigen Liste verbinden. */
async function katalogStand(env) {
  const [dateien, titelDatei] = await Promise.all([
    gh.listDirectory(env, "kataloge"),
    gh.getFile(env, TITEL_DATEI).catch(() => null),
  ]);

  let overrides = {};
  if (titelDatei) {
    try {
      overrides = JSON.parse(new TextDecoder().decode(titelDatei.bytes)) || {};
    } catch {
      overrides = {};
    }
  }

  const meta = new Map(dateien.map((f) => [f.name, f]));
  const eintraege = baueKataloge(
    dateien.map((f) => f.name),
    overrides
  ).map((e) => ({ ...e, size: meta.get(e.name)?.size ?? 0, sha: meta.get(e.name)?.sha || null }));

  return { eintraege, overrides };
}

/**
 * titel.json aus der Liste neu schreiben. Nebenbei verschwinden Eintraege
 * zu Dateien, die es nicht mehr gibt — sonst sammeln sich dort Leichen an.
 */
function titelDateiEintrag(eintraege) {
  return {
    path: TITEL_DATEI,
    content: JSON.stringify(serialisiereEintraege(eintraege), null, 2) + "\n",
    encoding: "utf-8",
  };
}

/** Ein einzelner Katalog anhand seines Dateinamens. */
function findeKatalog(eintraege, name) {
  const gesucht = String(name || "")
    .split(/[\\/]/)
    .pop();
  return eintraege.find((e) => e.name === gesucht) || null;
}

app.get("/api/kataloge", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;

  try {
    const { eintraege } = await katalogStand(c.env);
    return c.json({
      files: eintraege.map((e) => ({
        name: e.name,
        path: e.datei,
        id: e.id,
        size: e.size,
        title: e.titel,
        customTitle: e.eigenerTitel,
        autoTitle: e.autoTitel,
        hidden: e.versteckt,
      })),
      siteUrl: c.env.SITE_URL,
    });
  } catch (err) {
    if (err instanceof gh.GitHubError) return fail(c, 502, err.message);
    return fail(c, 500, `Katalogliste nicht lesbar: ${err.message}`);
  }
});

app.post("/api/kataloge", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");

  try {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(c, 400, "Es wurde keine Datei übermittelt.");

    const path = katalogPath(form.get("filename") || file.name);
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.length > MAX_PDF_BYTES) {
      return fail(c, 413, `Die PDF ist mit ${Math.round(buf.length / 1024 / 1024)} MB zu groß (erlaubt: ${MAX_PDF_BYTES / 1_000_000} MB).`);
    }
    // PDFs beginnen immer mit %PDF- — schuetzt vor versehentlich falschen Dateien.
    if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) {
      return fail(c, 400, "Die Datei ist keine gültige PDF.");
    }

    let bin = "";
    const CHUNK = 8192;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    }

    const name = path.slice(KATALOG_PREFIX.length);
    const files = [{ path, content: btoa(bin), encoding: "base64" }];

    /* Anzeigename mit ablegen, falls einer mitgeschickt wurde. Der Schluessel
       in titel.json ist der Dateiname OHNE .pdf — genau so liest ihn das
       Build-Skript. */
    const titel = String(form.get("title") || "").trim().slice(0, MAX_TITEL_LAENGE);
    const { eintraege } = await katalogStand(c.env);
    const vorhanden = findeKatalog(eintraege, name);

    if (titel || vorhanden) {
      const liste = vorhanden
        ? eintraege.map((e) => (e.name === name ? { ...e, eigenerTitel: titel || e.eigenerTitel } : e))
        : [...eintraege, { base: katalogBase(name), eigenerTitel: titel, position: null, versteckt: false }];
      files.push(titelDateiEintrag(liste));
    }

    const result = await gh.commitFiles(c.env, files, {
      message: `Katalog ${name} ${vorhanden ? "ersetzt" : "hinzugefügt"}\n\nHochgeladen über den Website-Admin von ${s.email}.`,
      author: authorLine(s),
    });

    await audit(c.env, { userId: s.user_id, email: s.email, action: "katalog_upload", detail: path, ip: clientIp(c), now: now() });
    return c.json({ ok: true, path, commit: result });
  } catch (err) {
    if (err instanceof ValidationError) return fail(c, 400, err.message);
    if (err instanceof gh.GitHubError) return fail(c, 502, err.message);
    return fail(c, 500, `Hochladen fehlgeschlagen: ${err.message}`);
  }
});

/**
 * Anzeigename aendern, ein-/ausblenden und die Datei umbenennen — alles in
 * einem Commit, damit die Seite nie mit halbem Stand deployt wird.
 */
app.patch("/api/kataloge/:name", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");

  try {
    const body = await c.req.json().catch(() => ({}));
    const { eintraege } = await katalogStand(c.env);
    const katalog = findeKatalog(eintraege, c.req.param("name"));
    if (!katalog) return fail(c, 404, "Diesen Katalog gibt es nicht (mehr).");

    let name = katalog.name;
    const dateien = [];

    /* --- Datei umbenennen --- */
    if (body.filename !== undefined) {
      const neuerPfad = katalogPath(body.filename);
      if (!isEditablePath(neuerPfad)) return fail(c, 400, "Unzulässiger Pfad.");
      const neuerName = neuerPfad.slice(KATALOG_PREFIX.length);

      if (neuerName !== katalog.name) {
        if (eintraege.some((e) => e.name !== katalog.name && e.name.toLowerCase() === neuerName.toLowerCase())) {
          return fail(c, 409, `„${neuerName}" gibt es bereits. Bitte einen anderen Dateinamen wählen.`);
        }
        if (!katalog.sha) return fail(c, 500, "Die Datei konnte im Repository nicht gefunden werden.");
        // Der vorhandene Blob wandert nur an einen neuen Pfad — die PDF muss
        // dafuer nicht erneut hochgeladen werden.
        dateien.push({ path: neuerPfad, sha: katalog.sha });
        dateien.push({ path: `${KATALOG_PREFIX}${katalog.name}`, remove: true });
        name = neuerName;
      }
    }

    const geaendert = {
      ...katalog,
      name,
      base: katalogBase(name),
      eigenerTitel:
        body.title === undefined
          ? katalog.eigenerTitel
          : String(body.title || "").trim().slice(0, MAX_TITEL_LAENGE),
      versteckt: body.hidden === undefined ? katalog.versteckt : Boolean(body.hidden),
    };

    const liste = eintraege.map((e) => (e.name === katalog.name ? geaendert : e));
    dateien.push(titelDateiEintrag(liste));

    const teile = [];
    if (name !== katalog.name) teile.push(`in ${name} umbenannt`);
    if (body.title !== undefined && geaendert.eigenerTitel !== katalog.eigenerTitel) teile.push("Anzeigename geändert");
    if (body.hidden !== undefined && geaendert.versteckt !== katalog.versteckt) {
      teile.push(geaendert.versteckt ? "ausgeblendet" : "eingeblendet");
    }
    if (!teile.length) return c.json({ ok: true, name, unchanged: true });

    const commit = await gh.commitFiles(c.env, dateien, {
      message: `Katalog ${katalog.name}: ${teile.join(", ")}\n\nGeändert über den Website-Admin von ${s.email}.`,
      author: authorLine(s),
    });

    await audit(c.env, {
      userId: s.user_id,
      email: s.email,
      action: "katalog_update",
      detail: `${katalog.name}: ${teile.join(", ")}`,
      ip: clientIp(c),
      now: now(),
    });
    return c.json({ ok: true, name, commit });
  } catch (err) {
    if (err instanceof ValidationError) return fail(c, 400, err.message);
    if (err instanceof gh.GitHubError) return fail(c, 502, err.message);
    return fail(c, 500, `Ändern fehlgeschlagen: ${err.message}`);
  }
});

/** Reihenfolge festlegen: die Dateinamen in der gewuenschten Abfolge. */
app.put("/api/kataloge/reihenfolge", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");

  try {
    const body = await c.req.json().catch(() => ({}));
    const namen = Array.isArray(body.names) ? body.names.map((n) => String(n)) : null;
    if (!namen || !namen.length) return fail(c, 400, "Es wurde keine Reihenfolge übermittelt.");

    const { eintraege } = await katalogStand(c.env);
    const unbekannt = namen.filter((n) => !eintraege.some((e) => e.name === n));
    if (unbekannt.length) return fail(c, 409, "Die Liste hat sich zwischenzeitlich geändert. Bitte neu laden.");

    // Nicht mitgeschickte Kataloge hinten anhaengen, damit keiner verloren geht.
    const reihenfolge = [...namen, ...eintraege.filter((e) => !namen.includes(e.name)).map((e) => e.name)];
    const liste = reihenfolge.map((n, i) => ({ ...eintraege.find((e) => e.name === n), position: i + 1 }));

    const commit = await gh.commitFiles(c.env, [titelDateiEintrag(liste)], {
      message: `Katalog-Reihenfolge geändert\n\nGeändert über den Website-Admin von ${s.email}.`,
      author: authorLine(s),
    });

    await audit(c.env, {
      userId: s.user_id,
      email: s.email,
      action: "katalog_order",
      detail: reihenfolge.join(", ").slice(0, 300),
      ip: clientIp(c),
      now: now(),
    });
    return c.json({ ok: true, commit });
  } catch (err) {
    if (err instanceof gh.GitHubError) return fail(c, 502, err.message);
    return fail(c, 500, `Reihenfolge speichern fehlgeschlagen: ${err.message}`);
  }
});

app.delete("/api/kataloge/:name", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");

  try {
    const path = katalogPath(c.req.param("name"));
    if (!isEditablePath(path)) return fail(c, 400, "Unzulässiger Pfad.");

    const name = path.slice(KATALOG_PREFIX.length);
    const { eintraege } = await katalogStand(c.env);
    if (!findeKatalog(eintraege, name)) return fail(c, 404, "Diesen Katalog gibt es nicht (mehr).");

    // PDF und der zugehoerige Eintrag in titel.json verschwinden zusammen.
    await gh.commitFiles(
      c.env,
      [{ path, remove: true }, titelDateiEintrag(eintraege.filter((e) => e.name !== name))],
      {
        message: `Katalog ${name} entfernt\n\nGelöscht über den Website-Admin von ${s.email}.`,
        author: authorLine(s),
      }
    );

    await audit(c.env, { userId: s.user_id, email: s.email, action: "katalog_delete", detail: path, ip: clientIp(c), now: now() });
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof ValidationError) return fail(c, 400, err.message);
    if (err instanceof gh.GitHubError) return fail(c, 502, err.message);
    return fail(c, 500, `Löschen fehlgeschlagen: ${err.message}`);
  }
});

/* ============================================================
   Benutzer & Einladungen
   ------------------------------------------------------------
   Weitere Konten entstehen ueber eine Einladung: die einladende
   Person erzeugt einen einmalig gueltigen Link, die eingeladene
   setzt ihr Passwort selbst. So wandert nie ein Passwort durch
   einen Chat oder eine Mail.
   ============================================================ */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Wie viele Konten koennen sich noch anmelden? Schuetzt vor dem Aussperren. */
async function activeUserCount(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE disabled = 0").first();
  return row.n;
}

app.get("/api/users", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");

  const users = await c.env.DB.prepare(
    `SELECT id, email, name, role, disabled, totp_enabled, created_at, last_login_at
       FROM users ORDER BY created_at`
  ).all();

  const invites = await c.env.DB.prepare(
    `SELECT id, email, role, created_at, expires_at, created_by
       FROM invites WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC`
  )
    .bind(now())
    .all();

  return c.json({
    users: (users.results || []).map((u) => ({ ...u, self: u.id === s.user_id })),
    invites: invites.results || [],
  });
});

app.post("/api/users/invite", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");
  const t = now();

  const { email } = await c.req.json().catch(() => ({}));
  const mail = String(email || "").toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(mail)) return fail(c, 400, "E-Mail-Adresse ist ungültig.");

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(mail).first();
  if (existing) return fail(c, 409, "Für diese E-Mail gibt es bereits ein Konto.");

  // Offene Einladung an dieselbe Adresse ersetzen, statt zwei gueltige zu haben.
  await c.env.DB.prepare("DELETE FROM invites WHERE email = ? AND used_at IS NULL").bind(mail).run();

  const token = randomToken(32);
  const id = randomToken(12);
  await c.env.DB.prepare(
    `INSERT INTO invites (id, email, token_hash, role, created_at, created_by, expires_at)
     VALUES (?, ?, ?, 'editor', ?, ?, ?)`
  )
    .bind(id, mail, await sha256Hex(token), t, s.email, t + INVITE_TTL_MS)
    .run();

  await audit(c.env, {
    userId: s.user_id,
    email: s.email,
    action: "invite_created",
    detail: mail,
    ip: clientIp(c),
    now: t,
  });

  // Der Link enthaelt das Token im Klartext – gespeichert ist nur dessen Hash,
  // er laesst sich also spaeter nicht noch einmal anzeigen.
  const base = allowedOrigins(c.env)[0] || new URL(c.req.url).origin;
  return c.json({
    ok: true,
    email: mail,
    expiresAt: t + INVITE_TTL_MS,
    url: `${base}/?einladung=${token}`,
  });
});

app.delete("/api/users/invite/:id", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");

  await c.env.DB.prepare("DELETE FROM invites WHERE id = ? AND used_at IS NULL")
    .bind(c.req.param("id"))
    .run();
  await audit(c.env, { userId: s.user_id, email: s.email, action: "invite_revoked", ip: clientIp(c), now: now() });
  return c.json({ ok: true });
});

/** Gueltigkeit einer Einladung pruefen – ohne Anmeldung, deshalb sparsam. */
app.get("/api/invite/:token", async (c) => {
  const row = await c.env.DB.prepare("SELECT email, expires_at, used_at FROM invites WHERE token_hash = ?")
    .bind(await sha256Hex(c.req.param("token")))
    .first();

  if (!row || row.used_at || row.expires_at <= now()) {
    return fail(c, 404, "Diese Einladung ist ungültig oder abgelaufen.");
  }
  return c.json({ email: row.email, expiresAt: row.expires_at });
});

/** Einladung annehmen: Konto anlegen und gleich anmelden. */
app.post("/api/invite/:token", async (c) => {
  const t = now();
  const ip = clientIp(c);

  // Auch hier bremsen, sonst liesse sich der Token-Raum absuchen.
  const key = `invite:${ip}`;
  const wait = await checkRateLimit(c.env, key, t);
  if (wait) return fail(c, 429, `Zu viele Versuche. Bitte in ${Math.ceil(wait / 60)} Minuten erneut versuchen.`);

  const invite = await c.env.DB.prepare(
    "SELECT id, email, role, expires_at, used_at FROM invites WHERE token_hash = ?"
  )
    .bind(await sha256Hex(c.req.param("token")))
    .first();

  if (!invite || invite.used_at || invite.expires_at <= t) {
    await registerFailure(c.env, key, t);
    return fail(c, 404, "Diese Einladung ist ungültig oder abgelaufen.");
  }

  const { name, password } = await c.req.json().catch(() => ({}));
  const problem = checkPasswordRules(password);
  if (problem) return fail(c, 400, problem);

  const existing = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(invite.email).first();
  if (existing) return fail(c, 409, "Für diese E-Mail gibt es bereits ein Konto.");

  const iterations = Number(c.env.PBKDF2_ITERATIONS || 600000);
  const userId = randomToken(16);
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, email, name, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      userId,
      invite.email,
      String(name || "").slice(0, 80),
      await hashPassword(password, iterations),
      invite.role,
      t
    ),
    c.env.DB.prepare("UPDATE invites SET used_at = ?, used_by = ? WHERE id = ?").bind(t, userId, invite.id),
  ]);

  await clearFailures(c.env, [key]);
  await audit(c.env, { userId, email: invite.email, action: "invite_accepted", ip, now: t });

  // Direkt anmelden – der zweite Faktor wird gleich danach eingerichtet.
  const session = await createSession(c.env, userId, {
    mfaDone: false,
    ip,
    userAgent: c.req.header("User-Agent"),
    now: t,
  });
  c.header(
    "Set-Cookie",
    sessionCookie(session.token, Math.floor((session.expiresAt - t) / 1000), cookieSecure(c.env))
  );

  return c.json({ ok: true, mfaSetupRequired: true, user: { email: invite.email, name } });
});

app.post("/api/users/:id/disabled", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");
  const id = c.req.param("id");

  if (id === s.user_id) return fail(c, 400, "Das eigene Konto lässt sich nicht sperren.");

  const { disabled } = await c.req.json().catch(() => ({}));
  const target = await c.env.DB.prepare("SELECT id, email, disabled FROM users WHERE id = ?").bind(id).first();
  if (!target) return fail(c, 404, "Konto nicht gefunden.");

  // Niemals das letzte aktive Konto sperren – sonst kommt niemand mehr hinein.
  if (disabled && !target.disabled && (await activeUserCount(c.env)) <= 1) {
    return fail(c, 400, "Das letzte aktive Konto lässt sich nicht sperren.");
  }

  await c.env.DB.prepare("UPDATE users SET disabled = ? WHERE id = ?").bind(disabled ? 1 : 0, id).run();
  // Gesperrte Konten sofort abmelden.
  if (disabled) await destroyAllSessions(c.env, id);

  await audit(c.env, {
    userId: s.user_id,
    email: s.email,
    action: disabled ? "user_disabled" : "user_enabled",
    detail: target.email,
    ip: clientIp(c),
    now: now(),
  });
  return c.json({ ok: true });
});

app.delete("/api/users/:id", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const s = c.get("session");
  const id = c.req.param("id");

  if (id === s.user_id) return fail(c, 400, "Das eigene Konto lässt sich nicht löschen.");

  const target = await c.env.DB.prepare("SELECT id, email, disabled FROM users WHERE id = ?").bind(id).first();
  if (!target) return fail(c, 404, "Konto nicht gefunden.");
  if (!target.disabled && (await activeUserCount(c.env)) <= 1) {
    return fail(c, 400, "Das letzte aktive Konto lässt sich nicht löschen.");
  }

  // Sitzungen und Wiederherstellungscodes haengen per ON DELETE CASCADE daran.
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  await audit(c.env, {
    userId: s.user_id,
    email: s.email,
    action: "user_deleted",
    detail: target.email,
    ip: clientIp(c),
    now: now(),
  });
  return c.json({ ok: true });
});

/* ============================================================
   Protokoll & Systemstatus
   ============================================================ */

app.get("/api/audit", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;
  const rows = await c.env.DB.prepare(
    "SELECT at, email, action, detail FROM audit_log ORDER BY at DESC LIMIT 50"
  ).all();
  return c.json({ entries: rows.results || [] });
});

/* Lebenszeichen ohne Anmeldung – für den Healthcheck des Containers.
   Verrät bewusst nichts über Konfiguration oder Zustand. */
app.get("/api/ping", (c) => c.json({ ok: true }));

app.get("/api/health", async (c) => {
  const guard = await requireUser(c);
  if (guard) return guard;

  const access = await gh.checkAccess(c.env).catch((err) => ({ error: err.message }));
  return c.json({
    github: access,
    branch: c.env.GITHUB_BRANCH,
    siteUrl: c.env.SITE_URL,
    setupEnabled: c.env.SETUP_ENABLED === "true",
  });
});

/* ============================================================
   Statische Admin-Oberflaeche
   ============================================================ */

app.all("/api/*", (c) => fail(c, 404, "Unbekannter Endpunkt."));

app.get("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  if (res.status === 404) {
    // Einseitige Oberflaeche: alles Unbekannte zeigt die Startseite.
    return c.env.ASSETS.fetch(new Request(new URL("/index.html", c.req.url), c.req.raw));
  }
  return res;
});

export default app;
