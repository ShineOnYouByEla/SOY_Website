/* ============================================================
   Shine On You — Dateien fuer KI-Agenten und Suchmaschinen
   ------------------------------------------------------------
   Erzeugt aus content/site.json:
     llms.txt    — Kurzprofil der Seite fuer Sprachmodelle
     pricing.md  — maschinenlesbare Preisauskunft
     sitemap.xml — alle auslieferbaren Seiten
   Bewusst ohne Node-APIs: laeuft im Build-Script und im Worker.

   Die Fliesstexte hier sind entwicklerseitig gepflegt; alle Fakten
   (Name, Kontakt, Einsatzgebiet, Termine) kommen aus
   content/site.json und bleiben damit automatisch aktuell.
   ============================================================ */

import { visibleSections } from "./render.mjs";
import { availableLangs, langDir } from "./i18n.mjs";
import { sha256Hex } from "./sha256.mjs";

/* Wo die maschinenlesbaren Dateien liegen. Die Pfade stehen in llms.txt,
   im ARD-Katalog und im Skill-Index — darum nur hier. */
export const SKILL_NAME = "kontakt-shine-on-you";
export const SKILL_PATH = `.well-known/agent-skills/${SKILL_NAME}/SKILL.md`;
export const SKILLS_INDEX_PATH = ".well-known/agent-skills/index.json";
export const ARD_PATH = ".well-known/ard.json";
/* Das oeffentliche Repository dieser Website. */
export const REPO_URL = "https://github.com/ShineOnYouByEla/SOY_Website";

/* Die Seiten, die ausgeliefert werden. Neue Seite -> hier ergaenzen.
   `translated`: die Seite gibt es auch unter /en/.
   katalog.html fehlt hier absichtlich: Die Seite soll nur ueber einen
   direkt weitergegebenen Link erreichbar sein, nicht ueber Sitemap,
   llms.txt oder Agenten-Werkzeuge (siehe auch noindex in katalog.html). */
