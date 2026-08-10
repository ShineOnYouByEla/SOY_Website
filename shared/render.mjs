/* ============================================================
   Shine On You — HTML-Renderer
   ------------------------------------------------------------
   Erzeugt aus content/site.json die komplette index.html.
   Bewusst ohne Node-APIs geschrieben: dieselbe Datei laeuft im
   Build-Script (scripts/build-site.mjs) und im Cloudflare Worker
   fuer die Live-Vorschau im Admin.
   ============================================================ */

import { icon } from "./icons.mjs";

/* ---------- Text- und HTML-Helfer ---------- */

/** Text fuer HTML-Inhalt und Attribute unschaedlich machen. */
export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* Tags, die in Fliesstext erlaubt sind. */
const INLINE_TAGS = "strong|b|em|i|small|sup|sub";
/* Nur diese URL-Formen duerfen in einem <a href> stehen. */
const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/|#|[\w./-]+\.html(#[\w-]+)?$)/i;

/**
 * Fliesstext mit einer kleinen, sicheren Untermenge an HTML.
 * Vorgehen: erst alles escapen, dann gezielt die erlaubten Tags
 * wieder freigeben. Dadurch kann kein fremdes Attribut durchrutschen,
 * selbst wenn der Admin-Zugang kompromittiert waere.
 */
