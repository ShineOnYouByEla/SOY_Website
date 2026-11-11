/* ============================================================
   Drei-Wege-Merge für content/site.json
   ------------------------------------------------------------
   Ein Entwurf entsteht auf einem bestimmten Stand von main
   (Basis). Bewegt sich main danach weiter — etwa durch einen
   Pull Request —, darf das Veröffentlichen diese Änderungen
   nicht stillschweigend zurückdrehen. So ist es in 4cb5b1c
   passiert. Deshalb wird gemischt:

     base   = site.json auf dem Stand, auf dem der Entwurf beruht
     theirs = site.json, wie es jetzt auf main liegt
     ours   = der Entwurf

   Was nur eine Seite geändert hat, wird übernommen. Haben beide
   dieselbe Stelle verschieden geändert, ist das ein Konflikt —
   den entscheidet ein Mensch, nicht dieser Code.

   Kein Node-API: läuft genauso im Cloudflare Worker.
   ============================================================ */

/** Platzhalter für „Schlüssel gibt es auf dieser Seite nicht". */
const FEHLT = Symbol("fehlt");
/* Basis unbekannt: gleicht keinem Wert, auch nicht FEHLT. Sonst hiesse
   „fehlt im Entwurf" bei unbekannter Basis „unveraendert", und ein neues
   Feld von main kaeme ungefragt durch. */
const UNBEKANNT = Symbol("unbekannt");

function istObjekt(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function gleich(a, b) {
  if (a === b) return true;
  if (a === FEHLT || b === FEHLT || a === UNBEKANNT || b === UNBEKANNT) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => gleich(x, b[i]));
  }
  if (istObjekt(a)) {
    if (!istObjekt(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && gleich(a[k], b[k]));
  }
  return false;
}

/** Fuer die Rueckgabe: FEHLT wird zu undefined, damit es sich als JSON verschicken laesst. */
const aussen = (v) => (v === FEHLT || v === UNBEKANNT ? undefined : v);

/**
 * Listen, deren Eintraege alle eine eindeutige `id` tragen (die Bereiche der
 * Seite), werden ueber diese id gemischt statt ueber die Position. Sonst
 * verschoebe ein neu eingefuegter Bereich auf der einen Seite jede Aenderung
 * der anderen um einen Platz.
 */
function hatIds(liste) {
  if (!Array.isArray(liste)) return false;
  const ids = new Set();
  for (const e of liste) {
    if (!istObjekt(e) || typeof e.id !== "string" || !e.id || ids.has(e.id)) return false;
    ids.add(e.id);
  }
  return true;
}

function pfadText(pfad) {
  let s = "";
  for (const teil of pfad) {
    if (typeof teil === "number") s += `[${teil}]`;
    else if (teil.startsWith("#")) s += `[${teil}]`;
    else s += s ? `.${teil}` : teil;
  }
  return s;
}

/**
 * @param {any} base  null, wenn nicht bekannt ist, worauf der Entwurf beruht
 * @param {any} theirs
 * @param {any} ours
 * @param {{resolve?: Record<string, "ours"|"theirs">}} [opts]
 *   Entscheidungen fuer bereits gemeldete Konflikte, je Pfad.
 * @returns {{result: any, conflicts: Array<{path: string, base: any, theirs: any, ours: any}>}}
 */
