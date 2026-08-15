/* ============================================================
   Pruefung und Aufbereitung der Inhalte
   ------------------------------------------------------------
   Jeder Entwurf und jede Veroeffentlichung laeuft hier durch.
   Ziel: Ein Fehler im Admin darf niemals eine kaputte Live-Seite
   erzeugen — lieber vorher ablehnen.
   ============================================================ */

import { ICONS } from "../../shared/icons.mjs";
import { renderPage, renderConfigJs } from "../../shared/render.mjs";

const SECTION_TYPES = new Set(["hero", "about", "cards", "flow", "channel", "booking", "contact"]);
const MAX_CONTENT_BYTES = 512 * 1024;

/* Bilder duerfen nur hierhin. Verhindert, dass ueber einen praeparierten
   Pfad Workflow-Dateien oder Skripte im Repository ueberschrieben werden. */
const MEDIA_DIR = "assets/img/";
const KATALOG_DIR = "kataloge/";

export class ValidationError extends Error {
  constructor(errors) {
    super(errors.join(" · "));
    this.name = "ValidationError";
    this.errors = errors;
  }
}

/** Pfad fuer ein hochgeladenes Bild bauen und absichern. */
export function mediaPath(filename) {
  const base = String(filename || "")
    .split(/[\\/]/)
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 80);
  if (!base || !/\.(webp|jpg|jpeg|png|svg|avif)$/.test(base)) {
    throw new ValidationError(["Dateiname muss auf .webp, .jpg, .png, .avif oder .svg enden."]);
  }
  return MEDIA_DIR + base;
}

