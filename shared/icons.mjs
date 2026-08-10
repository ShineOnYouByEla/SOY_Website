/* ============================================================
   Shine On You — Icon-Bibliothek
   ------------------------------------------------------------
   Alle Inline-SVGs der Seite an einer Stelle. Im Admin wird pro
   Karte/Schritt nur noch der Icon-Name gewaehlt, gerendert wird
   hier. Reines JS ohne Node-APIs -> laeuft auch im Worker.
   ============================================================ */

/* vb = viewBox, sw = stroke-width, fill = true -> Flaechen-Icon */
export const ICONS = {
  /* --- Produktwelten & Karten (48er Raster) --- */
  spray: {
    vb: "0 0 48 48",
    label: "Sprühflasche",
    body: '<path d="M18 8h12v6H18z"/><path d="M16 14h16l2 26H14z"/><path d="M20 22h8"/>',
  },
  drop: {
    vb: "0 0 48 48",
    label: "Tropfen",
    body: '<path d="M24 6c5 6 8 11 8 16a8 8 0 0 1-16 0c0-5 3-10 8-16z"/><path d="M20 30c0 4 2 7 4 9 2-2 4-5 4-9"/>',
  },
  wellness: {
    vb: "0 0 48 48",
    label: "Wellness",
    body: '<circle cx="24" cy="20" r="8"/><path d="M24 4v3M24 33v3M8 20h3M37 20h3M13 9l2 2M33 9l-2 2"/><path d="M16 40h16"/>',
  },
  wind: {
    vb: "0 0 48 48",
    label: "Luft & Duft",
    body: '<path d="M19.18 9.18A4 4 0 1 1 22 16H4"/><path d="M25.18 38.82A4 4 0 1 0 28 32H4"/><path d="M35.46 15.46A5 5 0 1 1 39 24H4"/>',
  },
  paws: {
    vb: "0 0 48 48",
    label: "Pfoten",
    body: '<circle cx="17" cy="16" r="3"/><circle cx="31" cy="16" r="3"/><circle cx="12" cy="26" r="3"/><circle cx="36" cy="26" r="3"/><path d="M24 24c-5 0-9 4-9 8a5 5 0 0 0 5 5c2 0 3-1 4-1s2 1 4 1a5 5 0 0 0 5-5c0-4-4-8-9-8z"/>',
  },
  star: {
    vb: "0 0 48 48",
    label: "Stern",
    body: '<path d="M24 8l4 8 9 1-6.5 6 1.5 9-8-4.5-8 4.5 1.5-9L11 17l9-1z"/>',
  },
  clock: {
    vb: "0 0 48 48",
    label: "Uhr",
    body: '<circle cx="24" cy="24" r="16"/><path d="M24 14v10l7 4"/>',
  },
  "person-plus": {
    vb: "0 0 48 48",
    label: "Person mit Plus",
    body: '<circle cx="19" cy="17" r="6"/><path d="M8 39c0-6 5-11 11-11s11 5 11 11"/><path d="M33 16h8M37 12v8"/>',
  },
  heart: {
    vb: "0 0 48 48",
    label: "Herz",
    body: '<path d="M24 38S9 29 9 19a8 8 0 0 1 15-3 8 8 0 0 1 15 3c0 10-15 19-15 19z"/>',
  },

  /* --- Ablauf: Kopf-Badges --- */
  home: {
    vb: "0 0 48 48",
    label: "Haus",
    body: '<path d="M8 22 24 8l16 14"/><path d="M12 20v18h24V20"/><path d="M20 38V28h8v10"/>',
  },
  monitor: {
    vb: "0 0 48 48",
    label: "Bildschirm",
    body: '<rect x="6" y="10" width="36" height="24" rx="2"/><path d="M16 40h16"/><path d="M21 18l8 4-8 4z"/>',
  },

  /* --- Ablauf: Schritte --- */
  calendar: {
    vb: "0 0 48 48",
    label: "Kalender",
    body: '<rect x="8" y="10" width="32" height="30" rx="3"/><path d="M8 18h32"/><path d="M16 6v8M32 6v8"/><path d="M16 26h6v6h-6z"/>',
  },
  people: {
    vb: "0 0 48 48",
    label: "Gäste",
    body: '<circle cx="18" cy="17" r="5"/><circle cx="32" cy="19" r="4"/><path d="M9 38c0-5 4-9 9-9s9 4 9 9"/><path d="M28 30c3 0 7 3 7 8"/>',
  },
  products: {
    vb: "0 0 48 48",
    label: "Produkte",
    body: '<path d="M20 8h8v6l4 6v18a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V20l4-6z"/><path d="M16 26h16"/><path d="M37 12l1.5 3 3 1.5-3 1.5L37 22l-1.5-3-3-1.5 3-1.5z"/>',
  },
  gift: {
    vb: "0 0 48 48",
    label: "Geschenk",
    body: '<rect x="9" y="19" width="30" height="20" rx="2"/><path d="M9 25h30"/><path d="M24 19v20"/><path d="M24 19c-2-6-11-6-11-1 0 3 7 1 11 1zM24 19c2-6 11-6 11-1 0 3-7 1-11 1z"/>',
  },
  devices: {
    vb: "0 0 48 48",
    label: "Geräte",
    body: '<rect x="6" y="12" width="26" height="18" rx="2"/><path d="M11 36h16"/><rect x="34" y="20" width="9" height="18" rx="2"/>',
  },
  "play-screen": {
    vb: "0 0 48 48",
    label: "Video abspielen",
    body: '<rect x="8" y="12" width="32" height="22" rx="3"/><path d="M21 19l8 4-8 4z"/><path d="M18 40h12"/>',
  },
  chat: {
    vb: "0 0 48 48",
    label: "Austausch",
    body: '<path d="M10 12h20a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H19l-6 5v-5h-3a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z"/><path d="M14 18h12M14 22h8"/>',
  },
  "gift-big": {
    vb: "0 0 48 48",
    label: "Prämien",
    body: '<rect x="7" y="18" width="34" height="22" rx="2"/><path d="M5 12h38v6H5z"/><path d="M24 12v28"/><path d="M24 12c-2-6-11-6-11-1 0 3 7 1 11 1zM24 12c2-6 11-6 11-1 0 3-7 1-11 1z"/>',
  },

  /* --- Kontaktwege (24er Raster) --- */
  mail: {
    vb: "0 0 24 24",
    label: "E-Mail",
    body: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  },
  mobile: {
    vb: "0 0 24 24",
    label: "Mobiltelefon",
    body: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  },
  phone: {
    vb: "0 0 24 24",
    label: "Telefon",
    body: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  },
  link: {
    vb: "0 0 24 24",
    label: "Link",
    body: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  },
  whatsapp: {
    vb: "0 0 24 24",
    label: "WhatsApp",
    fill: true,
    body: '<path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.97L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.13c-1.52 0-3-.41-4.3-1.18l-.31-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.35c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.16 8.16 0 0 1 2.41 5.82c0 4.54-3.69 8.24-8.23 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43-.14-.01-.31-.01-.48-.01-.16 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/>',
  },
};

/* Fallback, damit ein Tippfehler im Admin nie die Seite zerschiesst. */
const FALLBACK = "star";

/**
 * Rendert ein Icon als <svg>-Element.
 * @param {string} name  Schluessel aus ICONS
 * @param {{size?: number, sw?: number}} [opts] size setzt width/height
 */
export function icon(name, opts = {}) {
  const def = ICONS[name] || ICONS[FALLBACK];
  const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : "";
  if (def.fill) {
    return `<svg${size} viewBox="${def.vb}" fill="currentColor" aria-hidden="true">${def.body}</svg>`;
  }
  const sw = opts.sw ?? 1.6;
  return (
    `<svg${size} viewBox="${def.vb}" fill="none" stroke="currentColor" stroke-width="${sw}"` +
    ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${def.body}</svg>`
  );
}

/** Namen + Beschriftung fuer die Icon-Auswahl im Admin. */
export function iconChoices() {
  return Object.entries(ICONS).map(([value, def]) => ({ value, label: def.label }));
}