export function mergeContent(base, theirs, ours, opts = {}) {
  const resolve = opts.resolve || {};
  const conflicts = [];

  function konflikt(pfad, b, t, o) {
    const path = pfadText(pfad) || "(gesamter Inhalt)";
    const wahl = resolve[path];
    if (wahl === "theirs") return t;
    if (wahl === "ours") return o;
    conflicts.push({ path, base: aussen(b), theirs: aussen(t), ours: aussen(o) });
    // Bis zur Entscheidung steht der Entwurf drin; veroeffentlicht wird so
    // ohnehin nichts, solange conflicts nicht leer ist.
    return o;
  }

  function mische(b, t, o, pfad) {
    if (gleich(o, t)) return o;
    if (gleich(b, o)) return t;
    if (gleich(b, t)) return o;

    // Beide Seiten haben hier etwas geaendert — und zwar verschieden.
    // Auf beiden Seiten neu: die Basis zaehlt als leer.
    if (istObjekt(o) && istObjekt(t)) {
      return mischeObjekt(istObjekt(b) || b === UNBEKANNT ? b : {}, t, o, pfad);
    }
    if (hatIds(o) && hatIds(t) && (!Array.isArray(b) || hatIds(b))) {
      return mischeIdListe(Array.isArray(b) || b === UNBEKANNT ? b : [], t, o, pfad);
    }
    if (Array.isArray(o) && Array.isArray(t) && Array.isArray(b) && o.length === t.length && t.length === b.length) {
      return o.map((_, i) => mische(b[i], t[i], o[i], [...pfad, i]));
    }
    return konflikt(pfad, b, t, o);
  }

  function mischeObjekt(b, t, o, pfad) {
    // Reihenfolge der Schluessel: wie im Entwurf, neue von main hinten dran.
    const schluessel = [...Object.keys(o)];
    for (const k of Object.keys(t)) if (!schluessel.includes(k)) schluessel.push(k);
    const unbekannt = b === UNBEKANNT;
    if (!unbekannt) for (const k of Object.keys(b)) if (!schluessel.includes(k)) schluessel.push(k);

    const out = {};
    for (const k of schluessel) {
      const has = (x) => Object.prototype.hasOwnProperty.call(x, k);
      const vb = unbekannt ? UNBEKANNT : has(b) ? b[k] : FEHLT;
      const v = mische(vb, has(t) ? t[k] : FEHLT, has(o) ? o[k] : FEHLT, [...pfad, k]);
      if (v !== FEHLT) out[k] = v;
    }
    return out;
  }

  function mischeIdListe(b, t, o, pfad) {
    const nachId = (liste) => new Map(liste.map((e) => [e.id, e]));
    const unbekannt = b === UNBEKANNT;
    if (unbekannt) b = [];
    const mb = nachId(b);
    const mt = nachId(t);
    const mo = nachId(o);

    /* Reihenfolge: Hat nur eine Seite umsortiert, gilt deren Reihenfolge.
       Verglichen wird nur ueber die ids, die es ueberall gibt — Einfuegen
       und Loeschen ist kein Umsortieren. */
    const gemeinsam = (liste) => liste.map((e) => e.id).filter((id) => mb.has(id) && mt.has(id) && mo.has(id));
    const rb = gemeinsam(b);
    const rt = gemeinsam(t);
    const ro = gemeinsam(o);
    let reihenfolge;
    if (gleich(ro, rb) || gleich(ro, rt)) reihenfolge = t.map((e) => e.id);
    else if (gleich(rt, rb)) reihenfolge = o.map((e) => e.id);
    else {
      const wahl = konflikt([...pfad, "(Reihenfolge)"], rb, rt, ro);
      reihenfolge = (wahl === rt ? t : o).map((e) => e.id);
    }

    // Was nur auf einer Seite neu ist, hinter seinem dortigen Vorgaenger einsortieren.
    for (const seite of [o, t]) {
      const ids = seite.map((e) => e.id);
      ids.forEach((id, i) => {
        if (reihenfolge.includes(id)) return;
        const vorgaenger = ids.slice(0, i).reverse().find((x) => reihenfolge.includes(x));
        reihenfolge.splice(vorgaenger === undefined ? 0 : reihenfolge.indexOf(vorgaenger) + 1, 0, id);
      });
    }
    // Und was nur in der Basis stand (auf einer Seite geloescht), auch pruefen.
    for (const id of mb.keys()) if (!reihenfolge.includes(id)) reihenfolge.push(id);

    const out = [];
    for (const id of reihenfolge) {
      const v = mische(
        unbekannt ? UNBEKANNT : mb.has(id) ? mb.get(id) : FEHLT,
        mt.has(id) ? mt.get(id) : FEHLT,
        mo.has(id) ? mo.get(id) : FEHLT,
        [...pfad, `#${id}`]
      );
      if (v !== FEHLT) out.push(v);
    }
    return out;
  }

  const result = mische(base === null || base === undefined ? UNBEKANNT : base, theirs, ours, []);
  return { result: aussen(result), conflicts };
}

/** Inhaltlich gleich — Reihenfolge der Schluessel egal, wie bei JSON-Objekten. */
export function sameContent(a, b) {
  return gleich(a, b);
}
