/* ============================================================
   Shine On You — Sprachfassungen
   ------------------------------------------------------------
   Deutsch ist die Hauptfassung unter /, Englisch liegt unter /en/
   mit denselben Dateinamen. So zeigt jeder relative Link in den
   Inhalten (etwa „datenschutz.html“ in der Einwilligung) von selbst
   auf die Seite in derselben Sprache.

   Die Uebersetzung steht in content/site.json unter
   translations.<sprache> und enthaelt nur Texte. Alles andere —
   Kontaktdaten, Bilder, Reihenfolge, Sichtbarkeit — kommt aus der
   deutschen Fassung. Fehlt ein Text in der Uebersetzung, bleibt der
   deutsche stehen: lieber ein deutscher Satz als ein leerer Knopf.

   Bewusst ohne Node-APIs: laeuft im Build-Script und im Worker.
   ============================================================ */

export const DEFAULT_LANG = "de";
export const LANGS = ["de", "en"];

/* Unterverzeichnis je Sprache, relativ zur Wurzel der Website. */
const DIR = { de: "", en: "en/" };

/* Nur in localStorage, und nur wenn jemand selbst umschaltet. Steht so in
   datenschutz.html und privacy.html — wer den Namen aendert, aendert dort mit. */
export const LANG_STORAGE_KEY = "soy-lang";

