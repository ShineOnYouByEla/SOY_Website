import assert from "node:assert/strict";
import { test } from "node:test";

import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateSecret,
  normalizeRecoveryCode,
  otpauthUri,
  stepFor,
  totpCode,
  verifyTotp,
} from "../src/totp.js";

/* Das Geheimnis aus RFC 6238, Anhang B: ASCII "12345678901234567890". */
const RFC_SECRET = base32Encode(new TextEncoder().encode("12345678901234567890"));

test("Base32 kodiert und dekodiert verlustfrei", () => {
  assert.equal(RFC_SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64]);
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
});

test("Base32 verträgt Leerzeichen und Kleinschreibung", () => {
  const withSpaces = RFC_SECRET.toLowerCase().replace(/(.{4})/g, "$1 ");
  assert.deepEqual(base32Decode(withSpaces), base32Decode(RFC_SECRET));
});

test("TOTP entspricht den Testvektoren aus RFC 6238", async () => {
  // Zeitpunkt (Sekunden) -> die letzten 6 Stellen des Referenzwerts.
  const vectors = [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ];

  for (const [seconds, expected] of vectors) {
    const code = await totpCode(RFC_SECRET, stepFor(seconds * 1000));
    assert.equal(code, expected, `Zeitpunkt ${seconds}`);
  }
});

test("verifyTotp akzeptiert den aktuellen Code", async () => {
  const nowMs = 1_700_000_000_000;
  const code = await totpCode(RFC_SECRET, stepFor(nowMs));
  assert.equal(await verifyTotp(RFC_SECRET, code, nowMs), stepFor(nowMs));
});

test("verifyTotp toleriert eine Uhr, die um ein Fenster abweicht", async () => {
  const nowMs = 1_700_000_000_000;
  for (const offset of [-30_000, 30_000]) {
    const code = await totpCode(RFC_SECRET, stepFor(nowMs + offset));
    assert.equal(
      await verifyTotp(RFC_SECRET, code, nowMs),
      stepFor(nowMs + offset),
      `Abweichung ${offset} ms`
    );
  }
});

test("verifyTotp lehnt Codes ausserhalb des Fensters ab", async () => {
  const nowMs = 1_700_000_000_000;
  const code = await totpCode(RFC_SECRET, stepFor(nowMs + 120_000));
  assert.equal(await verifyTotp(RFC_SECRET, code, nowMs), null);
});

test("verifyTotp verhindert das Wiedereinspielen eines Codes", async () => {
  const nowMs = 1_700_000_000_000;
  const step = stepFor(nowMs);
  const code = await totpCode(RFC_SECRET, step);

  // Erste Verwendung geht durch …
  assert.equal(await verifyTotp(RFC_SECRET, code, nowMs, null), step);
  // … eine zweite mit demselben Schritt nicht mehr.
  assert.equal(await verifyTotp(RFC_SECRET, code, nowMs, step), null);
});

test("verifyTotp weist unbrauchbare Eingaben ab", async () => {
  const nowMs = 1_700_000_000_000;
  for (const bad of ["", "12345", "1234567", "abcdef", null, undefined]) {
    assert.equal(await verifyTotp(RFC_SECRET, bad, nowMs), null, `Eingabe: ${bad}`);
  }
});

test("generateSecret liefert 160 Bit in Base32", () => {
  const secret = generateSecret();
  assert.equal(secret.length, 32);
  assert.equal(base32Decode(secret).length, 20);
  assert.notEqual(secret, generateSecret());
});

test("otpauth-URI enthält alle nötigen Angaben", () => {
  const uri = otpauthUri("ABCDEFGHIJKLMNOP", "ela@example.com", "Shine On You");
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=ABCDEFGHIJKLMNOP/);
  assert.match(uri, /issuer=Shine\+On\+You/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
  // Der Doppelpunkt im Label muss kodiert sein, sonst brechen manche Apps ab.
  assert.match(uri, /totp\/Shine%20On%20You%3Aela%40example.com/);
});

test("Wiederherstellungscodes sind eindeutig und gut lesbar", () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    // Verwechslungsgefahr: 0/O und 1/I/L kommen bewusst nicht vor.
    assert.doesNotMatch(code, /[01OIL]/);
  }
});

test("normalizeRecoveryCode ignoriert Schreibweise und Trennzeichen", () => {
  assert.equal(normalizeRecoveryCode("ab2c-3d4e"), "AB2C3D4E");
  assert.equal(normalizeRecoveryCode(" AB2C 3D4E "), "AB2C3D4E");
  assert.equal(normalizeRecoveryCode(null), "");
});