export function rich(value) {
  let out = esc(value);

  // <strong>, </strong>, <em> …
  out = out.replace(new RegExp(`&lt;(\\/?)(${INLINE_TAGS})&gt;`, "gi"), "<$1$2>");
  // <br>, <br/>, <br />
  out = out.replace(/&lt;br\s*\/?&gt;/gi, "<br />");
  // </a>
  out = out.replace(/&lt;\/a&gt;/gi, "</a>");
  // <a href="…"> – optional mit Kennzeichnung als externer Link
  out = out.replace(/&lt;a href=&quot;([^"&]*)&quot;( external)?&gt;/gi, (m, href, ext) => {
    if (!SAFE_URL.test(href)) return ""; // unerlaubtes Ziel -> Link faellt weg
    const extra = ext ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${esc(href)}"${extra}>`;
  });

  return out;
}

/** Leere Eintraege aus einer Liste werfen und Zeilen zusammenfuegen. */
const join = (parts, sep = "\n") => parts.filter(Boolean).join(sep);

/** Jede Zeile um n Leerzeichen einruecken. */
function indent(block, n) {
  const pad = " ".repeat(n);
  return String(block)
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

/** Absolute URL aus baseUrl + relativem Pfad. */
function abs(base, path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return String(base).replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
}

/* ---------- Sektionen ---------- */

/** Nur sichtbare Sektionen, in gespeicherter Reihenfolge. */
export function visibleSections(content) {
  return (content.sections || []).filter((s) => s && s.enabled !== false);
}

/** Navigationspunkte ergeben sich aus den sichtbaren Sektionen. */
export function navItems(content) {
  return visibleSections(content)
    .filter((s) => s.id && s.navLabel)
    .map((s) => ({ href: `#${s.id}`, label: s.navLabel }));
}

/* Dekorative Farbschleier hinter den Sektionen. */
function renderGlows(glows) {
  return (glows || [])
    .map(
      (g) =>
        `<span class="section-glow ${esc(g.kind || "wave")}" data-parallax="${esc(g.parallax ?? 0.07)}"` +
        ` style="${esc(g.style || "")}" aria-hidden="true"></span>`
    )
    .join("\n");
}

/* Ueberschriftenblock (Kicker / H2 / Unterzeile) */
function renderHead(data) {
  return join([
    data.kicker ? `<p class="section-kicker">${esc(data.kicker)}</p>` : "",
    data.heading ? `<h2>${rich(data.heading)}</h2>` : "",
    data.sub ? `<p class="section-sub">\n  ${rich(data.sub)}\n</p>` : "",
  ]);
}

/* Ein Button/Link mit optionaler Vorauswahl des Kontaktgrunds. */
function renderAction(a, extraClass = "") {
  const cls = ["btn", a.style === "ghost" ? "btn-ghost" : a.style === "wave" ? "btn-wave" : "btn-sun"];
  if (extraClass) cls.push(extraClass);
  const reason = a.contactReason ? ` data-contact-reason="${esc(a.contactReason)}"` : "";
  const external = a.external ? ' target="_blank" rel="noopener"' : "";
  return `<a href="${esc(a.href)}" class="${cls.join(" ")}"${reason}${external}>${esc(a.label)}</a>`;
}

const SECTIONS = {
  /* ---- Hero ---- */
  hero(s) {
    const d = s.data || {};
    const headline = (d.headline || [])
      .map((line, i) => (i === 0 ? esc(line) : `<span class="accent-sun">${esc(line)}</span>`))
      .join("<br />");
    const partner = d.partnerText
      ? join([
          '<p class="hero-partner">',
          `  <span>${esc(d.partnerText)}</span>`,
          d.partnerLogo
            ? `  <img src="${esc(d.partnerLogo.src)}" alt="${esc(d.partnerLogo.alt)}"` +
              ` width="${esc(d.partnerLogo.width)}" height="${esc(d.partnerLogo.height)}" />`
            : "",
          "</p>",
        ])
      : "";
    const actions = (d.actions || []).map((a) => "  " + renderAction(a)).join("\n");

    return join([
      '<section class="hero">',
      '  <div class="hero-glow" data-parallax="0.35" aria-hidden="true"></div>',
      '  <div class="container hero-inner">',
      "    <br />",
      partner ? indent(partner, 4) : "",
      `    <h1>${headline}</h1>`,
      d.lead ? `    <p class="lead">\n${indent(rich(d.lead), 6)}\n    </p>` : "",
      actions ? `    <div class="hero-actions">\n${indent(actions, 4)}\n    </div>` : "",
      "  </div>",
      '  <div class="hero-wave" aria-hidden="true"></div>',
      "</section>",
    ]);
  },

  /* ---- Zweispaltig: Bild + Text ---- */
  about(s) {
    const d = s.data || {};
    const img = d.image
      ? join([
          '<figure class="about-photo" data-parallax="0.04">',
          `  <img src="${esc(d.image.src)}" alt="${esc(d.image.alt)}" width="${esc(d.image.width)}"` +
            ` height="${esc(d.image.height)}" loading="lazy" decoding="async" />`,
          "</figure>",
        ])
      : "";
    const text = join([
      d.heading ? `<h2>${rich(d.heading)}</h2>` : "",
      ...(d.paragraphs || []).map((p) => `<p>\n${indent(rich(p), 2)}\n</p>`),
      (d.checklist || []).length
        ? join([
            '<ul class="checklist">',
            ...(d.checklist || []).map((li) => `  <li>${rich(li)}</li>`),
            "</ul>",
          ])
        : "",
    ]);

    return join([
      '<div class="container">',
      `  <div class="section-head">\n${indent(renderHead({ kicker: d.kicker }), 4)}\n  </div>`,
      "</div>",
      '<div class="container two-col">',
      `  <div class="two-col-media">\n${indent(img, 4)}\n  </div>`,
      `  <div class="two-col-text">\n${indent(text, 4)}\n  </div>`,
      "</div>",
    ]);
  },

  /* ---- Kartenraster ---- */
  cards(s) {
    const d = s.data || {};
    const cards = (d.cards || [])
      .map((c) =>
        join([
          '<article class="card">',
          '  <span class="card-icon" aria-hidden="true">',
          "    " + icon(c.icon),
          "  </span>",
          `  <h3>${rich(c.title)}</h3>`,
          `  <p>${rich(c.text)}</p>`,
          "</article>",
        ])
      )
      .join("\n\n");

    const cta = d.cta
      ? join([
          '<div class="team-cta">',
          "  " + renderAction(d.cta),
          d.cta.note ? `  <p class="team-cta-note">${rich(d.cta.note)}</p>` : "",
          "</div>",
        ])
      : "";

    return join([
      '<div class="container">',
      `  <div class="section-head">\n${indent(renderHead(d), 4)}\n  </div>`,
      "",
      `  <div class="cards">\n${indent(cards, 4)}\n  </div>`,
      cta ? "\n" + indent(cta, 2) : "",
      "</div>",
    ]);
  },

  /* ---- Ablauf mit Schrittketten ---- */
  flow(s) {
    const d = s.data || {};
    const arrow =
      '<span class="flow-arrow" aria-hidden="true">\n' +
      '  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13"/><path d="M13 6l6 6-6 6"/></svg>\n' +
      "</span>";

    const blocks = (d.blocks || [])
      .map((b) => {
        const steps = (b.steps || [])
          .map((st, i) =>
            join([
              '<div class="fstep">',
              `  <span class="fstep-num">${i + 1}</span>`,
              '  <span class="fstep-ic" aria-hidden="true">',
              "    " + icon(st.icon, { size: 24 }),
              "  </span>",
              `  <h4>${rich(st.title)}</h4>`,
              `  <p>${rich(st.text)}</p>`,
              "</div>",
            ])
          )
          .join("\n" + arrow + "\n");

        return join([
          `<div class="flow-block flow-${esc(b.variant || "sun")}">`,
          '  <div class="flow-head">',
          '    <span class="flow-badge" aria-hidden="true">',
          "      " + icon(b.icon, { size: 28 }),
          "    </span>",
          "    <div>",
          `      <h3>${rich(b.title)}</h3>`,
          `      <p>${rich(b.text)}</p>`,
          "    </div>",
          "  </div>",
          `  <div class="flow-steps">\n${indent(steps, 4)}\n  </div>`,
          "</div>",
        ]);
      })
      .join("\n\n");

    const p = d.perks;
    const perks = p
      ? join([
          '<div class="perks">',
          '  <div class="perks-head">',
          '    <span class="perks-badge" aria-hidden="true">',
          "      " + icon(p.icon, { size: 28 }),
          "    </span>",
          "    <div>",
          `      <h3>${rich(p.title)}</h3>`,
          `      <p>${rich(p.text)}</p>`,
          "    </div>",
          "  </div>",
          '  <div class="perks-grid">',
          indent(
            (p.items || [])
              .map((it) =>
                join([
                  '<article class="perk">',
                  `  <h4>${rich(it.title)}</h4>`,
                  `  <p>\n${indent(rich(it.text), 2)}\n  </p>`,
                  "</article>",
                ])
              )
              .join("\n"),
            4
          ),
          "  </div>",
          p.cta ? "  " + renderAction(p.cta, "perks-cta") : "",
          "</div>",
        ])
      : "";

    const down = d.downLink
      ? join([
          `<a href="${esc(d.downLink.href)}" class="flow-down" aria-label="${esc(d.downLink.label)}">`,
          '  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
            ' stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v13"/><path d="M6 13l6 6 6-6"/></svg>',
          "</a>",
        ])
      : "";

    return join([
      '<div class="container">',
      `  <div class="section-head">\n${indent(renderHead(d), 4)}\n  </div>`,
      "",
      indent(blocks, 2),
      perks ? "\n" + indent(perks, 2) : "",
      down ? "\n" + indent(down, 2) : "",
      "</div>",
    ]);
  },

  /* ---- Terminbuchung ---- */
  booking(s, content) {
    const d = s.data || {};
    const text = join([
      ...(d.paragraphs || []).map((para) => `<p>\n${indent(rich(para), 2)}\n</p>`),
      ...(d.blocks || []).flatMap((b, i) => [
        i > 0 ? "<br />" : "",
        `<h3>${rich(b.title)}</h3>`,
        join([
          '<ul class="checklist small">',
          ...(b.items || []).map((li) => `  <li>${rich(li)}</li>`),
          "</ul>",
        ]),
      ]),
    ]);

    const consentNote = d.consentNote || "";
    const media = join([
      '<div id="calConsent" class="cal-consent card" hidden>',
      '  <button type="button" id="calConsentBtn" class="btn btn-sun btn-block cal-consent-btn">',
      '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
        ' stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/>' +
        '<path d="M16 2v4M8 2v4M3 10h18"/></svg>',
      `    ${esc(d.consentButton || "Termin online buchen")}`,
      "  </button>",
      `  <p class="cal-consent-note">\n${indent(rich(consentNote), 4)}\n  </p>`,
      "</div>",
      '<section id="calEmbed" class="cal-embed card" hidden aria-label="Online-Terminbuchung"></section>',
    ]);

    return join([
      '<div class="container">',
      `  <div class="section-head">\n${indent(renderHead(d), 4)}\n  </div>`,
      "</div>",
      '<div class="container two-col two-col-wide">',
      `  <div class="two-col-text">\n${indent(text, 4)}\n  </div>`,
      "",
      `  <div class="two-col-media">\n${indent(media, 4)}\n  </div>`,
      "</div>",
    ]);
  },

  /* ---- Kontakt: Kontaktwege + Formular ---- */
  contact(s, content) {
    const d = s.data || {};
    const c = content.contact || {};
    /* Geschuetzte Leerzeichen, damit Rufnummern nie mitten drin umbrechen. */
    const nbsp = (nr) => esc(nr).replace(/ /g, "&nbsp;");

    const items = (d.links || [])
      .map((l) => {
        let inner;
        if (l.kind === "email") {
          inner = `<a href="mailto:${esc(c.email)}" id="contactEmail">${esc(c.email)}</a>`;
        } else if (l.kind === "phone" || l.kind === "landline") {
          const isMobile = l.kind === "phone";
          const num = isMobile ? c.phone : c.landline;
          const href = isMobile ? c.phoneHref : c.landlineHref;
          const id = isMobile ? "contactPhone" : "contactPhoneLandline";
          inner = join([
            '<span class="contact-text">',
            `  <span class="contact-label">${esc(l.label)}</span>`,
            `  <a href="tel:${esc(href)}" id="${id}">${nbsp(num)}</a>`,
            "</span>",
          ]);
        } else {
          const ext = l.external ? ' target="_blank" rel="noopener"' : "";
          inner = `<a href="${esc(l.href)}"${ext}>${esc(l.text)}</a>`;
        }
        return join([
          "<li>",
          '  <span class="contact-ic" aria-hidden="true">',
          "    " + icon(l.icon),
          "  </span>",
          indent(inner, 2),
          "</li>",
        ]);
      })
      .join("\n");

    const f = d.form || {};
    const options = (f.reasons || [])
      .map((r) => `        <option value="${esc(r)}">${esc(r)}</option>`)
      .join("\n");

    const captcha = content.services?.hcaptchaSiteKey
      ? join([
          '<div class="field captcha-field">',
          `  <div class="h-captcha" data-sitekey="${esc(content.services.hcaptchaSiteKey)}"></div>`,
          "</div>",
        ])
      : "";

    const form = join([
      '<form id="contactForm" class="card form-card" novalidate>',
      "  <!-- Honeypot gegen Spam-Bots: fuer Menschen unsichtbar. -->",
      '  <input type="checkbox" name="botcheck" tabindex="-1" aria-hidden="true" style="display:none !important;" />',
      '  <div class="field">',
      `    <label for="c-name">${esc(f.nameLabel || "Name")}</label>`,
      '    <input type="text" id="c-name" name="name" autocomplete="name" required />',
      "  </div>",
      '  <div class="field">',
      `    <label for="c-email">${esc(f.emailLabel || "E-Mail")}</label>`,
      '    <input type="email" id="c-email" name="email" autocomplete="email" required />',
      "  </div>",
      '  <div class="field">',
      `    <label for="c-reason">${esc(f.reasonLabel || "Grund für die Kontaktaufnahme")}</label>`,
      '    <select id="c-reason" name="reason" required>',
      `      <option value="" disabled selected>${esc(f.reasonPlaceholder || "Bitte auswählen …")}</option>`,
      options,
      "    </select>",
      "  </div>",
      '  <div class="field">',
      `    <label for="c-message">${esc(f.messageLabel || "Nachricht")}</label>`,
      '    <textarea id="c-message" name="message" rows="4" required></textarea>',
      "  </div>",
      '  <label class="consent">',
      '    <input type="checkbox" name="consent" required />',
      `    <span>${rich(f.consent || "")}</span>`,
      "  </label>",
      captcha ? indent(captcha, 2) : "",
      `  <button type="submit" class="btn btn-wave btn-block">${esc(f.submit || "Nachricht senden")}</button>`,
      '  <p class="form-hint" id="contactHint" role="status"></p>',
      "</form>",
    ]);

    return join([
      '<div class="container">',
      `  <div class="section-head">\n${indent(renderHead({ kicker: d.kicker }), 4)}\n  </div>`,
      "</div>",
      '<div class="container two-col two-col-wide">',
      '  <div class="two-col-text">',
      d.heading ? `    <h2>${rich(d.heading)}</h2>` : "",
      d.intro ? `    <p>${rich(d.intro)}</p>` : "",
      "",
      `    <ul class="contact-list">\n${indent(items, 6)}\n    </ul>`,
      "  </div>",
      `  <div class="two-col-media">\n${indent(form, 4)}\n  </div>`,
      "</div>",
    ]);
  },
};

/** Eine Sektion inklusive <section>-Rahmen rendern. */
function renderSection(s, content, isAlt) {
  const fn = SECTIONS[s.type];
  if (!fn) return "";
  if (s.type === "hero") return fn(s, content); // Hero bringt seinen Rahmen selbst mit

  const cls = ["section"];
  if (isAlt) cls.push("section-alt");
  const glows = renderGlows(s.glows);

  return join([
    `<section id="${esc(s.id)}" class="${cls.join(" ")}">`,
    glows ? indent(glows, 2) : "",
    indent(fn(s, content), 2),
    "</section>",
  ]);
}

/* ---------- Kopfbereich ---------- */

function renderJsonLd(content) {
  const b = content.business || {};
  const site = content.site || {};
  const c = content.contact || {};
  const base = site.baseUrl || "https://shineonyou.de/";
  const url = base.endsWith("/") ? base : base + "/";
  /* Stabiler Anker fuer die Person – bleibt bestehen, damit Suchmaschinen
     die einmal erfasste Entitaet weiterhin wiedererkennen. */
  const personId = `${url}#${b.person?.id || "person"}`;

  const graph = [
    {
      "@type": "ProfessionalService",
      "@id": `${url}#business`,
      name: b.name,
      description: b.description,
      url,
      image: abs(url, site.ogImage),
      logo: abs(url, b.logo),
      email: c.email,
      telephone: [c.phoneHref, c.landlineHref].filter(Boolean),
      slogan: site.tagline,
      priceRange: b.priceRange || "€€",
      knowsLanguage: site.lang || "de",
      address: {
        "@type": "PostalAddress",
        addressLocality: b.address?.locality,
        postalCode: b.address?.postalCode,
        addressRegion: b.address?.region,
        addressCountry: b.address?.country,
      },
      areaServed: (b.areaServed || []).map((a) => ({ "@type": a.type, name: a.name })),
      founder: { "@id": personId },
      makesOffer: {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: b.offer?.name,
          description: b.offer?.description,
        },
      },
      sameAs: (b.sameAs || []).filter(Boolean),
    },
    {
      "@type": "Person",
      "@id": personId,
      name: b.person?.name,
      alternateName: b.person?.alternateName,
      jobTitle: b.person?.jobTitle,
      worksFor: { "@id": `${url}#business` },
      url,
    },
    {
      "@type": "WebSite",
      "@id": `${url}#website`,
      url,
      name: site.brandName,
      inLanguage: b.inLanguage || "de-DE",
      publisher: { "@id": `${url}#business` },
    },
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: b.webPageName || site.brandName,
      inLanguage: b.inLanguage || "de-DE",
      isPartOf: { "@id": `${url}#website` },
      author: { "@id": personId },
      reviewedBy: { "@id": personId },
    },
  ];

  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
  // </script> im Datenbestand koennte den Block sonst vorzeitig beenden.
  return json.replace(/<\//g, "<\\/");
}

function renderHeadTag(content) {
  const site = content.site || {};
  const base = site.baseUrl || "https://shineonyou.de/";
  const url = base.endsWith("/") ? base : base + "/";
  const ogImage = abs(url, site.ogImage);

  return join([
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${esc(site.title)}</title>`,
    `<meta name="description" content="${esc(site.description)}" />`,
    `<meta name="author" content="${esc(site.author)}" />`,
    '<meta name="robots" content="index, follow" />',
    `<meta name="theme-color" content="${esc(site.themeColor)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    "",
    "<!-- Theme frueh setzen (verhindert Aufblitzen des falschen Modus) -->",
    "<script>",
    "  (function () {",
    "    try {",
    '      var stored = localStorage.getItem("soy-theme");',
    '      var mode = stored === "light" || stored === "dark" ? stored : "system";',
    '      var prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;',
    '      var theme = mode === "system" ? (prefersLight ? "light" : "dark") : mode;',
    '      document.documentElement.setAttribute("data-theme", theme);',
    '      document.documentElement.setAttribute("data-theme-mode", mode);',
    "    } catch (e) {",
    '      document.documentElement.setAttribute("data-theme", "dark");',
    '      document.documentElement.setAttribute("data-theme-mode", "system");',
    "    }",
    "  })();",
    "</script>",
    "",
    "<!-- Open Graph -->",
    `<meta property="og:title" content="${esc(site.title)}" />`,
    `<meta property="og:description" content="${esc(site.ogDescription || site.description)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:site_name" content="${esc(site.brandName)}" />`,
    '<meta property="og:locale" content="de_DE" />',
    `<meta property="og:image" content="${esc(ogImage)}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${esc(site.ogImageAlt)}" />`,
    "",
    "<!-- Twitter Card -->",
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(site.title)}" />`,
    `<meta name="twitter:description" content="${esc(site.ogDescription || site.description)}" />`,
    `<meta name="twitter:image" content="${esc(ogImage)}" />`,
    "",
    '<link rel="icon" type="image/png" sizes="32x32" href="assets/img/favicon-32.png" />',
    '<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png" />',
    "",
    "<!-- Schriften frueh laden (weniger Layout-Spruenge) -->",
    '<link rel="preload" as="font" type="font/woff2" href="assets/fonts/montserrat-latin.woff2" crossorigin />',
    '<link rel="preload" as="font" type="font/woff2" href="assets/fonts/inter-latin.woff2" crossorigin />',
    "",
    "<!-- Strukturierte Daten fuer Suchmaschinen -->",
    '<script type="application/ld+json">',
    renderJsonLd(content),
    "</script>",
    "",
    "<!-- Fonts (lokal eingebunden, kein externer Aufruf) -->",
    '<link rel="stylesheet" href="css/fonts.css" />',
    '<link rel="stylesheet" href="css/styles.css" />',
  ]);
}

