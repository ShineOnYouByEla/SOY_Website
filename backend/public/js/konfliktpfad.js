/* ============================================================
   Konfliktpfade lesbar machen
   ------------------------------------------------------------
   merge.js meldet Konflikte als Pfad in site.json, etwa
   "site.title" oder "sections[ueber].data.actions". Damit kann
   nur jemand etwas anfangen, der die Datei kennt. Hier wird
   daraus, was im Admin an derselben Stelle steht:
   „Titel & Suchmaschinen › Seitentitel“.

   Die Beschriftungen kommen aus schema.js — also genau die, die
   die Eingabemasken zeigen. Eine eigene Liste gibt es nur fuer
   Felder ohne Maske. Unbekanntes bleibt technisch stehen, statt
   geraten zu werden.

   Bewusst ohne DOM: laesst sich unter Node testen.
   ============================================================ */

import { SECTION_SCHEMA, SETTINGS_PANELS } from "./schema.js";

/* Felder eines Bereichs, die nicht im Schema seines Typs stehen,
   sondern in jedem Bereich gleich sind (siehe openPanel im Editor). */
const BEREICH_RAHMEN = {
  title: "Name in der Seitenleiste",
  navLabel: "Beschriftung in der Navigation",
  enabled: "Sichtbarkeit",
  type: "Art des Bereichs",
  glows: "Leuchteffekte im Hintergrund",
};

/* Felder ohne Eingabemaske — sie kommen per Pull Request in die Inhalte,
   koennen also genau dort mit einem Entwurf zusammenstossen. Ein Eintrag ist
   entweder nur die Beschriftung oder { label, felder } fuer ein Objekt. */
const OHNE_MASKE = {
  site: { lang: "Sprache", baseUrl: "Adresse der Seite", ogImage: "Teilen-Bild", contentUpdated: "Datum der letzten Änderung" },
  business: {
    logo: "Logo",
    inLanguage: "Sprache",
    shopUrl: "Adresse des Onlineshops",
    partnerUrl: "Adresse der Partnerseite",
    address: {
      label: "Anschrift",
      felder: { locality: "Ort", postalCode: "Postleitzahl", region: "Bundesland", country: "Land" },
    },
    offer: { label: "Angebot", felder: { name: "Bezeichnung", description: "Beschreibung" } },
    webPageName: "Name der Webseite",
    person: {
      label: "Angaben zur Person",
      felder: {
        id: "Kennung",
        name: "Name",
        alternateName: "Rufname",
        jobTitle: "Berufsbezeichnung",
        description: "Beschreibung",
        sameAs: "Weitere Profile",
      },
    },
  },
};

/* Ein Bild ist im Inhalt ein Objekt. Beschriftet wie im Bildwaehler
   (fields.js); Breite und Hoehe setzt er beim Auswaehlen selbst. */
const BILD_TEILE = { src: "Bilddatei", alt: "Alternativtext", width: "Breite", height: "Höhe" };

/**
 * Beschriftungen fuer alles unterhalb eines bekannten Feldes. Folgt der
 * Maske (Unterfelder einer Liste, Teile eines Bildes) bzw. der Liste fuer
 * Felder ohne Maske, so weit sie reicht; danach bleibt es technisch.
 * @param {object|string|undefined} def  Felddefinition aus schema.js oder Eintrag aus OHNE_MASKE
 */
function unterfelder(def, teile) {
  const out = [];
  let aktuell = def;
  let i = 0;
  for (; i < teile.length; i++) {
    const key = teile[i].key;
    if (key === undefined || !aktuell || typeof aktuell !== "object") break;
    let naechstes;
    let label;
    if (aktuell.type === "image" && BILD_TEILE[key]) {
      label = BILD_TEILE[key];
    } else if (Array.isArray(aktuell.item)) {
      // Liste in der Maske, im Inhalt ein einzelnes Objekt (etwa header.cta).
      naechstes = aktuell.item.find((f) => f.k === key);
      label = naechstes?.label;
    } else if (aktuell.felder) {
      naechstes = aktuell.felder[key];
      label = typeof naechstes === "string" ? naechstes : naechstes?.label;
    }
    if (!label) break;
    out.push(label);
    aktuell = naechstes;
  }
  return [...out, ...rest(teile.slice(i))];
}