const PAGES = [
  { path: "", translated: true, changefreq: "monthly", priority: "1.0", label: "Startseite", note: "Kurzvorstellung, Terminbuchung und Kontaktformular" },
  { path: "impressum.html", translated: true, changefreq: "yearly", priority: "0.3", label: "Impressum", note: "Anbieterkennzeichnung nach § 5 DDG" },
  { path: "datenschutz.html", translated: true, changefreq: "yearly", priority: "0.3", label: "Datenschutz", note: "Datenschutzerklärung nach DSGVO" },
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
 * YAML-Kopf fuer index.md. Agenten lesen daraus Titel, Zweck und Stand, ohne
 * den Fliesstext auseinandernehmen zu muessen.
 *
 * Bewusst nur dort: pricing.md und auth.md werden danach beurteilt, ob sie mit
 * ihrer Ueberschrift beginnen. Ein YAML-Block davor kostet dort mehr, als die
 * Metadaten einbringen — und die Ueberschrift sagt bei beiden ohnehin schon,
 * worum es geht.
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
  const ort = [b.address?.postalCode, b.address?.locality].filter(Boolean).join(" ");

  const page = (path) => url + path;

  return (
    lines([
      `# ${plain(b.name || site.brandName)}`,
      "",
      `> ${plain(b.description || site.description)}`,
      "",
      `${plain(site.brandName)} ist die Kontaktseite von ${plain(p.name)}${p.alternateName ? ` („${plain(p.alternateName)}“)` : ""}, ` +
        `${lowerFirst(plain(p.jobTitle))}${ort ? ` in ${ort}` : ""}. Über die Seite lässt sich ein Termin buchen ` +
        "oder eine Nachricht schicken.",
      "",
      "Diese Website ist eine statische Kontaktseite. Sie hat keinen Online-Shop, keine öffentliche API",
      "und keine Zahlungsabwicklung. Termine laufen über einen Kalender-Dienst (Cal.com, EU-Region).",
      "",
      "## Wann diese Seite die richtige Quelle ist",
      "",
      `- Kontakt zu ${plain(p.name)}${ort ? ` in ${ort}` : ""}`,
      "- Terminvereinbarung für eine Beratung per Telefon, Video oder vor Ort",
      "- Kontaktdaten, Impressum und Datenschutzerklärung",
      "",
      "## Wofür diese Seite nicht zuständig ist",
      "",
      "- Produkte, Preise, Bestellungen oder Versand: hier wird nichts verkauft.",
      "- Programmatischer Zugriff: es gibt keine REST-/GraphQL-API, keinen MCP-Server und keine",
      "  agentischen Zahlungsprotokolle. Die In-Page-Werkzeuge unten sind der einzige Aktionsweg.",
      "",
      "## When to use this site (English)",
      "",
      `The site is German; ${url}en/ is an English version for orientation only. Consultations are held in German.`,
      "",
      `Use ${url} when a user needs:`,
      "",
      `- to get in touch with ${plain(p.name)}${ort ? ` in ${ort}` : ""} (Upper Bavaria, Germany)`,
      "- to book a free, non-binding appointment by phone, video or in person",
      "- the contact details, the legal notice (Impressum) or the privacy policy of this site",
      "",
      "Do not use this site for products, prices, orders or shipping — nothing is sold here. There is no",
      "REST/GraphQL API, no remote MCP server and no payment protocol here.",
      "",
      "## How an agent should use this site",
      "",
      `1. Facts: read this file and ${page("pricing.md")}. Both are plain text, public, no credentials.`,
      `2. Actions: on ${page("")} in-page WebMCP tools are registered on \`document.modelContext\` —`,
      "   \`get_contact\`, \`get_service_area\`, \`get_pricing\` and \`get_booking_options\` are",
      "   read-only; \`prefill_contact_form\` only writes into the form on the page.",
      "3. Booking runs through the Cal.com link that \`get_booking_options\` returns.",
      "4. The contact form must be submitted by a human: it needs GDPR consent and an hCaptcha check.",
      "   \`prefill_contact_form\` fills it in and stops there — never submit it automatically.",
      `5. Authentication: none. Everything agent-facing is public — see ${page("auth.md")}.`,
      "",
      "## Seiten",
      "",
      ...PAGES.map((pg) => `- [${pg.label}](${page(pg.path)}): ${pg.note}`),
      availableLangs(content).includes("en")
        ? `- [English version](${page("en/")}): Startseite, Impressum und Datenschutz auf Englisch (verbindlich sind die deutschen Rechtstexte)`
        : null,
      `- [Preise](${page("pricing.md")}): was ein Termin kostet (nichts)`,
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
      area.length ? `- Termine vor Ort: ${area.join(", ")}` : null,
      `- Sprache: Deutsch`,
      "",
      "## Hinweise für Agenten",
      "",
      `- Strukturierte Daten (JSON-LD, schema.org) liegen im \`<head>\` von ${page("")}.`,
      "- In-Page-Werkzeuge nach WebMCP sind auf der Startseite registriert (`document.modelContext`):",
      "  Kontaktdaten, Einsatzgebiet, Preisauskunft, Terminbuchung und das Vorbefüllen des",
      "  Kontaktformulars.",
      "- Das Kontaktformular darf nicht automatisiert abgeschickt werden: es verlangt eine",
      "  Einwilligung nach DSGVO und eine hCaptcha-Prüfung. Vorbefüllen ja, Absenden nur durch Menschen.",
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
    lines([
      `# Preise – ${plain(content.site?.brandName || b.name)}`,
      "",
      `${plain(b.name)} · ${plain(b.person?.jobTitle)}`,
      "",
      "Diese Seite verkauft nichts. Sie dient der Kontaktaufnahme und der Terminvereinbarung.",
      "",
      "## Termine",
      "",
      "| Leistung | Preis |",
      "| --- | --- |",
      "| Telefon- oder Videoberatung (ca. 30 Minuten) | kostenlos, unverbindlich |",
      "| Termin vor Ort (ca. 60 Minuten) | kostenlos, unverbindlich |",
      "",
      "## Was diese Seite nicht anbietet",
      "",
      "- Keine Produkte, keine Preisliste und keine Preis-API",
      "- Keine Zahlungsabwicklung, keine agentischen Zahlungsprotokolle (x402, MPP, ACP, UCP, AP2)",
      "- Keine Abo- oder Staffelpreise",
      "",
      "## Kontakt",
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
  const langs = availableLangs(content);

  /* Jede Sprachfassung ist ein eigener Eintrag und nennt alle Fassungen
     derselben Seite — so verlangt es Google fuer hreflang in Sitemaps. */
  const entries = PAGES.flatMap((pg) => {
    const versions = pg.translated && langs.length > 1 ? langs : [langs[0]];
    const alternates =
      versions.length > 1
        ? [
            ...versions.map(
              (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${xml(url + langDir(l) + pg.path)}" />`
            ),
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${xml(url + pg.path)}" />`,
          ]
        : [];
    return versions.map((l) =>
      lines([
        "  <url>",
        `    <loc>${xml(url + langDir(l) + pg.path)}</loc>`,
        ...alternates,
        updated ? `    <lastmod>${updated}</lastmod>` : null,
        `    <changefreq>${pg.changefreq}</changefreq>`,
        `    <priority>${pg.priority}</priority>`,
        "  </url>",
      ])
    );
  });

  return (
    lines([
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!-- Erzeugt aus content/site.json (shared/agents.mjs) — nicht von Hand bearbeiten. -->',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
      ...entries,
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
      "`document.modelContext` (`get_contact`, `get_service_area`, `get_pricing`,",
      "`get_booking_options`, `prefill_contact_form`). An agent that",
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
  const ort = [b.address?.postalCode, b.address?.locality].filter(Boolean).join(" ");

  return (
    lines([
      "---",
      `name: ${SKILL_NAME}`,
      `description: When to use this skill: someone wants to contact or book an appointment with ${plain(p.name)},` +
        ` a self-employed consultant${ort ? ` in ${ort}` : ""}, Upper Bavaria, or needs the service area,` +
        " contact details, legal notice or privacy policy of this site. Nothing is sold here.",
      "---",
      "",
      `# ${plain(b.name)}`,
      "",
      `${plain(p.name)}${p.alternateName ? ` („${plain(p.alternateName)}“)` : ""} is a self-employed` +
        ` consultant${ort ? ` in ${ort}` : ""}, Germany. The website ${url} is a contact page.`,
      "",
      "## When to use this",
      "",
      `- A user wants to get in touch with ${plain(p.name)}.`,
      "- A user wants to book a free, non-binding appointment by phone, video or in person.",
      area.length ? `- A user asks whether appointments in person are possible in or around ${area.join(", ")}.` : null,
      "- A user needs the contact details, the legal notice or the privacy policy of this site.",
      "",
      "## When not to use it",
      "",
      "- Products, prices, orders or shipping: nothing is sold on this site.",
      "- Anything needing programmatic access: there is no REST or GraphQL API, no remote MCP server",
      "  and no agentic payment protocol on this domain.",
      "",
      "## How to use it",
      "",
      `1. Read ${url}llms.txt for the site profile.`,
      "   It is public plain text; no credentials are involved anywhere on this domain.",
      `2. Load ${url} when you need live answers or want to act. The page registers WebMCP tools on`,
      "   `document.modelContext`:",
      "",
      "   | Tool | What it returns |",
      "   | --- | --- |",
      "   | `get_contact` | email, mobile, landline, location |",
      "   | `get_service_area` | the towns and regions served in person (phone and video work anywhere) |",
      "   | `get_pricing` | appointments are free and non-binding |",
      "   | `get_booking_options` | how to book, including the booking link and the duration |",
      "   | `prefill_contact_form` | fills the contact form on the page — it does not submit it |",
      "",
      "3. To arrange an appointment, use the booking link from `get_booking_options`.",
      "",
      "## Boundaries",
      "",
      "- **Never submit the contact form automatically.** It requires GDPR consent and an hCaptcha",
      "  check that a person has to confirm. `prefill_contact_form` prepares it and hands over.",
      "- Appointments are free and non-binding. Do not imply a fee.",
      "- The site is German. Answer in the user's language, but keep names, the address and the",
      "  wording of legal pages as they are.",
      "",
      "## Facts",
      "",
      c.email ? `- Email: ${c.email}` : null,
      c.phone ? `- Mobile: ${c.phone}` : null,
      c.landline ? `- Landline: ${c.landline}` : null,
      area.length ? `- Appointments in person: ${area.join(", ")}` : null,
      `- Language of the site: Deutsch`,
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
              "When to use this skill: someone wants to contact or book an appointment with " +
              `${plain(content.business?.name)}, or needs its service area or contact details. The skill ` +
              "says which in-page tools to call. Nothing is sold on this site.",
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
        /* Die Version des Umschlags, nicht die des Dokuments: veroeffentlichte
           Manifeste tragen hier "1.0". Ohne das Feld gilt der Katalog als
           unvollstaendig, auch wenn jeder Eintrag fuer sich gueltig ist. */
        specVersion: "1.0",
        host: {
          displayName: plain(b.name || content.site?.brandName),
          identifier: host,
          documentationUrl: url + "llms.txt",
        },
        entries: [
          {
            identifier: `urn:air:${host}:skill:${SKILL_NAME}`,
            displayName: `${plain(content.site?.brandName || b.name)} – Kontakt`,
            type: "application/ai-skill+md",
            url: url + SKILL_PATH,
            description:
              `When and how to use ${plain(b.name)} as a source: contact details, appointment ` +
              "booking and service area.",
            capabilities: ["appointment-booking", "service-area", "contact-details"],
            representativeQueries: [
              `Kontakt zu ${plain(b.person?.name || b.name)}`,
              area.length ? `Termin in ${area[0]} vereinbaren` : "Termin vereinbaren",
            ].filter(Boolean),
            tags: ["kontakt", "termin", "oberbayern"],
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
              "get_service_area",
              "get_pricing",
              "get_booking_options",
              "prefill_contact_form",
            ],
            representativeQueries: [
              "Kontaktdaten abrufen",
              "Welche Termine gibt es?",
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
              "What an appointment costs (nothing). Nothing is sold on this site.",
            representativeQueries: ["Kostet ein Termin etwas?"],
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
  const sections = visibleSections(content);
  const ort = [b.address?.postalCode, b.address?.locality].filter(Boolean).join(" ");

  const section = (id) => sections.find((s) => s.id === id)?.data || null;
  const ueber = section("ueber");
  const termin = section("termin");

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
      "## Preise",
      "",
      `Termine sind kostenlos und unverbindlich. Hier wird nichts verkauft. Einzelheiten: ${url}pricing.md`,
      "",
      "## Kontakt",
      "",
      p.name ? `- ${plain(p.name)}${p.jobTitle ? `, ${lowerFirst(plain(p.jobTitle))}` : ""}${ort ? `, ${ort}` : ""}` : null,
      c.email ? `- E-Mail: ${c.email}` : null,
      c.phone ? `- Mobil: ${c.phone}` : null,
      c.landline ? `- Festnetz: ${c.landline}` : null,
      area.length ? `- Termine vor Ort: ${area.join(", ")}` : null,
      "",
      "## Weitere Seiten",
      "",
      `- [Über uns](${url}about) · [Kontakt](${url}contact) · [Datenschutz in Kurzform](${url}privacy)`,
      `- [Impressum](${url}impressum.html) · [Datenschutz](${url}datenschutz.html)`,
      `- Für Agenten: [llms.txt](${url}llms.txt) · [auth.md](${url}auth.md) · [Skill](${url}${SKILL_PATH})`,
      "",
    ]).replace(/\n{3,}/g, "\n\n") + "\n"
  );
}