function renderHeader(content) {
  const h = content.header || {};
  const c = content.contact || {};
  const nav = navItems(content);
  const navLinks = nav.map((n) => `<a href="${esc(n.href)}">${esc(n.label)}</a>`);

  const channel = c.whatsappChannel
    ? join([
        `<a class="header-channel" href="${esc(c.whatsappChannel)}" target="_blank" rel="noopener"` +
          ` aria-label="${esc(h.channelLabel || "WhatsApp-Kanal folgen")}">`,
        "  " + icon("whatsapp"),
        "</a>",
      ])
    : "";

  const themeToggle = join([
    '<button type="button" class="header-channel theme-toggle" data-theme-toggle' +
      ' aria-label="Zu hellem Design wechseln" aria-pressed="false">',
    '  <svg class="icon-system" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/>' +
      '<path d="M8 21h8M12 17v4"/></svg>',
    '  <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
    '  <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"' +
      ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    "</button>",
  ]);

  return join([
    '<header class="site-header" id="top">',
    '  <div class="container header-inner">',
    `    <a href="#top" class="brand" aria-label="${esc(h.brandLabel || "Startseite")}">`,
    `      <img src="${esc(h.logo?.src)}" alt="${esc(h.logo?.alt)}" class="brand-logo"` +
      ` width="${esc(h.logo?.width)}" height="${esc(h.logo?.height)}" />`,
    "    </a>",
    "",
    '    <nav class="nav" aria-label="Hauptnavigation">',
    indent(navLinks.join("\n"), 6),
    "    </nav>",
    "",
    h.cta ? "    " + renderAction(h.cta, "nav-cta") : "",
    "",
    '    <button type="button" class="nav-toggle" aria-label="Menü öffnen" aria-expanded="false" aria-controls="mobileNav">',
    "      <span></span><span></span><span></span>",
    "    </button>",
    "",
    channel ? indent(channel, 4) : "",
    "",
    indent(themeToggle, 4),
    "  </div>",
    '  <nav class="mobile-nav" id="mobileNav" aria-label="Mobile Navigation">',
    indent(navLinks.join("\n"), 4),
    h.cta ? "    " + renderAction(h.cta) : "",
    "  </nav>",
    "</header>",
  ]);
}

