/* ============================================================
   SQLite im Gewand der D1-API
   ------------------------------------------------------------
   Damit läuft derselbe Anwendungscode gegen Cloudflare D1 und
   gegen eine lokale SQLite-Datei — ohne eine einzige Abfrage
   doppelt zu schreiben.

   Nachgebildet wird genau der Teil der D1-API, den app.js und
   auth.js benutzen:
     db.prepare(sql).bind(...).first() | .run() | .all()
     db.batch([...])
   ============================================================ */

import { DatabaseSync } from "node:sqlite";

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  /** Gibt wie bei D1 eine neue Anweisung zurück, statt diese zu verändern. */
  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }

  async first() {
    const row = this.db.prepare(this.sql).get(...this.params);
    // node:sqlite liefert Objekte ohne Prototyp; für `?.`-Zugriffe egal,
    // aber ein normales Objekt verhält sich überall erwartbar.
    return row === undefined ? null : { ...row };
  }

  async all() {
    const rows = this.db.prepare(this.sql).all(...this.params);
    return { results: rows.map((r) => ({ ...r })), success: true };
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) },
    };
  }
}

class Database {
  constructor(path) {
    this.db = new DatabaseSync(path);
    // Fremdschlüssel sind in SQLite standardmäßig aus – ohne das greift
    // ON DELETE CASCADE im Schema nicht.
    this.db.exec("PRAGMA foreign_keys = ON");
    // WAL: Lesen blockiert nicht mehr gegen Schreiben.
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
  }

  prepare(sql) {
    return new Statement(this.db, sql);
  }

  /** Alle Anweisungen in einer Transaktion – wie db.batch() bei D1. */
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const st of statements) results.push(await st.run());
      this.db.exec("COMMIT");
      return results;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** Mehrere Anweisungen am Stück ausführen – für das Schema beim Start. */
  exec(sql) {
    this.db.exec(sql);
  }

  close() {
    this.db.close();
  }
}

export function openDatabase(path) {
  return new Database(path);
}
