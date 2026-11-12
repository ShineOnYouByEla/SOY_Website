/* ============================================================
   Entwurf und Live-Stand zusammenfuehren
   ------------------------------------------------------------
   Ein Entwurf ist eine vollstaendige Kopie von content/site.json.
   Liegt er laenger in der Datenbank, waehrend auf dem Live-Branch
   per Pull Request weitergearbeitet wird, wuerde ein Veroeffentlichen
   alles ueberschreiben, was dort inzwischen dazugekommen ist. So ist
   am 22.09.2026 der WhatsApp-Chat verschwunden (Commit 4cb5b1c).

   Deshalb ein Drei-Wege-Vergleich: Basis ist der Stand, auf dem der
   Entwurf beruht. Was nur eine Seite geaendert hat, gewinnt; was
   beide unterschiedlich geaendert haben, ist ein Konflikt.

   Bewusst ohne Node-APIs: laeuft im Worker wie unter Node.
   ============================================================ */

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Tiefer Vergleich fuer JSON-Werte. undefined steht fuer „Feld fehlt“. */
export function gleich(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => gleich(x, b[i]));
  }
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => gleich(a[k], b[k]));
  }
  return false;
}

/* Listen aus Objekten mit eigener Kennung (die Sektionen) werden Eintrag fuer
   Eintrag zusammengefuehrt — sonst waere jede Aenderung an zwei verschiedenen
   Sektionen ein Konflikt, nur weil beide in derselben Liste stehen. */
const mitKennung = (liste) =>
  Array.isArray(liste) &&
  liste.every((x) => isObj(x) && typeof x.id === "string") &&
  new Set(liste.map((x) => x.id)).size === liste.length;

/**
 * @param {unknown} basis  Stand, auf dem der Entwurf beruht
 * @param {unknown} entwurf
 * @param {unknown} live   aktueller Stand auf dem Live-Branch
 * @param {{ entscheidungen?: Record<string, "entwurf"|"live"> }} [optionen]
 *   Was bei einem bereits gemeldeten Konflikt gelten soll, je Pfad. Eine
 *   entschiedene Stelle ist kein Konflikt mehr.
 * @returns {{ ergebnis: unknown, konflikte: string[], details: Array<{pfad: string, entwurf: unknown, live: unknown}>, entschieden: Record<string, "entwurf"|"live"> }}
 *   Bei offenen Konflikten steht im Ergebnis der Wert des Entwurfs — wer
 *   trotzdem veroeffentlicht, hat sich ausdruecklich dafuer entschieden.
 *   `details` traegt zu jedem offenen Konflikt beide Werte, damit der Editor
 *   sie zur Wahl stellen kann (undefined: Feld fehlt auf dieser Seite).
 */
export function mergeContent(basis, entwurf, live, { entscheidungen = {} } = {}) {
  const details = [];
  // Nur Entscheidungen, die tatsaechlich einen Konflikt aufgeloest haben —
  // eine veraltete Wahl fuer eine Stelle, die gar nicht mehr streitig ist, zaehlt nicht.
  const entschieden = {};
  const ergebnis = mische(basis, entwurf, live, "", { details, entscheidungen, entschieden });
  return { ergebnis, konflikte: details.map((d) => d.pfad), details, entschieden };
}

function mische(basis, entwurf, live, pfad, ctx) {
  if (gleich(entwurf, live)) return entwurf;
  if (gleich(entwurf, basis)) return live;
  if (gleich(live, basis)) return entwurf;

  // Beide Seiten haben geaendert. Nur Gleichartiges laesst sich weiter zerlegen.
  if (isObj(entwurf) && isObj(live)) {
    const b = isObj(basis) ? basis : {};
    const out = {};
    const schluessel = verzahne(Object.keys(entwurf), Object.keys(live));
    for (const k of schluessel) {
      const wert = mische(b[k], entwurf[k], live[k], pfad ? `${pfad}.${k}` : k, ctx);
      if (wert !== undefined) out[k] = wert;
    }
    return out;
  }

  if (mitKennung(entwurf) && mitKennung(live) && (basis === undefined || mitKennung(basis))) {
    return mischeListe(basis || [], entwurf, live, pfad, ctx);
  }

  const ort = pfad || "(gesamter Inhalt)";
  // Nur eigene Schluessel: ein Pfad wie "constructor" darf nicht aus dem Prototyp kommen.
  const wahl = Object.prototype.hasOwnProperty.call(ctx.entscheidungen, ort) ? ctx.entscheidungen[ort] : null;
  if (wahl === "live" || wahl === "entwurf") {
    ctx.entschieden[ort] = wahl;
    return wahl === "live" ? live : entwurf;
  }
  ctx.details.push({ pfad: ort, entwurf, live });
  return entwurf;
}

/**
 * Reihenfolge von `fuehrend`, ergaenzt um das, was nur in `andere` steht —
 * jeweils direkt hinter seinem Vorgaenger dort. So landet ein auf dem
 * Live-Branch neu angelegter Block an seiner Stelle und nicht am Ende, und
 * das Diff von site.json bleibt so klein wie die Aenderung.
 */
function verzahne(fuehrend, andere) {
  const out = [...fuehrend];
  let vorgaenger = null;
  for (const x of andere) {
    if (!out.includes(x)) {
      const pos = vorgaenger === null ? 0 : out.indexOf(vorgaenger) + 1;
      out.splice(pos, 0, x);
    }
    vorgaenger = x;
  }
  return out;
}

function mischeListe(basis, entwurf, live, pfad, ctx) {
  const nachId = (liste) => new Map(liste.map((x) => [x.id, x]));
  const b = nachId(basis);
  const e = nachId(entwurf);
  const l = nachId(live);

  /* Reihenfolge: hat der Entwurf nicht umsortiert, gilt die des Live-Stands,
     sonst die des Entwurfs. Neue Eintraege der anderen Seite kommen hinten an. */
  const ids = (liste) => liste.map((x) => x.id);
  const entwurfSortiert = !gleich(
    ids(entwurf).filter((id) => b.has(id)),
    ids(basis).filter((id) => e.has(id))
  );
  const reihenfolge = entwurfSortiert ? verzahne(ids(entwurf), ids(live)) : verzahne(ids(live), ids(entwurf));

  const out = [];
  for (const id of reihenfolge) {
    const wert = mische(b.get(id), e.get(id), l.get(id), `${pfad}[${id}]`, ctx);
    if (wert !== undefined) out.push(wert);
  }
  return out;
}