/** Beschriftung eines Eintrags aus OHNE_MASKE, ob Text oder Objekt. */
const ohneMaskeLabel = (eintrag) => (typeof eintrag === "string" ? eintrag : eintrag?.label);

/** "a.b[c].d" → [{key:"a"},{key:"b"},{id:"c"},{key:"d"}] */
function zerlege(pfad) {
  const teile = [];
  for (const m of String(pfad).matchAll(/\[([^\]]*)\]|([^.[\]]+)/g)) {
    teile.push(m[1] !== undefined ? { id: m[1] } : { key: m[2] });
  }
  return teile;
}

/** Restliche Schluessel, die keine Maske mehr kennt, technisch anhaengen. */
const rest = (teile) => teile.map((t) => (t.id !== undefined ? `[${t.id}]` : t.key));

/**
 * @param {string} pfad   Pfad aus merge.js
 * @param {object} [content]  aktueller Inhalt — fuer Bereichsnamen und -typen
 * @returns {{ text: string, technisch: boolean }}
 *   technisch = true, wenn sich nichts davon zuordnen liess.
 */
export function lesbarerPfad(pfad, content = {}) {
  if (pfad === "(gesamter Inhalt)") return { text: "Gesamter Inhalt", technisch: false };

  let teile = zerlege(pfad);
  const vorn = [];
  let quelle = content;

  // Die englische Fassung hat dieselbe Struktur, nur unter translations.en.
  if (teile[0]?.key === "translations" && teile[1]?.key === "en") {
    vorn.push("Englische Fassung");
    teile = teile.slice(2);
    if (!teile.length) return { text: "Englische Fassung (gesamt)", technisch: false };
  }

  const [erst, ...danach] = teile;

  /* --- Bereiche der Seite --- */
  if (erst?.key === "sections") {
    const [bereich, ...innen] = danach;
    if (!bereich || bereich.id === undefined) {
      return { text: [...vorn, "Bereiche der Seite", ...rest(danach)].join(" › "), technisch: false };
    }
    // Name und Typ immer aus der deutschen Fassung: die englische uebersetzt nur Texte.
    const s = (quelle?.sections || []).find((x) => x.id === bereich.id);
    const name = `Bereich „${s?.title || bereich.id}“`;
    if (!innen.length) return { text: [...vorn, `${name} (ganzer Bereich)`].join(" › "), technisch: false };

    const [feld, ...tiefer] = innen;
    if (feld.key !== "data") {
      const label = BEREICH_RAHMEN[feld.key];
      return { text: [...vorn, name, label || feld.key, ...rest(tiefer)].join(" › "), technisch: false };
    }
    if (!tiefer.length) return { text: [...vorn, name, "Inhalte"].join(" › "), technisch: false };

    const [inhalt, ...ganzTief] = tiefer;
    const def = SECTION_SCHEMA[s?.type]?.fields?.find((f) => f.k === inhalt.key);
    if (!def) return { text: [...vorn, name, inhalt.key, ...rest(ganzTief)].join(" › "), technisch: false };
    return { text: [...vorn, name, def.label, ...unterfelder(def, ganzTief)].join(" › "), technisch: false };
  }

  /* --- Einstellungen --- */
  const panel = SETTINGS_PANELS.find((p) => p.path === erst?.key);
  if (panel) {
    if (!danach.length) return { text: [...vorn, `${panel.title} (gesamt)`].join(" › "), technisch: false };
    const [feld, ...tiefer] = danach;
    // Die Maske hat Vorrang; die Liste ohne Maske ist nur der Rest.
    const def = panel.fields.find((f) => f.k === feld.key) || OHNE_MASKE[panel.path]?.[feld.key];
    const label = def?.label || ohneMaskeLabel(def);
    if (!label) return { text: [...vorn, panel.title, feld.key, ...rest(tiefer)].join(" › "), technisch: false };
    return { text: [...vorn, panel.title, label, ...unterfelder(def, tiefer)].join(" › "), technisch: false };
  }

  /* --- Unbekannt: lieber technisch als falsch --- */
  return { text: [...vorn, ...rest(teile)].join(" › "), technisch: !vorn.length };
}