function renderFooter(content) {
  const f = content.footer || {};
  const nav = navItems(content);

  return join([
    '<footer class="site-footer">',
    '  <div class="container footer-inner">',
    `    <p class="footer-tag">${esc(content.site?.tagline)}</p>`,
    f.partnerText
      ? join([
          '    <p class="footer-partner">',
          `      <span>${esc(f.partnerText)}</span>`,
          `      <img src="${esc(f.partnerLogo?.src)}" alt="${esc(f.partnerLogo?.alt)}" class="footer-prowin"` +
            ` width="${esc(f.partnerLogo?.width)}" height="${esc(f.partnerLogo?.height)}" loading="lazy" decoding="async" />`,
          "    </p>",
        ])
      : "",
    '    <nav class="footer-nav" aria-label="Footer-Navigation">',
    indent(nav.map((n) => `<a href="${esc(n.href)}">${esc(n.label)}</a>`).join("\n"), 6),
    "    </nav>",
    `    <p class="footer-legal">\n${indent(rich(f.legal), 6)}\n    </p>`,
    f.review ? `    <p class="footer-review">${rich(f.review)}</p>` : "",
    `    <p class="footer-fine">&copy; <span id="year"></span> ${rich(f.fine)}</p>`,
    "  </div>",
    "</footer>",
  ]);
}

