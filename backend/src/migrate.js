/* ============================================================
   Nachtraegliche Schemaaenderungen
   ------------------------------------------------------------
   schema.sql legt Tabellen nur an, wenn es sie noch nicht gibt
   (IF NOT EXISTS). Eine neue Spalte kommt so in eine bestehende
   Datenbank nie hinein — und SQLite kennt kein
   „ADD COLUMN IF NOT EXISTS". Deshalb hier: erst nachsehen, ob
   die Spalte da ist, dann gegebenenfalls anlegen.

   Laeuft unter Node beim Start (src/node.js) und im Worker vor
   dem ersten Zugriff auf den Entwurf — der Worker hat keinen
   Startzeitpunkt, an dem man das sonst erledigen koennte.
   Jede Migration muss beliebig oft hintereinander laufen duerfen.
   ============================================================ */

const SPALTEN = [
  // Auf welchem Stand von main der Entwurf beruht. Ohne diese Angabe hat
  // 4cb5b1c einen Wochen alten Entwurf ueber neuere Commits gelegt.
  { tabelle: "draft", spalte: "base_sha", typ: "TEXT" },
];

async function hatSpalte(db, tabelle, spalte) {
  try {
    await db.prepare(`SELECT ${spalte} FROM ${tabelle} LIMIT 1`).first();
    return true;
  } catch (err) {
    if (/no such column/i.test(String(err?.message))) return false;
    throw err;
  }
}

export async function migrate(db) {
  for (const { tabelle, spalte, typ } of SPALTEN) {
    if (!(await hatSpalte(db, tabelle, spalte))) {
      await db.prepare(`ALTER TABLE ${tabelle} ADD COLUMN ${spalte} ${typ}`).run();
    }
  }
}

const erledigt = new WeakSet();

/** Einmal je Datenbankobjekt — danach kostet der Aufruf nichts mehr. */
export async function ensureMigrated(db) {
  if (!db || erledigt.has(db)) return;
  await migrate(db);
  erledigt.add(db);
}
