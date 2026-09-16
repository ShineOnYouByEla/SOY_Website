/* ============================================================
   Shine On You — Einstiegsseiten unter sprechenden Adressen
   ------------------------------------------------------------
   /about, /contact und /privacy. Agenten fragen diese drei Pfade
   ab, bevor sie ein Unternehmen weiterempfehlen — auf einer
   deutschsprachigen Seite laufen sie sonst ins Leere.

   Die Seiten wiederholen keine Inhalte auf eigene Faust: sie
   fassen zusammen, was auf der Startseite und in den Rechtstexten
   steht, und verweisen auf die maßgebliche Fassung. Verbindlich
   bleiben impressum.html und datenschutz.html.

   Alle Fakten kommen aus content/site.json, damit Telefonnummer
   und E-Mail nicht an vier Stellen gepflegt werden müssen.
   Erzeugt von scripts/build-site.mjs — nicht von Hand ändern.
   ============================================================ */

import { esc, plainText, visibleSections } from "./render.mjs";

const lines = (parts) => parts.filter((p) => p !== null && p !== undefined && p !== false).join("\n");

/* Telefonnummern brauchen geschuetzte Leerzeichen, sonst bricht die Nummer
   am Zeilenende um (und html-validate meldet es zu Recht als Fehler). */
const tel = (nr) => esc(nr).replace(/ /g, "&nbsp;");

/** Die Karten der Produkt-Sektion. */
function productAreas(content) {
  const section = visibleSections(content).find((s) => s.id === "produkte");
  return (section?.data?.cards || []).map((c) => ({ title: plainText(c.title), text: plainText(c.text) }));
}

function areaServed(content) {
  return (content.business?.areaServed || []).map((a) => plainText(a.name)).filter(Boolean);
}

/* Der Seitenrahmen — bewusst schlank wie bei impressum.html: Marke,
   Inhalt, Fußzeile. Keine Sprungmarken-Navigation, die hier ins Leere
   zeigen würde. */
function shell(content, { title, description, body }) {
  const site = content.site || {};

  return (
    lines([
      "<!DOCTYPE html>",
      `<html lang="${esc(site.lang || "de")}">`,
      "<head>",
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `  <title>${esc(title)}</title>`,
      `  <meta name="description" content="${esc(description)}" />`,
      /* Die Startseite bleibt die Adresse für Suchmaschinen; diese Seiten
         sind Einstiegspunkte, keine zweite Fassung der Website. */
      '  <meta name="robots" content="noindex, follow" />',
      `  <meta name="theme-color" content="${esc(site.themeColor)}" />`,
      '  <link rel="icon" type="image/png" sizes="32x32" href="assets/img/favicon-32.png" />',
      "",
      "  <!-- Theme frueh setzen (verhindert Aufblitzen des falschen Modus) -->",
      "  <script>",
      "    (function () {",
      "      try {",
      '        var stored = localStorage.getItem("soy-theme");',
      '        var mode = stored === "light" || stored === "dark" ? stored : "system";',
      '        var prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;',
      '        var theme = mode === "system" ? (prefersLight ? "light" : "dark") : mode;',
      '        document.documentElement.setAttribute("data-theme", theme);',
      '        document.documentElement.setAttribute("data-theme-mode", mode);',
      "      } catch (e) {",
      '        document.documentElement.setAttribute("data-theme", "dark");',
      '        document.documentElement.setAttribute("data-theme-mode", "system");',
      "      }",
      "    })();",
      "  </script>",
      "",
      '  <link rel="stylesheet" href="css/fonts.css" />',
      '  <link rel="stylesheet" href="css/styles.css" />',
      "</head>",
      "<body>",
      '  <header class="site-header">',
      '    <div class="container header-inner">',
      `      <a href="index.html#top" class="brand" aria-label="${esc(site.brandName)} – Startseite">`,
      `        <img src="assets/img/wordmark.webp" alt="${esc(site.brandName)}" class="brand-logo" width="640" height="360" />`,
      "      </a>",
      "    </div>",
      "  </header>",
      "",
      '  <main class="legal-main">',
      '    <div class="container">',
      '      <a href="index.html" class="legal-back">&larr; Zur Startseite</a>',
      body,
      "    </div>",
      "  </main>",
      "",
      '  <footer class="site-footer">',
      '    <div class="container footer-inner">',
      '      <p class="footer-legal">',
      '        <a href="index.html">Startseite</a> · <a href="impressum.html">Impressum</a> · <a href="datenschutz.html">Datenschutz</a>',
      "      </p>",
      '      <p class="footer-fine">&copy; <span id="year"></span> ' + esc(site.brandName) + " · Seit 2026.</p>",
      "    </div>",
      "  </footer>",
      "",
      '  <script src="js/theme.js" defer></script>',
      '  <script>document.getElementById("year").textContent = new Date().getFullYear();</script>',
      "</body>",
      "</html>",
      "",
    ]) + ""
  );
}

