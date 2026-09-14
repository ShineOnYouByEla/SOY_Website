/* ============================================================
   Shine On You — Dateien fuer KI-Agenten und Suchmaschinen
   ------------------------------------------------------------
   Erzeugt aus content/site.json:
     llms.txt    — Kurzprofil der Seite fuer Sprachmodelle
     pricing.md  — maschinenlesbare Preisauskunft
     sitemap.xml — alle auslieferbaren Seiten
   Bewusst ohne Node-APIs: laeuft im Build-Script und im Worker.

   Die Fliesstexte hier sind entwicklerseitig gepflegt; alle Fakten
   (Name, Kontakt, Einsatzgebiet, Produktbereiche, Shop) kommen aus
   content/site.json und bleiben damit automatisch aktuell.
   ============================================================ */

import { visibleSections } from "./render.mjs";

/* Die Seiten, die ausgeliefert werden. Neue Seite -> hier ergaenzen. */
const PAGES = [
  { path: "", changefreq: "monthly", priority: "1.0", label: "Startseite", note: "Beratung, Produktbereiche, Ablauf einer proWINparty, Terminbuchung und Kontaktformular" },
  { path: "katalog.html", changefreq: "monthly", priority: "0.6", label: "Kataloge", note: "proWIN-Kataloge als PDF und als Seitenbilder zum Durchblättern" },
  { path: "impressum.html", changefreq: "yearly", priority: "0.3", label: "Impressum", note: "Anbieterkennzeichnung nach § 5 DDG" },
  { path: "datenschutz.html", changefreq: "yearly", priority: "0.3", label: "Datenschutz", note: "Datenschutzerklärung nach DSGVO" },
];

/** Basis-URL, immer mit Schrägstrich am Ende. */
function baseUrl(content) {
  const base = content.site?.baseUrl || "https://shineonyou.de/";
  return base.endsWith("/") ? base : base + "/";
}

