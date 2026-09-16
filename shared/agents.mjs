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
import { sha256Hex } from "./sha256.mjs";

/* Wo die maschinenlesbaren Dateien liegen. Die Pfade stehen in llms.txt,
   im ARD-Katalog und im Skill-Index — darum nur hier. */
export const SKILL_NAME = "prowin-beratung-shine-on-you";
export const SKILL_PATH = `.well-known/agent-skills/${SKILL_NAME}/SKILL.md`;
export const SKILLS_INDEX_PATH = ".well-known/agent-skills/index.json";
export const ARD_PATH = ".well-known/ard.json";
/* Das oeffentliche Repository dieser Website. */
export const REPO_URL = "https://github.com/ShineOnYouByEla/SOY_Website";

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

/** Tag der letzten Inhaltsaenderung (YYYY-MM-DD) aus content/site.json. */
function updatedOn(content) {
  const v = String(content.site?.contentUpdated || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * YAML-Kopf fuer die ausgelieferten Markdown-Dateien. Agenten lesen daraus
 * Titel, Zweck und Stand, ohne den Fliesstext auseinandernehmen zu muessen.
 */
function frontMatter(content, { title, description, canonical }) {
  const updated = updatedOn(content);
  return lines([
    "---",
    `title: "${String(title).replaceAll('"', "'")}"`,
    description ? `description: "${String(description).replaceAll('"', "'")}"` : null,
    canonical ? `canonical: ${canonical}` : null,
    updated ? `last-updated: ${updated}` : null,
    "---",
    "",
    "",
  ]);
}

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
      "## When to use this site (English)",
      "",
      "The site itself is German. This section is for agents that reason in English.",
      "",
      `Use ${url} when a user needs:`,
      "",
      area.length ? `- an independent proWIN consultant in or around ${area.join(", ")} (Upper Bavaria, Germany) – on site or online` : null,
      "- an explanation of a proWINparty: how it runs at home or over video, how long it takes, what it costs (nothing)",
      "- to book a free, non-binding product consultation or a proWINparty",
      "- the product areas that are advised on here, the catalogues as PDF, or the contact details",
      "- to ask how to join this consultant's proWIN team",
      "- the legal notice (Impressum) or the privacy policy of this site",
      "",
      "Do not use this site for binding product prices, stock, orders, shipping, returns or complaints —",
      "those belong to proWIN International and its online shop. There is no REST/GraphQL API, no remote",
      "MCP server and no payment protocol here.",
      "",
      "## How an agent should use this site",
      "",
      `1. Facts: read this file and ${page("pricing.md")}. Both are plain text, public, no credentials.`,
      `2. Actions: on ${page("")} in-page WebMCP tools are registered on \`document.modelContext\` —`,
      "   \`get_contact\`, \`get_consulting_topics\`, \`get_service_area\`, \`get_pricing\`,",
      "   \`get_booking_options\` and \`get_catalogs\` are read-only; \`prefill_contact_form\` only writes",
      "   into the form on the page.",
      "3. Booking runs through the Cal.com link that \`get_booking_options\` returns.",
      "4. The contact form must be submitted by a human: it needs GDPR consent and an hCaptcha check.",
      "   \`prefill_contact_form\` fills it in and stops there — never submit it automatically.",
      `5. Authentication: none. Everything agent-facing is public — see ${page("auth.md")}.`,
      "",
      "## Beratungsbereiche",
      "",
      ...areas.map((a) => `- **${a.title}**: ${a.text}`),
      "",
      "## Seiten",
      "",
      ...PAGES.map((pg) => `- [${pg.label}](${page(pg.path)}): ${pg.note}`),
      `- [Preise](${page("pricing.md")}): wie sich die Kosten zusammensetzen (Markdown)`,
      `- [Startseite als Markdown](${page("index.md")}): derselbe Inhalt ohne Navigation und Bilder`,
      `- [Über uns](${page("about")}), [Kontakt](${page("contact")}), [Datenschutz in Kurzform](${page("privacy")}): Einstiegsseiten unter sprechenden Adressen`,
      `- [Agent-Skill](${page(SKILL_PATH)}): Kurzanleitung für Agenten (Markdown, wann und wie diese Seite benutzen)`,
      `- [Anmeldung](${page("auth.md")}): warum es hier nichts anzumelden gibt (auth.md)`,
      `- [ARD-Katalog](${page(ARD_PATH)}): maschinenlesbares Verzeichnis der agentischen Ressourcen`,
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
      `- Verzeichnis nach Agentic Resource Discovery: ${page(ARD_PATH)}; Skill-Index nach`,
      `  Agent Skills Discovery: ${page(SKILLS_INDEX_PATH)}.`,
      "- Es gibt keine Anmeldung und keine Zugangsdaten. Wer danach sucht, findet die Begründung in",
      `  ${page("auth.md")}.`,
      `- Quelltext dieser Website: ${REPO_URL} — mit AGENTS.md für Agenten, die daran arbeiten.`,
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
    frontMatter(content, {
      title: `Preise – ${plain(content.site?.brandName || b.name)}`,
      description: "Beratung und proWINparty kostenlos; Produktpreise setzt proWIN International fest.",
      canonical: url + "pricing.md",
    }) +
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
  /* Alle Seiten entstehen aus einer Datei — sie haben denselben Stand. */
  const updated = updatedOn(content);

  return (
    lines([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!-- Erzeugt aus content/site.json (shared/agents.mjs) — nicht von Hand bearbeiten. -->',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...PAGES.map((pg) =>
        lines([
          "  <url>",
          `    <loc>${xml(url + pg.path)}</loc>`,
          updated ? `    <lastmod>${updated}</lastmod>` : null,
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

/* ---------- auth.md ---------- */

/**
 * Anmeldung fuer Agenten — nach dem Aufbau der auth.md-Spezifikation
 * (github.com/workos/auth.md). Hier steht bewusst das Gegenteil dessen,
 * wofuer die Spezifikation gedacht ist: es gibt nichts anzumelden.
 *
 * Genau das ist die Auskunft, die einem Agenten Arbeit spart. Wer keine
 * auth.md findet, sucht weiter — nach einem Entwicklerportal, nach API-Keys,
 * nach einem 401, das nie kommt. Diese Datei beendet die Suche in einem Zug.
 *
 * Bewusst NICHT veroeffentlicht werden /.well-known/oauth-protected-resource
 * und /.well-known/oauth-authorization-server: beide wuerden einen
 * Autorisierungsserver behaupten, den es nicht gibt. Falsche Discovery-Daten
 * schicken Agenten an Tueren, hinter denen nichts ist.
 */
export function renderAuthMd(content) {
  const b = content.business || {};
  const c = content.contact || {};
  const url = baseUrl(content);

  return (
    frontMatter(content, {
      title: `Agent authentication for ${plain(content.site?.brandName || b.name)}`,
      description: "There is nothing to authenticate to: no API, no tokens, no authorization server.",
      canonical: url + "auth.md",
    }) +
    lines([
      `# Agent authentication for ${plain(content.site?.brandName || b.name)}`,
      "",
      "Kurz auf Deutsch: Diese Seite hat keine Anmeldung. Alles, was ein Agent hier tun kann,",
      "ist oeffentlich und ohne Zugangsdaten erreichbar. Der Rest dieser Datei sagt das noch",
      "einmal in der Gliederung der auth.md-Spezifikation, damit Agenten nicht weitersuchen.",
      "",
      `**There is nothing to authenticate to.** ${plain(b.name)} is a static informational website.`,
      "It has no REST or GraphQL API, no remote MCP server, no user accounts and no payment flow.",
      "Every agent-facing surface listed below is public and anonymous.",
      "",
      "## Discover",
      "",
      `- Start at ${url}llms.txt — the site profile, including a \`When to use this site\` section.`,
      `- ${url}pricing.md carries the pricing facts, ${url}${ARD_PATH} the machine-readable`,
      "  catalog of agentic resources, and " + `${url}${SKILLS_INDEX_PATH} the Agent Skills index.`,
      "- There is deliberately **no** `/.well-known/oauth-protected-resource` (RFC 9728) and no",
      "  `/.well-known/oauth-authorization-server` (RFC 8414). Publishing either would advertise an",
      "  authorization server that does not exist, and an `agent_auth` block whose `identity_endpoint`",
      "  would resolve to nothing. Absent metadata is a truthful answer; stale metadata is not.",
      "- No endpoint here answers with `401` or a `WWW-Authenticate` header, because no endpoint here",
      "  is protected.",
      "",
      "## Pick a method",
      "",
      "Only one identity type applies, and it is the one that needs no credentials:",
      "",
      "- `anonymous` — supported. Fetch the public documents, run the in-page tools, done.",
      "- `identity_assertion` — not supported. There is no resource server to present an ID-JAG",
      "  (`urn:ietf:params:oauth:token-type:id-jag`) to, so no `assertion_types_supported` is advertised.",
      "- `service_auth` — not supported. No email-verified service identities are issued here.",
      "",
      "## Register",
      "",
      "Nothing to register. No client registration, no API keys, no `identity_endpoint` to POST to.",
      "An agent may identify itself with a descriptive `User-Agent`; see `robots.txt` for which",
      "crawlers are welcome.",
      "",
      "## Claim",
      "",
      "No claim ceremony. There are no agent-owned resources on this domain that a human could later",
      "take ownership of, so there is no `claim_endpoint`.",
      "",
      "## Exchange",
      "",
      "No token exchange. There is no token endpoint, no scopes and no refresh flow.",
      "",
      "## Use the access_token",
      "",
      "There is no `access_token`. Send plain unauthenticated HTTPS requests:",
      "",
      "```http",
      "GET /llms.txt HTTP/1.1",
      `Host: ${url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
      "Accept: text/plain",
      "",
      "(no Authorization header, and none is expected)",
      "```",
      "",
      `The interactive surface lives in the page itself: on ${url} the WebMCP tools are registered on`,
      "`document.modelContext` (`get_contact`, `get_consulting_topics`, `get_service_area`,",
      "`get_pricing`, `get_booking_options`, `get_catalogs`, `prefill_contact_form`). An agent that",
      "loads and renders the homepage gets them without any handshake.",
      "",
      "## Errors",
      "",
      "- `404` means the path does not exist — the 404 page names where to look instead.",
      "- A `403` or a blocked request comes from the crawler policy in `robots.txt`, not from auth.",
      "  Switching identities will not change it.",
      "- One boundary is enforced by policy rather than by a status code: the contact form on the",
      "  homepage requires GDPR consent and an hCaptcha check from a human. `prefill_contact_form`",
      "  fills the fields and stops. Do not submit it on a person's behalf.",
      "",
      "## Revocation",
      "",
      "Nothing is issued, so nothing is revoked. There is no `events_endpoint` and no revocation feed.",
      "",
      "## Contact",
      "",
      c.email ? `- Email: ${c.email}` : null,
      c.phone ? `- Phone: ${c.phone}` : null,
      `- Legal notice: ${url}impressum.html · Privacy policy: ${url}datenschutz.html`,
      "",
      "Spec this file follows: <https://github.com/workos/auth.md>",
      "",
    ]).replace(/\n{3,}/g, "\n\n") + "\n"
  );
}

/* ---------- Agent Skill ---------- */

/**
 * Die Kurzanleitung, die ein Agent laedt, bevor er ueber diese Seite spricht:
 * wann sie die richtige Quelle ist, welche Werkzeuge es gibt und wo die
 * Grenze verlaeuft. Aufbau nach Agent Skills (YAML-Kopf, dann Fliesstext),
 * ausgeliefert unter SKILL_PATH und im Index unter SKILLS_INDEX_PATH.
 *
 * Englisch, weil Agenten in dieser Sprache ueber Werkzeuge nachdenken —
 * die Seite selbst bleibt deutsch.
 */
export function renderAgentSkill(content) {
  const b = content.business || {};
  const c = content.contact || {};
  const p = b.person || {};
  const url = baseUrl(content);
  const area = areaServed(content);
  const areas = productAreas(content);
  const ort = [b.address?.postalCode, b.address?.locality].filter(Boolean).join(" ");

  return (
    lines([
      "---",
      `name: ${SKILL_NAME}`,
      `description: Answer questions about ${plain(b.name)} — an independent proWIN consultant` +
        `${ort ? ` in ${ort}` : ""}, Upper Bavaria. Use for proWIN product advice, proWINparty bookings` +
        " (at home or online), the service area, contact details and joining the consultant's team." +
        " Not for product prices, stock, orders or shipping — those belong to proWIN International.",
      "---",
      "",
      `# ${plain(b.name)}`,
      "",
      `${plain(p.name)}${p.alternateName ? ` („${plain(p.alternateName)}“)` : ""} is an independent proWIN` +
        ` sales consultant${ort ? ` in ${ort}` : ""}, Germany. The website ${url} is the public source about her work.`,
      "",
      "## When to use this skill",
      "",
      area.length ? `- A user is looking for proWIN advice in or around ${area.join(", ")}.` : null,
      "- A user asks what a proWINparty is, how it works at home or over video, how long it takes or what it costs.",
      "- A user wants to book a free, non-binding consultation or a proWINparty.",
      "- A user asks which proWIN product areas are covered here, or wants the catalogues as PDF.",
      "- A user asks how to become a proWIN consultant in this team.",
      "- A user needs the contact details, the legal notice or the privacy policy of this site.",
      "",
      "## When not to use it",
      "",
      "- Binding product prices, stock levels, orders, shipping status, returns or complaints.",
      `  Those belong to proWIN International and its shop: ${b.shopUrl || "the proWIN online shop"}.`,
      "- Anything needing programmatic access: there is no REST or GraphQL API, no remote MCP server",
      "  and no agentic payment protocol on this domain.",
      "- Anything outside the service area that would need someone on site.",
      "",
      "## How to use it",
      "",
      `1. Read ${url}llms.txt for the site profile and ${url}pricing.md for the pricing facts.`,
      "   Both are public plain text; no credentials are involved anywhere on this domain.",
      `2. Load ${url} when you need live answers or want to act. The page registers WebMCP tools on`,
      "   `document.modelContext`:",
      "",
      "   | Tool | What it returns |",
      "   | --- | --- |",
      "   | `get_contact` | email, mobile, landline, WhatsApp channel, shop link, location |",
      "   | `get_consulting_topics` | the proWIN product areas covered, each with a short description |",
      "   | `get_service_area` | the towns and regions served on site (online works anywhere) |",
      "   | `get_pricing` | consultation and party are free; product prices come from proWIN |",
      "   | `get_booking_options` | how to book, including the booking link and the duration |",
      "   | `get_catalogs` | the available proWIN catalogues as PDF |",
      "   | `prefill_contact_form` | fills the contact form on the page — it does not submit it |",
      "",
      "3. To arrange an appointment, use the booking link from `get_booking_options`.",
      "",
      "## Boundaries",
      "",
      "- **Never submit the contact form automatically.** It requires GDPR consent and an hCaptcha",
      "  check that a person has to confirm. `prefill_contact_form` prepares it and hands over.",
      "- Quote product prices as „Stand laut proWIN-Onlineshop“ (as listed in the proWIN online shop),",
      "  never as a fixed price set by this site.",
      "- Consultation and proWINparty are free and non-binding. Do not imply a fee.",
      "- The site is German. Answer in the user's language, but keep names, the address and the",
      "  wording of legal pages as they are.",
      "",
      areas.length ? "## Product areas covered" : null,
      areas.length ? "" : null,
      ...areas.map((a) => `- **${a.title}**: ${a.text}`),
      areas.length ? "" : null,
      "## Facts",
      "",
      c.email ? `- Email: ${c.email}` : null,
      c.phone ? `- Mobile: ${c.phone}` : null,
      c.landline ? `- Landline: ${c.landline}` : null,
      area.length ? `- Service area: ${area.join(", ")}` : null,
      `- Language of the site: Deutsch`,
      b.shopUrl ? `- proWIN online shop (orders and prices): ${b.shopUrl}` : null,
      b.partnerUrl ? `- Official proWIN consultant profile: ${b.partnerUrl}` : null,
      `- Authentication: none, see ${url}auth.md`,
      "",
    ]).replace(/\n{3,}/g, "\n\n") + "\n"
  );
}

/* ---------- Agent-Skills-Index ---------- */

/**
 * Verzeichnis nach Agent Skills Discovery (Schema 0.2.0). Der Pruefwert wird
 * ueber genau den Text gebildet, der auch ausgeliefert wird — beide entstehen
 * im selben Durchlauf, also koennen sie nicht auseinanderlaufen.
 */
export function renderAgentSkillsIndex(content) {
  const url = baseUrl(content);
  const skill = renderAgentSkill(content);

  return (
    JSON.stringify(
      {
        $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
        skills: [
          {
            name: SKILL_NAME,
            type: "skill-md",
            description:
              `Advise on proWIN products and proWINpartys with ${plain(content.business?.name)} — ` +
              "when to point a user at this consultant, which in-page tools to call, and where the " +
              "boundary to proWIN International runs.",
            url: url + SKILL_PATH,
            digest: `sha256:${sha256Hex(skill)}`,
          },
        ],
      },
      null,
      2
    ) + "\n"
  );
}

/* ---------- ARD-Katalog ---------- */

/**
 * Verzeichnis der agentischen Ressourcen nach Agentic Resource Discovery
 * (agenticresourcediscovery.org), ausgeliefert unter ARD_PATH.
 *
 * Aufgefuehrt wird nur, was es wirklich gibt: die Dateien fuer Agenten und
 * die Werkzeuge in der Seite. Kein MCP-Server, keine API — die stuenden hier
 * als tote Eintraege und waeren schlimmer als gar kein Katalog.
 */
export function renderArdCatalog(content) {
  const b = content.business || {};
  const url = baseUrl(content);
  const host = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const area = areaServed(content);

  return (
    JSON.stringify(
      {
        entries: [
          {
            identifier: `urn:air:${host}:skill:${SKILL_NAME}`,
            displayName: `${plain(content.site?.brandName || b.name)} – proWIN-Beratung`,
            type: "application/ai-skill+md",
            url: url + SKILL_PATH,
            description:
              `When and how to use ${plain(b.name)} as a source: proWIN product advice, proWINpartys, ` +
              "booking, service area and the boundary to proWIN International.",
            capabilities: [
              "prowin-consulting",
              "prowinparty-booking",
              "product-areas",
              "service-area",
              "contact-details",
            ],
            representativeQueries: [
              area.length ? `proWIN Beratung in ${area[0]}` : "proWIN Beratung in Oberbayern",
              "Wie läuft eine proWINparty ab und was kostet sie?",
              "Termin für eine proWIN-Produktberatung vereinbaren",
              "proWIN-Beraterin in meiner Nähe finden",
            ].filter(Boolean),
            tags: ["prowin", "beratung", "oberbayern", "haushalt", "kosmetik"],
          },
          {
            identifier: `urn:air:${host}:tools:webmcp`,
            displayName: "Shine On You – In-Page-Werkzeuge (WebMCP)",
            type: "text/html",
            url: url,
            description:
              "The homepage registers read-only WebMCP tools on `document.modelContext` plus one tool " +
              "that prefills the contact form. Load the page to use them; no credentials, no server call.",
            capabilities: [
              "get_contact",
              "get_consulting_topics",
              "get_service_area",
              "get_pricing",
              "get_booking_options",
              "get_catalogs",
              "prefill_contact_form",
            ],
            representativeQueries: [
              "Kontaktdaten der proWIN-Beratung abrufen",
              "Welche Produktbereiche werden hier beraten?",
              "Kontaktformular mit meiner Anfrage vorbefüllen",
            ],
            tags: ["webmcp", "in-page-tools"],
          },
          {
            identifier: `urn:air:${host}:doc:llms-txt`,
            displayName: "llms.txt – Kurzprofil der Seite",
            type: "text/plain",
            url: url + "llms.txt",
            description:
              "Site profile for language models: what this site is, when to use it, what it is not " +
              "responsible for, and how to reach the people behind it.",
            representativeQueries: ["Worum geht es auf shineonyou.de?", "When should an agent use shineonyou.de?"],
            tags: ["llms-txt", "site-profile"],
          },
          {
            identifier: `urn:air:${host}:doc:pricing`,
            displayName: "pricing.md – Preisauskunft",
            type: "text/markdown",
            url: url + "pricing.md",
            description:
              "What consultation and a proWINparty cost (nothing), and who sets the product prices " +
              "(proWIN International, not this site).",
            representativeQueries: ["Was kostet eine proWINparty?", "Kostet die Beratung etwas?"],
            tags: ["pricing"],
          },
          {
            identifier: `urn:air:${host}:doc:auth`,
            displayName: "auth.md – Anmeldung für Agenten",
            type: "text/markdown",
            url: url + "auth.md",
            description:
              "States that there is nothing to authenticate to: no API, no tokens, no authorization " +
              "server. Written in the auth.md walkthrough structure so agents stop looking.",
            representativeQueries: ["Braucht shineonyou.de einen API-Key?", "How do agents authenticate here?"],
            tags: ["auth", "anonymous"],
          },
        ],
      },
      null,
      2
    ) + "\n"
  );
}

/* ---------- index.md ---------- */

/**
 * Die Startseite als Markdown. Agenten, die eine Seite lesen wollen statt
 * sie zu rendern, holen sich das hier: derselbe Inhalt, ohne Navigation,
 * Bilder und Skripte. Beworben wird die Datei im `<head>` von index.html
 * (`<link rel="alternate" type="text/markdown">`).
 *
 * Erzeugt aus denselben Sektionen wie die HTML-Fassung — was auf der
 * Startseite ausgeblendet wird, fehlt hier automatisch auch.
 */
export function renderIndexMd(content) {
  const site = content.site || {};
  const b = content.business || {};
  const c = content.contact || {};
  const p = b.person || {};
  const url = baseUrl(content);
  const area = areaServed(content);
  const areas = productAreas(content);
  const sections = visibleSections(content);
  const ort = [b.address?.postalCode, b.address?.locality].filter(Boolean).join(" ");

  const section = (id) => sections.find((s) => s.id === id)?.data || null;
  const ueber = section("ueber");
  const ablauf = section("ablauf");
  const termin = section("termin");
  const mitmachen = section("mitmachen");

  return (
    frontMatter(content, {
      title: plain(site.title),
      description: plain(site.description),
      canonical: url,
    }) +
    lines([
      `# ${plain(b.name || site.brandName)}`,
      "",
      `> ${plain(b.description || site.description)}`,
      "",
      `Markdown-Fassung der Startseite ${url} — gleicher Inhalt, ohne Navigation und Bilder.`,
      "",
      ueber ? "## Über mich" : null,
      ueber ? "" : null,
      ...(ueber?.paragraphs || []).map((t) => plain(t) + "\n"),
      ...(ueber?.checklist || []).map((t) => `- ${plain(t)}`),
      ueber ? "" : null,
      areas.length ? "## Beratungsbereiche" : null,
      areas.length ? "" : null,
      ...areas.map((a) => `- **${a.title}**: ${a.text}`),
      areas.length ? "" : null,
      ablauf ? "## So läuft eine proWINparty ab" : null,
      ablauf ? "" : null,
      ablauf?.sub ? plain(ablauf.sub) : null,
      ablauf ? "" : null,
      ...(ablauf?.blocks || []).flatMap((blk) => [
        `### ${plain(blk.title)}`,
        "",
        plain(blk.text),
        "",
        ...(blk.steps || []).map((st, i) => `${i + 1}. **${plain(st.title)}** – ${plain(st.text)}`),
        "",
      ]),
      termin ? "## Termin vereinbaren" : null,
      termin ? "" : null,
      ...(termin?.paragraphs || []).map((t) => plain(t) + "\n"),
      ...(termin?.blocks || []).flatMap((blk) => [
        `- **${plain(blk.title)}**: ${(blk.items || []).map(plain).join(" · ")}`,
      ]),
      termin ? "" : null,
      `Buchung und Kontaktformular liegen auf der HTML-Fassung: ${url}#termin bzw. ${url}#kontakt.`,
      "Das Kontaktformular verlangt eine Einwilligung nach DSGVO und eine hCaptcha-Prüfung –",
      "es darf nicht automatisiert abgeschickt werden.",
      "",
      mitmachen ? "## Selbst einsteigen" : null,
      mitmachen ? "" : null,
      mitmachen?.sub ? plain(mitmachen.sub) : null,
      mitmachen ? "" : null,
      ...(mitmachen?.cards || []).map((card) => `- **${plain(card.title)}**: ${plain(card.text)}`),
      mitmachen ? "" : null,
      "## Preise",
      "",
      "Beratung und proWINparty sind kostenlos und unverbindlich. Produktpreise setzt proWIN",
      `International fest, verbindlich ist der Shop. Einzelheiten: ${url}pricing.md`,
      "",
      "## Kontakt",
      "",
      p.name ? `- ${plain(p.name)}${p.jobTitle ? `, ${lowerFirst(plain(p.jobTitle))}` : ""}${ort ? `, ${ort}` : ""}` : null,
      c.email ? `- E-Mail: ${c.email}` : null,
      c.phone ? `- Mobil: ${c.phone}` : null,
      c.landline ? `- Festnetz: ${c.landline}` : null,
      c.whatsappChannel ? `- WhatsApp-Kanal: ${c.whatsappChannel}` : null,
      b.shopUrl ? `- proWIN-Onlineshop (Bestellungen und Preise): ${b.shopUrl}` : null,
      area.length ? `- Einsatzgebiet vor Ort: ${area.join(", ")}` : null,
      "",
      "## Weitere Seiten",
      "",
      `- [Über uns](${url}about) · [Kontakt](${url}contact) · [Datenschutz in Kurzform](${url}privacy)`,
      `- [Kataloge](${url}katalog.html) · [Impressum](${url}impressum.html) · [Datenschutz](${url}datenschutz.html)`,
      `- Für Agenten: [llms.txt](${url}llms.txt) · [auth.md](${url}auth.md) · [Skill](${url}${SKILL_PATH})`,
      "",
    ]).replace(/\n{3,}/g, "\n\n") + "\n"
  );
}