/** Verzeichnis einer Sprache („“ bzw. „en/“). */
export function langDir(lang) {
  return DIR[lang] ?? "";
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Uebersetzung ueber die Grundfassung legen.
 * Objekte werden feldweise gemischt, Sektionen ueber ihre Kennung (so
 * ueberlebt die Uebersetzung ein Umsortieren im Admin), alle anderen
 * Listen ueber die Position. Die Uebersetzung kann nichts hinzufuegen,
 * was es auf Deutsch nicht gibt — sonst haette eine Sprache Inhalte,
 * die im Admin nirgends auftauchen.
 */
export function overlay(base, tr) {
  if (tr === undefined || tr === null) return base;
  if (Array.isArray(base)) {
    if (!Array.isArray(tr)) return base;
    const byId = base.every((x) => isObj(x) && typeof x.id === "string");
    if (byId) {
      const map = new Map(tr.filter((x) => isObj(x) && x.id).map((x) => [x.id, x]));
      return base.map((x) => overlay(x, map.get(x.id)));
    }
    return base.map((x, i) => overlay(x, tr[i]));
  }
  if (isObj(base)) {
    if (!isObj(tr)) return base;
    const out = { ...base };
    for (const key of Object.keys(base)) {
      if (key in tr) out[key] = overlay(base[key], tr[key]);
    }
    return out;
  }
  /* Blatt: nur Gleichartiges ersetzt, ein leerer Text zaehlt als fehlend. */
  if (typeof tr !== typeof base) return base;
  if (typeof tr === "string" && !tr.trim()) return base;
  return tr;
}

/**
 * Die Inhalte fuer eine Sprache. Haengt unter `page` an, was die Renderer
 * ueber die Seite selbst wissen muessen: Sprache und den Weg zurueck zur
 * Wurzel fuer Bilder, Skripte und Stylesheets.
 */
export function localize(content, lang = DEFAULT_LANG) {
  const { translations, ...base } = content || {};
  const merged = lang === DEFAULT_LANG ? base : overlay(base, translations?.[lang]);
  const dir = langDir(lang);
  return {
    ...merged,
    site: { ...(merged.site || {}), lang },
    /* langs merkt sich, welche Fassungen es gibt — die Uebersetzungen
       selbst sind nach dem Mischen nicht mehr dabei. */
    page: { lang, root: dir ? "../" : "", langs: availableLangs(content) },
  };
}

/** Gibt es fuer diese Sprache eine Uebersetzung? */
export function hasTranslation(content, lang) {
  return lang === DEFAULT_LANG || isObj(content?.translations?.[lang]);
}

/** Sprachen, in denen die Seite ausgeliefert wird. */
export function availableLangs(content) {
  if (content?.page?.langs) return content.page.langs;
  return LANGS.filter((l) => hasTranslation(content, l));
}

/** Projektpfad (Bild, Skript, CSS) aus Sicht der aktuellen Seite. */
export function asset(content, path) {
  const p = String(path ?? "");
  if (!p || /^([a-z]+:|\/|#|\.\.\/)/i.test(p)) return p;
  return (content.page?.root || "") + p;
}

/* ---------- Feste Beschriftungen ----------
   Was nicht im Admin gepflegt wird, sondern im Renderer steht:
   Bedienelemente, Aria-Labels, Rueckfallwerte. */

const UI = {
  de: {
    home: "Startseite",
    toHome: "Zur Startseite",
    mainNav: "Hauptnavigation",
    mobileNav: "Mobile Navigation",
    footerNav: "Footer-Navigation",
    menuOpen: "Menü öffnen",
    themeToggle: "Zu hellem Design wechseln",
    channelFollow: "WhatsApp-Kanal folgen",
    channelSubscribe: "Kanal abonnieren",
    qrAlt: "QR-Code zum WhatsApp-Kanal",
    qrLabel: "Mit der Handykamera scannen",
    bookOnline: "Termin online buchen",
    bookingRegion: "Online-Terminbuchung",
    honeypot: "Bitte nicht ausfüllen",
    name: "Name",
    email: "E-Mail",
    reason: "Grund für die Kontaktaufnahme",
    reasonPlaceholder: "Bitte auswählen …",
    message: "Nachricht",
    submit: "Nachricht senden",
    chatOpen: "WhatsApp-Chat öffnen",
    chatStart: "Chat starten",
    closeHint: "Hinweis schließen",
    imprint: "Impressum",
    privacy: "Datenschutz",
    since: "Seit 2026.",
    /* Der Umschalter zeigt immer auf die andere Sprache. */
    switchLabel: "Deutsche Version",
  },
  en: {
    home: "Home",
    toHome: "Back to the home page",
    mainNav: "Main navigation",
    mobileNav: "Mobile navigation",
    footerNav: "Footer navigation",
    menuOpen: "Open menu",
    themeToggle: "Switch to light design",
    channelFollow: "Follow the WhatsApp channel",
    channelSubscribe: "Follow the channel",
    qrAlt: "QR code for the WhatsApp channel",
    qrLabel: "Scan with your phone camera",
    bookOnline: "Book online",
    bookingRegion: "Online booking",
    honeypot: "Please leave empty",
    name: "Name",
    email: "Email",
    reason: "Reason for getting in touch",
    reasonPlaceholder: "Please choose …",
    message: "Message",
    submit: "Send message",
    chatOpen: "Open WhatsApp chat",
    chatStart: "Start chat",
    closeHint: "Close notice",
    imprint: "Legal notice",
    privacy: "Privacy",
    since: "Since 2026.",
    switchLabel: "English version",
  },
};

/** Feste Beschriftung in der Sprache der Seite. */
export function t(content, key) {
  const lang = content?.page?.lang || DEFAULT_LANG;
  return UI[lang]?.[key] ?? UI[DEFAULT_LANG][key] ?? key;
}

/* Adresse derselben Seite in einer anderen Sprache, relativ zur aktuellen.
   Die Startseite ist das Verzeichnis selbst („en/“ bzw. „../“). */
function pageHref(content, lang, path) {
  if (lang === (content.page?.lang || DEFAULT_LANG)) return path || "./";
  return (content.page?.root || "") + langDir(lang) + (path || "") || "./";
}

/* Kurzbezeichnung auf dem Knopf. */
const SHORT = { de: "DE", en: "EN" };

/**
 * Link-Tags fuer Suchmaschinen: dieselbe Seite in allen Sprachen.
 * `path` ist der Dateiname ohne Sprachverzeichnis („“ fuer die Startseite).
 */
export function alternateLinks(content, path, langs = availableLangs(content)) {
  if (langs.length < 2) return [];
  const base = String(content.site?.baseUrl || "https://shineonyou.de/").replace(/\/*$/, "/");
  const href = (l) => base + langDir(l) + path;
  return [
    ...langs.map((l) => `<link rel="alternate" hreflang="${l}" href="${href(l)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${href(DEFAULT_LANG)}" />`,
  ];
}

/**
 * Knopf im Kopf, der dieselbe Seite in der anderen Sprache oeffnet.
 * data-lang merkt sich die Wahl (siehe langScript) — wer bewusst
 * umschaltet, wird danach nicht wieder zurueckgeleitet.
 */
export function langSwitch(content, path, langs = availableLangs(content)) {
  const here = content.page?.lang || DEFAULT_LANG;
  const other = langs.find((l) => l !== here);
  if (!other) return "";
  const target = pageHref(content, other, path);
  return (
    `<a class="header-channel lang-switch" href="${target}" hreflang="${other}" lang="${other}"` +
    ` data-lang="${other}" aria-label="${UI[other].switchLabel}" title="${UI[other].switchLabel}">${SHORT[other]}</a>`
  );
}

/* Seiten, die von Hand gepflegt werden, aber dasselbe Skript tragen.
   scripts/build-site.mjs haelt den Block darin aktuell. */
export const HAND_PAGES = ["impressum.html", "datenschutz.html"];

/**
 * Das Inline-Skript fuer den <head>: leitet beim Einstieg von aussen auf
 * die Sprache des Systems um und merkt sich eine bewusste Wahl. Innerhalb
 * der Seite wird nie umgeleitet — sonst kaeme man etwa ueber den Link auf
 * den verbindlichen deutschen Rechtstext nie dort an.
 *
 * GitHub Pages kann nicht serverseitig nach Accept-Language verzweigen,
 * darum passiert das hier — so frueh, dass nichts aufblitzt.
 *
 * Suchmaschinen, Lighthouse und automatisierte Browser bleiben, wo sie
 * sind: Googlebot meldet sich mit Englisch und wuerde sonst nur noch die
 * englische Fassung zu sehen bekommen. Fuer sie stehen die hreflang-Links da.
 */
export function langScript(content, path, langs = availableLangs(content)) {
  if (langs.length < 2) return "";
  const here = content.page?.lang || DEFAULT_LANG;
  const targets = Object.fromEntries(langs.map((l) => [l, pageHref(content, l, path)]));
  return [
    /* Die Kennung braucht die Admin-Vorschau, um das Skript zu entfernen. */
    '<script id="soy-lang-detect">',
    "  (function () {",
    `    var KEY = "${LANG_STORAGE_KEY}", HERE = "${here}", FALLBACK = "en";`,
    `    var TARGET = ${JSON.stringify(targets)};`,
    "    var has = function (k) { return Object.prototype.hasOwnProperty.call(TARGET, k); };",
    "    /* Bewusste Wahl ueber den Umschalter merken */",
    "    document.addEventListener(\"click\", function (e) {",
    "      var a = e.target && e.target.closest ? e.target.closest(\"a[data-lang]\") : null;",
    "      if (a) { try { localStorage.setItem(KEY, a.getAttribute(\"data-lang\")); } catch (err) {} }",
    "    });",
    "    try {",
    "      if (navigator.webdriver || /bot|crawl|spider|slurp|lighthouse|headless|preview/i.test(navigator.userAgent)) return;",
    "      /* Wer innerhalb der Seite einem Link folgt, hat die Sprache gewaehlt */",
    "      if (document.referrer.indexOf(location.origin + \"/\") === 0) return;",
    "      var want = localStorage.getItem(KEY);",
    "      if (!has(want)) {",
    "        /* Erste Sprache aus der Systemliste, die es hier gibt; sonst Englisch */",
    "        var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || \"\"];",
    "        want = FALLBACK;",
    "        for (var i = 0; i < list.length; i++) {",
    "          var l = String(list[i]).slice(0, 2).toLowerCase();",
    "          if (has(l)) { want = l; break; }",
    "        }",
    "      }",
    "      if (want !== HERE) location.replace(TARGET[want] + location.search + location.hash);",
    "    } catch (err) { /* Speicher gesperrt: auf der aufgerufenen Seite bleiben */ }",
    "  })();",
    "</script>",
  ].join("\n");
}