/* ---------- Gesamtseite ---------- */

/** Erzeugt die vollstaendige index.html als String. */
export function renderPage(content) {
  const sections = visibleSections(content);
  let altIndex = 0;

  const body = sections
    .map((s) => {
      if (s.type === "hero") return renderSection(s, content, false);
      const isAlt = altIndex % 2 === 1;
      altIndex += 1;
      return renderSection(s, content, isAlt);
    })
    .filter(Boolean)
    .join("\n\n");

  return join(
    [
      "<!DOCTYPE html>",
      `<html lang="${esc(content.site?.lang || "de")}">`,
      "<head>",
      indent(renderHeadTag(content), 2),
      "</head>",
      "<body>",
      indent(renderHeader(content), 2),
      "",
      "  <main>",
      indent(body, 4),
      "  </main>",
      "",
      indent(renderFooter(content), 2),
      "",
      '  <script src="js/config.js"></script>',
      '  <script src="js/theme.js" defer></script>',
      '  <script src="js/script.js"></script>',
      "</body>",
      "</html>",
      "",
    ],
    "\n"
  );
}

/** Erzeugt js/config.js — die Laufzeit-Einstellungen fuer script.js. */
export function renderConfigJs(content) {
  const c = content.contact || {};
  const sv = content.services || {};
  const cfg = {
    businessName: content.site?.brandName,
    ownerName: content.site?.author,
    email: c.email,
    phone: c.phone,
    phoneHref: c.phoneHref,
    landline: c.landline,
    landlineHref: c.landlineHref,
    web3formsKey: sv.web3formsKey || "",
    calLink: sv.calLink || "",
    calOrigin: sv.calOrigin || "",
    calEmbedJs: sv.calEmbedJs || "",
  };
  return join([
    "/* Automatisch erzeugt aus content/site.json — nicht von Hand bearbeiten. */",
    `window.SOY_CONFIG = ${JSON.stringify(cfg, null, 2)};`,
    "",
  ]);
}
