/* ============================================================
   TOTP (RFC 6238) — zweiter Faktor per Authenticator-App
   ------------------------------------------------------------
   6 Ziffern, 30-Sekunden-Fenster, HMAC-SHA1 — genau das, was
   Google Authenticator, Aegis, 1Password & Co. erwarten.
   ============================================================ */

import { randomBytes, timingSafeEqual } from "./crypto.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;
/* Ein Schritt Toleranz in beide Richtungen faengt ungenaue Uhren ab. */
export const TOTP_WINDOW = 1;

/* ---------- Base32 ---------- */

export function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error("Ungültiges Base32-Zeichen");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Neues Geheimnis (160 Bit — die uebliche Groesse fuer TOTP). */
export function generateSecret() {
  return base32Encode(randomBytes(20));
}

/* ---------- Codeberechnung ---------- */

/** Zeitschritt zu einem Zeitpunkt in Millisekunden. */
export function stepFor(nowMs) {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD);
}

/** Erzeugt den Code fuer einen bestimmten Zeitschritt. */
export async function totpCode(secretBase32, step) {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secretBase32),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  // Zeitschritt als 8-Byte-Zahl in Big-Endian.
  const counter = new Uint8Array(8);
  let rest = step;
  for (let i = 7; i >= 0; i--) {
    counter[i] = rest & 0xff;
    rest = Math.floor(rest / 256);
  }

  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  // Dynamic Truncation nach RFC 4226.
  const offset = mac[mac.length - 1] & 0x0f;
  const bin =
    ((mac[offset] & 0x7f) << 24) |
    ((mac[offset + 1] & 0xff) << 16) |
    ((mac[offset + 2] & 0xff) << 8) |
    (mac[offset + 3] & 0xff);

  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Prueft einen eingegebenen Code.
 * @returns {Promise<number|null>} der akzeptierte Zeitschritt oder null
 */
export async function verifyTotp(secretBase32, code, nowMs, lastUsedStep = null) {
  const input = String(code || "").replace(/\D/g, "");
  if (input.length !== TOTP_DIGITS) return null;

  const current = stepFor(nowMs);
  for (let offset = -TOTP_WINDOW; offset <= TOTP_WINDOW; offset++) {
    const step = current + offset;
    // Ein bereits benutzter Code darf innerhalb seiner Gueltigkeit nicht
    // erneut zaehlen (Schutz gegen Wiedereinspielen).
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (timingSafeEqual(await totpCode(secretBase32, step), input)) return step;
  }
  return null;
}

/** otpauth-URI fuer den QR-Code in der Authenticator-App. */
export function otpauthUri(secretBase32, accountName, issuer) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ---------- Wiederherstellungscodes ---------- */

/** Zehn gut abschreibbare Codes im Format xxxx-xxxx. */
export function generateRecoveryCodes(count = 10) {
  // Ohne 0/O/1/I/L, damit beim Abtippen nichts verwechselt wird.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const codes = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(8);
    let s = "";
    for (const b of raw) s += alphabet[b % alphabet.length];
    codes.push(`${s.slice(0, 4)}-${s.slice(4, 8)}`);
  }
  return codes;
}

/** Eingabe vereinheitlichen, damit Gross-/Kleinschreibung egal ist. */
export function normalizeRecoveryCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
