import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fromBase64,
  hashPassword,
  needsRehash,
  randomToken,
  sha256Hex,
  timingSafeEqual,
  toBase64,
  verifyPassword,
} from "../src/crypto.js";

/* Fuer Tests bewusst niedrig, damit sie schnell durchlaufen. */
const ROUNDS = 10_000;

test("Base64 kodiert und dekodiert verlustfrei", () => {
  const bytes = new Uint8Array([0, 1, 127, 128, 255]);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test("Passwort lässt sich prüfen", async () => {
  const hash = await hashPassword("Sonnenschein2026!", ROUNDS);
  assert.match(hash, /^pbkdf2\$10000\$[^$]+\$[^$]+$/);
  assert.equal(await verifyPassword("Sonnenschein2026!", hash), true);
  assert.equal(await verifyPassword("sonnenschein2026!", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("Jeder Hash bekommt ein eigenes Salt", async () => {
  const a = await hashPassword("Sonnenschein2026!", ROUNDS);
  const b = await hashPassword("Sonnenschein2026!", ROUNDS);
  assert.notEqual(a, b);
  // Trotzdem passen beide zum selben Passwort.
  assert.equal(await verifyPassword("Sonnenschein2026!", a), true);
  assert.equal(await verifyPassword("Sonnenschein2026!", b), true);
});

test("Kaputte oder manipulierte Hashes werden abgelehnt", async () => {
  for (const bad of ["", "kein-hash", "pbkdf2$abc$x$y", "pbkdf2$1$aa$bb", null, undefined, "md5$1000$a$b"]) {
    assert.equal(await verifyPassword("egal", bad), false, `Hash: ${bad}`);
  }
});

test("needsRehash erkennt zu schwach gehashte Passwörter", async () => {
  const hash = await hashPassword("Sonnenschein2026!", ROUNDS);
  assert.equal(needsRehash(hash, ROUNDS), false);
  assert.equal(needsRehash(hash, ROUNDS * 2), true);
  assert.equal(needsRehash("kaputt", ROUNDS), true);
});

test("timingSafeEqual vergleicht korrekt", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("", ""), true);
});

test("randomToken liefert URL-taugliche, eindeutige Werte", () => {
  const tokens = new Set();
  for (let i = 0; i < 50; i++) {
    const token = randomToken(32);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    tokens.add(token);
  }
  assert.equal(tokens.size, 50);
});

test("sha256Hex liefert den bekannten Hash", async () => {
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});
