/* ============================================================
   Kryptografische Grundlagen
   ------------------------------------------------------------
   Alles ueber die WebCrypto-API der Workers-Laufzeit — keine
   externen Abhaengigkeiten.
   ============================================================ */

const enc = new TextEncoder();

/* ---------- Kodierung ---------- */

export function toBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Zufallstoken in URL-tauglicher Schreibweise. */
export function randomToken(bytes = 32) {
  return toBase64(randomBytes(bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(input) {
  const data = typeof input === "string" ? enc.encode(input) : input;
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

/**
 * Vergleich ohne Zeitunterschied. Wichtig bei Tokens und Codes:
 * ein frueher Abbruch verraet sonst, wie viele Zeichen stimmten.
 */
export function timingSafeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  // Laenge ist ohnehin oeffentlich; ueber die volle Laenge weiterrechnen.
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/* ---------- Passwoerter ---------- */

/**
 * PBKDF2-HMAC-SHA256. Die Iterationszahl steckt mit im Hash, damit sie
 * spaeter erhoeht werden kann, ohne alte Passwoerter ungueltig zu machen.
 */
export async function hashPassword(password, iterations) {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, iterations);
  return `pbkdf2$${iterations}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1000) return false;
  const salt = fromBase64(parts[2]);
  const hash = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(toBase64(hash), parts[3]);
}

/** Sagt, ob ein gespeicherter Hash mit weniger Runden erzeugt wurde. */
export function needsRehash(stored, iterations) {
  const parts = String(stored || "").split("$");
  return parts[0] !== "pbkdf2" || Number(parts[1]) < iterations;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}