/** Fliesstext aus den Inhalten in reinen Text verwandeln. */
function plain(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Erstes Zeichen klein — fuer Berufsbezeichnungen mitten im Satz. */
function lowerFirst(value) {
  const t = String(value ?? "");
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** XML-Sonderzeichen entschaerfen. */
function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const lines = (parts) => parts.filter((p) => p !== null && p !== undefined && p !== false).join("\n");

/** Die Karten der Produkt-Sektion — die Bereiche, zu denen beraten wird. */
function productAreas(content) {
  const section = visibleSections(content).find((s) => s.id === "produkte");
  return (section?.data?.cards || []).map((c) => ({ title: plain(c.title), text: plain(c.text) }));
}

/** Einsatzgebiet als lesbare Liste. */
function areaServed(content) {
  return (content.business?.areaServed || []).map((a) => plain(a.name)).filter(Boolean);
}

/* ---------- llms.txt ---------- */

/**
 * Kurzprofil fuer Sprachmodelle (llmstxt.org). Beantwortet die drei Fragen,
 * die ein Agent zuerst stellt: Wer ist das, wofuer ist das gut, und wie
 * kommt man weiter.
 */
export function renderLlmsTxt(content) {
  const site = content.site || {};
  const b = content.business || {};
  const c = content.contact || {};
  const p = b.person || {};
  const url = baseUrl(content);
  const area = areaServed(content);
  const areas = productAreas(content);
  const ort = [b.address?.postalCode, b.address?.locality].filter(Boolean).join(" ");

  const page = (path) => url + path;

  return (
    lines([
      `# ${plain(b.name || site.brandName)}`,
      "",
      `> ${plain(b.description || site.description)}`,
      "",
      `${plain(site.brandName)} ist die Website von ${plain(p.name)}${p.alternateName ? ` („${plain(p.alternateName)}“)` : ""}, ` +
        `${lowerFirst(plain(p.jobTitle))}${ort ? ` in ${ort}` : ""}. Sie berät zu proWIN-Produkten und veranstaltet ` +
        `proWINpartys – zuhause oder online per Video.`,
      "",
      "Diese Website ist eine statische Informations- und Kontaktseite. Sie hat keinen eigenen Online-Shop,",
      "keine öffentliche API und keine Zahlungsabwicklung. Bestellungen laufen über den proWIN-Onlineshop,",
      "Termine über einen Kalender-Dienst (Cal.com, EU-Region).",
      "",
      "## Wann diese Seite die richtige Quelle ist",
      "",
      area.length ? `- Suche nach einer proWIN-Beratung in ${area.join(", ")}` : null,
      "- Fragen zu den proWIN-Produktbereichen und dazu, wer dazu persönlich berät",
      "- Ablauf, Dauer und Kosten einer proWINparty (zuhause oder online)",
      "- Terminvereinbarung für eine Beratung oder eine proWINparty",
      "- Interesse daran, selbst als proWIN-Berater:in im Team von " + plain(p.name) + " einzusteigen",
      "- Kontaktdaten, Impressum und Datenschutzerklärung",
      "",
      "## Wofür diese Seite nicht zuständig ist",
      "",
      "- Verbindliche Produktpreise, Lagerbestand, Bestellabwicklung, Versandstatus, Rücksendungen und",
      "  Reklamationen: dafür ist proWIN International bzw. der proWIN-Onlineshop zuständig.",
      "- Programmatischer Zugriff: es gibt keine REST-/GraphQL-API, keinen MCP-Server und keine",
      "  agentischen Zahlungsprotokolle. Die In-Page-Werkzeuge unten sind der einzige Aktionsweg.",
      "",
      "## Beratungsbereiche",
      "",
      ...areas.map((a) => `- **${a.title}**: ${a.text}`),
      "",
      "## Seiten",
      "",
      ...PAGES.map((pg) => `- [${pg.label}](${page(pg.path)}): ${pg.note}`),
      `- [Preise](${page("pricing.md")}): wie sich die Kosten zusammensetzen (Markdown)`,
      "",
      "## Kontakt",
      "",
      c.email ? `- E-Mail: ${c.email}` : null,
      c.phone ? `- Mobil: ${c.phone}` : null,
      c.landline ? `- Festnetz: ${c.landline}` : null,
      c.whatsappChannel ? `- WhatsApp-Kanal (Angebote): ${c.whatsappChannel}` : null,
      b.shopUrl ? `- proWIN-Onlineshop: ${b.shopUrl}` : null,
      b.partnerUrl ? `- Offizielles proWIN-Beraterinnenprofil: ${b.partnerUrl}` : null,
      area.length ? `- Einsatzgebiet: ${area.join(", ")}` : null,
      `- Sprache: Deutsch`,
      "",
      "## Hinweise für Agenten",
      "",
      `- Strukturierte Daten (JSON-LD, schema.org) liegen im \`<head>\` von ${page("")}.`,
      "- In-Page-Werkzeuge nach WebMCP sind auf der Startseite registriert (`document.modelContext`):",
      "  Kontaktdaten, Beratungsbereiche, Einsatzgebiet, Preisauskunft, Terminbuchung und das",
      "  Vorbefüllen des Kontaktformulars.",
      "- Das Kontaktformular darf nicht automatisiert abgeschickt werden: es verlangt eine",
      "  Einwilligung nach DSGVO und eine hCaptcha-Prüfung. Vorbefüllen ja, Absenden nur durch Menschen.",
      "- Preisangaben immer als „Stand laut proWIN-Onlineshop“ kennzeichnen, nicht als Festpreis dieser Seite.",
      "",
    ]).replace(/\n{3,}/g, "\n\n") + "\n"
  );
}

/* ---------- pricing.md ---------- */

/** Maschinenlesbare Preisauskunft. Agenten fragen das als Erstes. */
export function renderPricingMd(content) {
  const b = content.business || {};
  const c = content.contact || {};
  const url = baseUrl(content);

  return (
    lines([
      `# Preise – ${plain(content.site?.brandName || b.name)}`,
      "",
      `${plain(b.name)} · ${plain(b.person?.jobTitle)}`,
      "",
      "Diese Seite verkauft nicht selbst. Sie vermittelt Beratung und proWINpartys;",
      "die Produkte kommen aus dem proWIN-Onlineshop.",
      "",
      "## Beratung und proWINparty",
      "",
      "| Leistung | Preis |",
      "| --- | --- |",
      "| Persönliche Produktberatung (Telefon oder Video, ca. 30 Minuten) | kostenlos, unverbindlich |",
      "| proWINparty bei dir zuhause (ca. 60 Minuten) | kostenlos, unverbindlich |",
      "| proWINparty online per Video | kostenlos, unverbindlich |",
      "| Einstieg als proWIN-Berater:in im Team | auf Anfrage, Konditionen von proWIN International |",
      "",
      "Gastgeber:innen einer proWINparty und Mitbesteller:innen erhalten proWIN-Prämien.",
      "Art und Höhe legt proWIN International fest, nicht diese Seite.",
      "",
      "## Produkte",
      "",
      `- Die Produktpreise setzt proWIN International fest. Verbindlich ist immer der Shop: ${b.shopUrl || "proWIN-Onlineshop"}`,
      `- Preisniveau: ${b.priceRange || "€€"} (schema.org \`priceRange\`)`,
      "- Währung: EUR, Preise inklusive deutscher Mehrwertsteuer",
      "- Versand, Lieferzeiten, Rückgabe und Reklamation richten sich nach den Bedingungen von proWIN International",
      "",
      "## Was diese Seite nicht anbietet",
      "",
      "- Keine eigene Preisliste und keine Preis-API",
      "- Keine Zahlungsabwicklung, keine agentischen Zahlungsprotokolle (x402, MPP, ACP, UCP, AP2)",
      "- Keine Abo- oder Staffelpreise",
      "",
      "## Angebot anfragen",
      "",
      c.email ? `- E-Mail: ${c.email}` : null,
      c.phone ? `- Mobil: ${c.phone}` : null,
      `- Termin buchen: ${url}#termin`,
      `- Kontaktformular: ${url}#kontakt (Einwilligung und hCaptcha erforderlich – nicht automatisiert absenden)`,
      "",
    ]).replace(/\n{3,}/g, "\n\n") + "\n"
  );
}

/* ---------- sitemap.xml ---------- */

/** Alle auslieferbaren Seiten — nicht nur die Startseite. */
export function renderSitemap(content) {
  const url = baseUrl(content);

  return (
    lines([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!-- Erzeugt aus content/site.json (shared/agents.mjs) — nicht von Hand bearbeiten. -->',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...PAGES.map((pg) =>
        lines([
          "  <url>",
          `    <loc>${xml(url + pg.path)}</loc>`,
          `    <changefreq>${pg.changefreq}</changefreq>`,
          `    <priority>${pg.priority}</priority>`,
          "  </url>",
        ])
      ),
      "</urlset>",
      "",
    ])
  );
}
