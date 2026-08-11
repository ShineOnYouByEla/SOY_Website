/* ============================================================
   Shine On You — Katalog-Liste
   ------------------------------------------------------------
   Aus den PDF-Dateien im Ordner kataloge/ und den Angaben in
   kataloge/titel.json entsteht die Liste, durch die katalog.html
   blaettert. Genau diese Logik braucht auch das Admin, damit es
   dieselbe Reihenfolge und dieselben Namen anzeigt wie die
   spaeter erzeugte manifest.json — deshalb liegt sie hier und
   nicht im Build-Skript.

   Reines JS ohne Node-APIs -> laeuft auch im Worker.

   Format von kataloge/titel.json (Schluessel = Dateiname ohne .pdf):

     {
       "fruehjahr-2026": "Frühjahr 2026",
       "wellness": { "titel": "Wellness", "position": 1, "versteckt": true }
     }

   Die kurze Schreibweise (nur Text) bleibt gueltig — sie ist der
   Normalfall, wenn nur der Anzeigename abweicht.
   ============================================================ */

export const KATALOG_DIR = "kataloge";
export const TITEL_DATEI = "kataloge/titel.json";

/** Dateiname (ohne .pdf) -> kurze, url-sichere id. */
export function katalogId(base) {
  return (
    String(base)
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // restliche Akzente entfernen
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "katalog"
  );
}

/** Dateiname (ohne .pdf) -> lesbarer Anzeigename. */
export function katalogTitel(base) {
  let s = String(base).replace(/^\d+\s*[-_. ]+\s*/, ""); // Sortier-Praefix wie "01_" weg
  s = s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Dateiname mit Endung -> Name ohne .pdf. */
export function katalogBase(dateiname) {
  return String(dateiname).replace(/\.pdf$/i, "");
}

/* ---------- titel.json lesen ---------- */

const zahlOderNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Einen einzelnen Eintrag aus titel.json vereinheitlichen.
 * Erlaubt sind der reine Anzeigename als Text oder ein Objekt mit
 * titel/position/versteckt (auch die englischen Namen).
 */
function normalisiereEintrag(wert) {
  if (typeof wert === "string") return { titel: wert.trim(), position: null, versteckt: false };
  if (wert && typeof wert === "object" && !Array.isArray(wert)) {
    return {
      titel: String(wert.titel ?? wert.title ?? "").trim(),
      position: zahlOderNull(wert.position ?? wert.sortierung ?? wert.order),
      versteckt: Boolean(wert.versteckt ?? wert.hidden),
    };
  }
  return { titel: "", position: null, versteckt: false };
}

/**
 * Angaben zu einer Datei heraussuchen. Als Schluessel wird der Dateiname
 * ohne .pdf erwartet; aus Ruecksicht auf aeltere Eintraege werden auch der
 * Dateiname mit Endung und die erzeugte id akzeptiert.
 */
export function eintragFuer(overrides, base, id) {
  const map = overrides && typeof overrides === "object" ? overrides : {};
  for (const key of [base, `${base}.pdf`, id]) {
    if (key && Object.prototype.hasOwnProperty.call(map, key)) return normalisiereEintrag(map[key]);
  }
  return { titel: "", position: null, versteckt: false };
}

/* ---------- Liste aufbauen ---------- */

/**
 * Baut die vollstaendige Katalogliste.
 * @param {string[]} dateinamen Dateinamen im Ordner kataloge/ (mit oder ohne Nicht-PDFs)
 * @param {object} overrides Inhalt von kataloge/titel.json
 * @returns {Array<{name,base,id,datei,titel,autoTitel,position,versteckt}>}
 */
export function baueKataloge(dateinamen, overrides = {}) {
  const pdfs = (dateinamen || [])
    .filter((f) => typeof f === "string" && f.toLowerCase().endsWith(".pdf"))
    // Die id entsteht in der Reihenfolge der Dateinamen. So bleibt sie
    // stabil, auch wenn die Anzeigereihenfolge spaeter geaendert wird —
    // Links der Form katalog.html?katalog=<id> gehen sonst kaputt.
    .sort((a, b) => a.localeCompare(b, "de"));

  const vergeben = new Set();
  const eintraege = pdfs.map((name) => {
    const base = katalogBase(name);
    const roh = katalogId(base);
    let id = roh;
    let n = 2;
    while (vergeben.has(id)) id = `${roh}-${n++}`;
    vergeben.add(id);

    const angaben = eintragFuer(overrides, base, id);
    const autoTitel = katalogTitel(base);
    return {
      name,
      base,
      id,
      datei: `${KATALOG_DIR}/${name}`,
      titel: angaben.titel || autoTitel,
      autoTitel,
      /** Eigener Anzeigename (leer = aus dem Dateinamen abgeleitet). */
      eigenerTitel: angaben.titel,
      position: angaben.position,
      versteckt: angaben.versteckt,
    };
  });

  /* Anzeigereihenfolge: erst alles mit ausdruecklicher Position, danach der
     Rest nach Dateiname — wie bisher. */
  return eintraege.sort((a, b) => {
    const pa = a.position ?? Number.POSITIVE_INFINITY;
    const pb = b.position ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name, "de");
  });
}

/** Die Liste, die katalog.html liest — ohne die ausgeblendeten Kataloge. */
export function manifestVon(eintraege) {
  return {
    kataloge: eintraege
      .filter((e) => !e.versteckt)
      .map((e) => ({ id: e.id, titel: e.titel, datei: e.datei })),
  };
}

/**
 * Aus der Liste wieder eine titel.json bauen. Eintraege ohne Besonderheit
 * fallen weg, Eintraege mit nur einem Anzeigenamen bleiben in der kurzen
 * Schreibweise — die Datei soll von Hand lesbar bleiben.
 */
export function serialisiereEintraege(eintraege) {
  const out = {};
  for (const e of eintraege) {
    const titel = String(e.eigenerTitel ?? "").trim();
    const position = zahlOderNull(e.position);
    const versteckt = Boolean(e.versteckt);
    if (!titel && position === null && !versteckt) continue;
    if (titel && position === null && !versteckt) {
      out[e.base] = titel;
      continue;
    }
    const eintrag = {};
    if (titel) eintrag.titel = titel;
    if (position !== null) eintrag.position = position;
    if (versteckt) eintrag.versteckt = true;
    out[e.base] = eintrag;
  }
  return out;
}