/* ---------- /about ---------- */

function aboutBody(content) {
  const b = content.business || {};
  const p = b.person || {};
  const area = areaServed(content);
  const areas = productAreas(content);
  const ueber = visibleSections(content).find((s) => s.id === "ueber")?.data || {};
  const ort = [b.address?.postalCode, b.address?.locality].filter(Boolean).join(" ");

  return lines([
    "      <h1>Über Shine On You</h1>",
    `      <p>${esc(plainText(b.description))}</p>`,
    `      <p>${esc(plainText(p.description))}</p>`,
    ...(ueber.paragraphs || []).map((t) => `      <p>${esc(plainText(t))}</p>`),
    (ueber.checklist || []).length ? "      <h2>Wofür diese Beratung steht</h2>" : null,
    (ueber.checklist || []).length ? "      <ul>" : null,
    ...(ueber.checklist || []).map((t) => `        <li>${esc(plainText(t))}</li>`),
    (ueber.checklist || []).length ? "      </ul>" : null,
    areas.length ? "      <h2>Beratungsbereiche</h2>" : null,
    areas.length ? "      <ul>" : null,
    ...areas.map((a) => `        <li><strong>${esc(a.title)}</strong> – ${esc(a.text)}</li>`),
    areas.length ? "      </ul>" : null,
    "      <h2>Wo beraten wird</h2>",
    `      <p>`,
    area.length
      ? `        Vor Ort in ${esc(area.join(", "))}${ort ? ` – der Sitz ist ${esc(ort)}` : ""}.`
      : "        Vor Ort nach Absprache.",
    "        Eine proWINparty oder eine Produktberatung geht auch online per Video, dafür spielt der Wohnort keine Rolle.",
    "      </p>",
    "      <h2>Was hier nicht passiert</h2>",
    "      <p>",
    "        Diese Website verkauft nicht selbst. Bestellungen, Preise, Versand und Reklamationen laufen über",
    b.shopUrl
      ? `        den <a href="${esc(b.shopUrl)}" target="_blank" rel="noopener">proWIN-Onlineshop</a> bzw. über proWIN International.`
      : "        proWIN International.",
    "        Beratung und proWINparty sind kostenlos und unverbindlich.",
    "      </p>",
    "      <h2>About (English)</h2>",
    "      <p>",
    `        ${esc(plainText(b.name))} is the site of ${esc(plainText(p.name))}, an independent proWIN sales consultant`,
    ort ? `        in ${esc(ort)}, Upper Bavaria, Germany.` : "        in Germany.",
    "        She advises on proWIN products for household, cleaning, cosmetics and wellness, and hosts proWINpartys",
    "        at people's homes or online over video. Consultation and party are free and non-binding; product orders,",
    "        prices and shipping are handled by proWIN International.",
    "      </p>",
    '      <p><a href="contact.html">Kontakt</a> · <a href="impressum.html">Impressum</a> · <a href="privacy.html">Datenschutz in Kurzform</a></p>',
  ]);
}

/* ---------- /contact ---------- */