/** Dasselbe fuer Katalog-PDFs. */
export function katalogPath(filename) {
  const base = String(filename || "")
    .split(/[\\/]/)
    .pop()
    .replace(/[^A-Za-z0-9 ._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 120);
  if (!base || !/\.pdf$/i.test(base)) {
    throw new ValidationError(["Katalog muss eine PDF-Datei sein."]);
  }
  return KATALOG_DIR + base;
}

/** Liegt der Pfad in einem Bereich, den der Admin veraendern darf? */
export function isEditablePath(path) {
  return (
    path === "content/site.json" ||
    (path.startsWith(MEDIA_DIR) && !path.includes("..")) ||
    (path.startsWith(KATALOG_DIR) && !path.includes(".."))
  );
}

/* ---------- Pruefung ---------- */

const isStr = (v) => typeof v === "string";
const isArr = Array.isArray;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function checkImage(img, where, errors) {
  if (!isObj(img)) return;
  if (!isStr(img.src) || !img.src) errors.push(`${where}: Bild ohne Pfad.`);
  else if (/^(https?:)?\/\//i.test(img.src)) errors.push(`${where}: Bilder müssen aus dem Projekt kommen.`);
  else if (img.src.includes("..")) errors.push(`${where}: unzulässiger Bildpfad.`);
  if (!isStr(img.alt) || !img.alt.trim()) {
    errors.push(`${where}: Alternativtext fehlt (wird für Barrierefreiheit und SEO gebraucht).`);
  }
}

function checkIcon(name, where, errors) {
  if (name !== undefined && !ICONS[name]) errors.push(`${where}: unbekanntes Symbol „${name}“.`);
}

function checkAction(a, where, errors) {
  if (!isStr(a?.label) || !a.label.trim()) errors.push(`${where}: Beschriftung fehlt.`);
  if (!isStr(a?.href) || !a.href.trim()) errors.push(`${where}: Ziel fehlt.`);
}

/* Links auf fremde Seiten – etwa hinter dem proWIN-Logo – brauchen ein
   vollstaendiges Ziel, sonst landen sie relativ auf der eigenen Seite. */
function checkExternalHref(href, where, errors) {
  if (isStr(href) && href.trim() && !/^https?:\/\//i.test(href)) {
    errors.push(`${where}: der Link muss mit http:// oder https:// beginnen.`);
  }
}

/**
 * Prueft die Struktur. Gibt eine Liste von Klartextfehlern zurueck —
 * die landen unveraendert in der Oberflaeche.
 */
export function validateContent(content) {
  const errors = [];

  if (!isObj(content)) return ["Inhalt ist kein gültiges Objekt."];

  /* --- Kopfdaten --- */
  const site = content.site;
  if (!isObj(site)) errors.push("Abschnitt „site“ fehlt.");
  else {
    if (!isStr(site.title) || !site.title.trim()) errors.push("Seitentitel darf nicht leer sein.");
    if (site.title && site.title.length > 70) errors.push("Seitentitel ist länger als 70 Zeichen – Suchmaschinen kürzen ihn.");
    if (!isStr(site.description) || !site.description.trim()) errors.push("Meta-Beschreibung darf nicht leer sein.");
    if (site.description && site.description.length > 200) errors.push("Meta-Beschreibung ist länger als 200 Zeichen.");
    if (!isStr(site.brandName) || !site.brandName.trim()) errors.push("Markenname darf nicht leer sein.");
  }

  /* --- Kontaktdaten --- */
  const c = content.contact;
  if (!isObj(c)) errors.push("Abschnitt „contact“ fehlt.");
  else {
    if (!isStr(c.email) || !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(c.email)) {
      errors.push("E-Mail-Adresse ist ungültig.");
    }
    for (const [field, label] of [["phoneHref", "Mobilnummer"], ["landlineHref", "Festnetznummer"]]) {
      const v = c[field];
      if (v && !/^\+?[0-9]{6,20}$/.test(v)) {
        errors.push(`${label} für den Anruf-Link darf nur Ziffern und ein führendes + enthalten.`);
      }
    }
  }

  /* --- Fussbereich --- */
  if (isObj(content.footer)) {
    checkExternalHref(content.footer.partnerHref, "Fußbereich, Partner-Logo", errors);
  }

  /* --- Sektionen --- */
  if (!isArr(content.sections) || content.sections.length === 0) {
    errors.push("Es muss mindestens eine Sektion geben.");
  } else {
    const ids = new Set();
    let visible = 0;

    content.sections.forEach((s, i) => {
      const where = `Sektion ${i + 1}${s?.title ? ` („${s.title}“)` : ""}`;
      if (!isObj(s)) return void errors.push(`${where}: kein gültiges Objekt.`);

      if (!isStr(s.id) || !/^[a-z][a-z0-9-]*$/.test(s.id)) {
        errors.push(`${where}: Kennung darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.`);
      } else if (ids.has(s.id)) {
        errors.push(`${where}: Kennung „${s.id}“ kommt mehrfach vor.`);
      } else {
        ids.add(s.id);
      }

      if (!SECTION_TYPES.has(s.type)) errors.push(`${where}: unbekannter Typ „${s.type}“.`);
      if (s.enabled !== false) visible += 1;

      const d = isObj(s.data) ? s.data : {};

      if (s.type === "hero") {
        if (!isArr(d.headline) || d.headline.length === 0) errors.push(`${where}: Überschrift fehlt.`);
        checkImage(d.partnerLogo, where, errors);
        checkExternalHref(d.partnerHref, `${where}, Partner-Logo`, errors);
        (d.actions || []).forEach((a, k) => checkAction(a, `${where}, Button ${k + 1}`, errors));
      }

      if (s.type === "about") {
        checkImage(d.image, where, errors);
        if (!isArr(d.paragraphs) || d.paragraphs.length === 0) errors.push(`${where}: mindestens ein Absatz nötig.`);
      }

      if (s.type === "cards") {
        if (!isArr(d.cards) || d.cards.length === 0) errors.push(`${where}: mindestens eine Karte nötig.`);
        (d.cards || []).forEach((card, k) => {
          checkIcon(card?.icon, `${where}, Karte ${k + 1}`, errors);
          if (!isStr(card?.title) || !card.title.trim()) errors.push(`${where}, Karte ${k + 1}: Titel fehlt.`);
        });
        if (d.columns !== undefined && ![2, 3, 4].includes(Number(d.columns))) {
          errors.push(`${where}: Spaltenzahl muss 2, 3 oder 4 sein.`);
        }
        (d.actions || []).forEach((a, k) => checkAction(a, `${where}, Button ${k + 1}`, errors));
        if (d.cta) checkAction(d.cta, `${where}, Button`, errors);
        if (d.link) checkAction(d.link, `${where}, Textlink`, errors);
      }

      if (s.type === "flow") {
        (d.blocks || []).forEach((b, k) => {
          checkIcon(b?.icon, `${where}, Ablauf ${k + 1}`, errors);
          (b?.steps || []).forEach((st, j) => checkIcon(st?.icon, `${where}, Ablauf ${k + 1}, Schritt ${j + 1}`, errors));
        });
        if (d.perks) checkIcon(d.perks.icon, `${where}, Prämien`, errors);
      }

      if (s.type === "channel") {
        /* Das Ziel landet auch im QR-Code – ein kaputter Link faellt dort
           niemandem auf, bis jemand vergeblich scannt. */
        if (isStr(d.href) && d.href.trim() && !/^https?:\/\//i.test(d.href)) {
          errors.push(`${where}: der Link muss mit http:// oder https:// beginnen.`);
        }
      }

      if (s.type === "contact") {
        (d.links || []).forEach((l, k) => {
          checkIcon(l?.icon, `${where}, Kontaktweg ${k + 1}`, errors);
          if (l?.kind === "url" && (!isStr(l.href) || !/^(https?:\/\/|mailto:|tel:)/i.test(l.href))) {
            errors.push(`${where}, Kontaktweg ${k + 1}: Link muss mit http(s)://, mailto: oder tel: beginnen.`);
          }
        });
        const reasons = d.form?.reasons;
        if (!isArr(reasons) || reasons.length === 0) errors.push(`${where}: das Formular braucht mindestens einen Kontaktgrund.`);
      }

      if (d.mediaPosition !== undefined && !["left", "right"].includes(d.mediaPosition)) {
        errors.push(`${where}: Bildposition muss „left“ oder „right“ sein.`);
      }
    });

    if (visible === 0) errors.push("Es muss mindestens eine Sektion sichtbar bleiben.");
  }

  /* --- Groesse --- */
  const bytes = new TextEncoder().encode(JSON.stringify(content)).length;
  if (bytes > MAX_CONTENT_BYTES) {
    errors.push(`Inhalte sind mit ${Math.round(bytes / 1024)} kB zu groß (erlaubt: ${MAX_CONTENT_BYTES / 1024} kB).`);
  }

  return errors;
}

/**
 * Letzte Sicherung vor dem Veroeffentlichen: Der Renderer muss durchlaufen
 * und plausibles HTML liefern. Faengt Fehler ab, die die reine
 * Strukturpruefung nicht sieht.
 */
export function renderOrThrow(content) {
  let html;
  let configJs;
  try {
    html = renderPage(content);
    configJs = renderConfigJs(content);
  } catch (err) {
    throw new ValidationError([`Die Seite konnte nicht erzeugt werden: ${err.message}`]);
  }
  if (!html.includes("</html>") || html.length < 2000) {
    throw new ValidationError(["Die erzeugte Seite wirkt unvollständig – bitte die Inhalte prüfen."]);
  }
  return { html, configJs };
}

/**
 * Die Dateien, die eine Veroeffentlichung in einem Commit schreibt.
 *
 * index.html und js/config.js entstehen aus site.json — genau das macht auch
 * scripts/build-site.mjs im CI und beim Deploy. Sie gehen trotzdem mit ins
 * Repository, damit der dortige Stand jederzeit zu den Inhalten passt: sonst
 * schlaegt die CI-Pruefung „Gebaute Dateien sind aktuell" nach jedem Publish
 * an, und ein Blick ins Repository zeigt eine Seite, die es so nicht mehr gibt.
 * Die Inhalte muessen vorher durch assertValid gegangen sein.
 */
export function publishFiles(content) {
  const { html, configJs } = renderOrThrow(content);
  return [
    { path: "content/site.json", content: JSON.stringify(content, null, 2) + "\n", encoding: "utf-8" },
    { path: "index.html", content: html, encoding: "utf-8" },
    { path: "js/config.js", content: configJs, encoding: "utf-8" },
  ];
}

/** Wirft, wenn die Inhalte nicht in Ordnung sind. */
export function assertValid(content) {
  const errors = validateContent(content);
  if (errors.length) throw new ValidationError(errors);
}

/**
 * HTML fuer die Vorschau im Admin. Ein <base>-Tag sorgt dafuer, dass CSS,
 * Schriften und Bilder von der Live-Seite geladen werden; noch nicht
 * veroeffentlichte Bilder zeigen wir aus der Zwischenablage des Entwurfs.
 */
export function previewHtml(content, siteUrl, pendingPaths = [], adminOrigin = "") {
  const { html } = renderOrThrow(content);
  const base = String(siteUrl || "").replace(/\/+$/, "") + "/";

  let out = html.replace("<head>", `<head>\n  <base href="${base}" />`);

  // Bilder, die nur im Entwurf existieren, kommen aus dem Backend. Die URL
  // muss absolut sein, sonst zieht das <base>-Tag sie auf die Live-Seite.
  for (const path of pendingPaths) {
    const url = `${String(adminOrigin).replace(/\/+$/, "")}/api/media/pending/${encodeURIComponent(path)}`;
    out = out.split(`src="${path}"`).join(`src="${url}"`);
  }

  // In der Vorschau brauchen wir keine Formularverarbeitung und keine
  // externen Dienste — das spart Fehlerquellen und externe Aufrufe.
  out = out.replace('<script src="js/config.js"></script>', "");
  out = out.replace('<script src="js/script.js"></script>', "");
  out = out.replace(
    "</body>",
    `  <script>
    document.querySelectorAll("form").forEach((f) => f.addEventListener("submit", (e) => e.preventDefault()));
    var y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  </script>
</body>`
  );

  return out;
}