function contactBody(content) {
  const b = content.business || {};
  const c = content.contact || {};
  const area = areaServed(content);
  const ort = [b.address?.postalCode, b.address?.locality].filter(Boolean).join(" ");

  return lines([
    "      <h1>Kontakt</h1>",
    "      <p>",
    `        ${esc(plainText(b.name))}. Am schnellsten geht es direkt – per E-Mail, Telefon oder über`,
    "        das Kontaktformular auf der Startseite. Eine Antwort kommt in der Regel innerhalb weniger Tage.",
    "      </p>",
    "      <h2>Direkt erreichbar</h2>",
    "      <ul>",
    c.email ? `        <li>E-Mail: <a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : null,
    c.phone ? `        <li>Mobil: <a href="tel:${esc(c.phoneHref || c.phone)}">${tel(c.phone)}</a></li>` : null,
    c.landline ? `        <li>Festnetz: <a href="tel:${esc(c.landlineHref || c.landline)}">${tel(c.landline)}</a></li>` : null,
    c.whatsappChannel
      ? `        <li>WhatsApp-Kanal (Angebote und Neuigkeiten): <a href="${esc(c.whatsappChannel)}" target="_blank" rel="noopener">folgen</a></li>`
      : null,
    "      </ul>",
    "      <h2>Termin oder Nachricht</h2>",
    "      <ul>",
    '        <li><a href="index.html#termin">Beratungstermin buchen</a> – Telefon- oder Videoberatung (ca. 30 Minuten) oder eine proWINparty (ca. 60 Minuten), beides kostenlos und unverbindlich.</li>',
    '        <li><a href="index.html#kontakt">Kontaktformular</a> – für alles, was schriftlich einfacher ist. Das Formular verlangt eine Einwilligung nach DSGVO und eine hCaptcha-Prüfung; abschicken muss es ein Mensch.</li>',
    "      </ul>",
    "      <h2>Wo</h2>",
    "      <p>",
    ort ? `        Sitz: ${esc(ort)}. ` : "",
    area.length ? `        Vor Ort beraten wird in ${esc(area.join(", "))}.` : "",
    "        Online geht es überall – eine proWINparty per Video braucht nur einen Link.",
    "        Die vollständige Anbieterkennzeichnung steht im <a href=\"impressum.html\">Impressum</a>.",
    "      </p>",
    "      <h2>Wofür proWIN International zuständig ist</h2>",
    "      <p>",
    "        Bestellungen, Produktpreise, Lieferstatus, Rücksendungen und Reklamationen laufen nicht über diese Seite, sondern über",
    b.shopUrl
      ? `        den <a href="${esc(b.shopUrl)}" target="_blank" rel="noopener">proWIN-Onlineshop</a>.`
      : "        proWIN International.",
    "      </p>",
    "      <h2>Contact (English)</h2>",
    "      <p>",
    "        Written enquiries in English are fine; replies come in German or English.",
    c.email ? `        Email <a href="mailto:${esc(c.email)}">${esc(c.email)}</a> is the most reliable route.` : "",
    "        Consultation and proWINparty bookings are free and non-binding. Product orders and prices are handled by proWIN International, not by this site.",
    "      </p>",
    '      <p><a href="about.html">Über Shine On You</a> · <a href="impressum.html">Impressum</a> · <a href="datenschutz.html">Datenschutz</a></p>',
  ]);
}

/* ---------- /privacy ---------- */

function privacyBody(content) {
  const b = content.business || {};
  const c = content.contact || {};

  return lines([
    "      <h1>Datenschutz in Kurzform</h1>",
    "      <p>",
    "        Diese Seite fasst zusammen, was mit Daten passiert, wenn du shineonyou.de benutzt.",
    '        Verbindlich ist allein die vollständige <a href="datenschutz.html">Datenschutzerklärung</a>;',
    "        bei Abweichungen gilt der dortige Text.",
    "      </p>",
    "      <h2>Das Wichtigste</h2>",
    "      <ul>",
    "        <li><strong>Keine Cookies.</strong> Die Seite setzt keine Cookies und misst kein Nutzungsverhalten – keine Webanalyse, keine Werbe- oder Tracking-Technologie, keine Profilbildung.</li>",
    "        <li><strong>Zwei lokale Einstellungen.</strong> Im <code>localStorage</code> des Browsers liegen nur <code>soy-theme</code> (helles oder dunkles Design) und <code>soy-channel-tip</code> (der einmalige Hinweis auf den WhatsApp-Kanal). Beides bleibt auf dem Gerät und wird nicht übertragen.</li>",
    "        <li><strong>Schriftarten lokal.</strong> Die Schriften liegen auf dem Server dieser Seite, es wird keine fremde Schriftbibliothek aufgerufen.</li>",
    "        <li><strong>Server-Logfiles.</strong> Der Hoster protokolliert technische Zugriffsdaten – das lässt sich beim Betrieb einer Website nicht vermeiden.</li>",
    "        <li><strong>Kontaktformular.</strong> Was du einträgst, wird zur Beantwortung deiner Anfrage verarbeitet. Vor dem Absenden brauchen wir deine Einwilligung; gegen Spam läuft eine hCaptcha-Prüfung.</li>",
    "        <li><strong>Terminbuchung.</strong> Die Online-Buchung läuft über Cal.com. Erst wenn du sie aufrufst, wird eine Verbindung dorthin hergestellt.</li>",
    "        <li><strong>Externe Links.</strong> Für den proWIN-Onlineshop, den WhatsApp-Kanal und andere fremde Seiten gilt deren eigene Datenschutzerklärung.</li>",
    "      </ul>",
    "      <h2>Deine Rechte</h2>",
    "      <p>",
    "        Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch und Widerruf einer Einwilligung –",
    "        alles im Einzelnen in der <a href=\"datenschutz.html\">Datenschutzerklärung</a>. Zuständig ist",
    c.email
      ? `        ${esc(plainText(b.person?.name || b.name))}, erreichbar unter <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>.`
      : `        ${esc(plainText(b.person?.name || b.name))}.`,
    "        Beschwerden nimmt außerdem die zuständige Datenschutz-Aufsichtsbehörde entgegen.",
    "      </p>",
    "      <h2>Privacy (English)</h2>",
    "      <p>",
    "        No cookies, no analytics, no tracking, no profiling. Two non-personal settings are kept in the browser's",
    "        local storage (theme choice and a dismissed one-off notice). The host writes standard server logs.",
    "        The contact form needs explicit consent plus an hCaptcha check; appointment booking is handed to Cal.com",
    "        only when you open it. The binding text is the German",
    '        <a href="datenschutz.html">Datenschutzerklärung</a>.',
    "      </p>",
    '      <p><a href="about.html">Über Shine On You</a> · <a href="contact.html">Kontakt</a> · <a href="impressum.html">Impressum</a></p>',
  ]);
}

/* ---------- Ausgabe ---------- */

const PAGE_BUILDERS = {
  about: {
    title: (content) => `Über uns – ${plainText(content.site?.brandName)}`,
    description: () =>
      "Wer hinter Shine On You steckt: unabhängige proWIN-Beratung in Peiting und Umgebung, Beratungsbereiche und Einsatzgebiet.",
    body: aboutBody,
  },
  contact: {
    title: (content) => `Kontakt – ${plainText(content.site?.brandName)}`,
    description: () =>
      "Kontaktwege zu Shine On You: E-Mail, Telefon, WhatsApp-Kanal, Kontaktformular und Terminbuchung.",
    body: contactBody,
  },
  privacy: {
    title: (content) => `Datenschutz in Kurzform – ${plainText(content.site?.brandName)}`,
    description: () =>
      "Kurzüberblick zum Datenschutz auf shineonyou.de: keine Cookies, kein Tracking. Verbindlich ist die vollständige Datenschutzerklärung.",
    body: privacyBody,
  },
};

/** Die Dateinamen, unter denen die Seiten ausgeliefert werden. */
export const INFO_PAGES = Object.keys(PAGE_BUILDERS).map((slug) => ({ slug, path: `${slug}.html` }));

/** Eine der Einstiegsseiten als fertiges HTML. */
export function renderInfoPage(content, slug) {
  const spec = PAGE_BUILDERS[slug];
  if (!spec) throw new Error(`Unbekannte Einstiegsseite: ${slug}`);
  return shell(content, {
    title: spec.title(content),
    description: spec.description(content),
    body: spec.body(content),
  });
}
