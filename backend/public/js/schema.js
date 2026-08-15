/* ============================================================
   Was im Admin bearbeitbar ist
   ------------------------------------------------------------
   Eine Beschreibung je Sektionstyp und je Einstellungsbereich.
   Neue Felder kommen hier dazu — die Oberflaeche baut sich
   daraus von selbst.
   ============================================================ */

const BUTTON_STYLES = [
  { value: "sun", label: "Gefüllt (Sonnengelb)" },
  { value: "ghost", label: "Umrandet" },
  { value: "wave", label: "Gefüllt (Petrol)" },
];

const MEDIA_POSITIONS = [
  { value: "", label: "Standard" },
  { value: "left", label: "Bild links" },
  { value: "right", label: "Bild rechts" },
];

/* Buttons tauchen an mehreren Stellen auf – einmal beschreiben reicht. */
const actionFields = [
  { k: "label", label: "Beschriftung", type: "text" },
  { k: "href", label: "Ziel", type: "text", note: "z. B. #termin für einen Sprung auf der Seite oder https://…" },
  { k: "style", label: "Aussehen", type: "select", options: BUTTON_STYLES },
  {
    k: "contactReason",
    label: "Kontaktgrund vorauswählen",
    type: "text",
    note: "Optional. Muss genau einem Eintrag der Auswahlliste im Kontaktformular entsprechen.",
  },
  { k: "external", label: "In neuem Tab öffnen", type: "checkbox", note: "Für Links auf fremde Seiten." },
];

/* ---------- Sektionstypen ---------- */

export const SECTION_SCHEMA = {
  hero: {
    title: "Startbereich",
    description: "Der erste Eindruck – große Überschrift, kurzer Text, zwei Buttons.",
    fields: [
      { k: "partnerText", label: "Zeile über der Überschrift", type: "text" },
      { k: "headline", label: "Überschrift", type: "lines", rows: 3, note: "Eine Zeile je Feld. Ab der zweiten Zeile wird in Sonnengelb hervorgehoben." },
      { k: "lead", label: "Einleitungstext", type: "rich", rows: 5 },
      {
        k: "partnerHref",
        label: "Ziel des Partner-Logos",
        type: "text",
        note: "Optional. Leer lassen, wenn das Logo nicht verlinkt sein soll.",
      },
      { k: "partnerLogo", label: "Partner-Logo", type: "image" },
      {
        k: "actions",
        label: "Buttons",
        type: "list",
        singular: "Button",
        itemLabel: (a) => a.label || "Button",
        newItem: () => ({ label: "", href: "#termin", style: "sun" }),
        item: actionFields,
      },
    ],
  },

  about: {
    title: "Text mit Bild",
    description: "Zwei Spalten: ein Bild und daneben Fließtext mit Häkchenliste.",
    fields: [
      { k: "kicker", label: "Kleine Überzeile", type: "text" },
      { k: "heading", label: "Überschrift", type: "text" },
      { k: "mediaPosition", label: "Bildposition", type: "select", options: MEDIA_POSITIONS },
      { k: "image", label: "Bild", type: "image" },
      {
        k: "paragraphs",
        label: "Absätze",
        type: "list",
        singular: "Absatz",
        itemLabel: (p, i) => `Absatz ${i + 1}`,
        newItem: () => ({ text: "" }),
        item: [{ k: "text", label: "Text", type: "rich", rows: 5 }],
      },
      { k: "checklist", label: "Häkchenliste", type: "lines", rows: 5 },
    ],
    /* Die Absätze liegen im JSON als reine Strings – hier umgewandelt. */
    toForm: (d) => ({ ...d, paragraphs: (d.paragraphs || []).map((text) => ({ text })) }),
    fromForm: (d) => ({ ...d, paragraphs: (d.paragraphs || []).map((p) => p.text).filter((t) => t && t.trim()) }),
  },

  cards: {
    title: "Kartenraster",
    description: "Gleichförmige Karten mit Symbol, Titel und kurzem Text.",
    fields: [
      { k: "kicker", label: "Kleine Überzeile", type: "text" },
      { k: "heading", label: "Überschrift", type: "text" },
      { k: "sub", label: "Text unter der Überschrift", type: "rich", rows: 3 },
      {
        k: "columns",
        label: "Spalten (ab Tablet-Breite)",
        type: "select",
        options: [
          { value: "", label: "Standard (3)" },
          { value: "2", label: "2 Spalten" },
          { value: "3", label: "3 Spalten" },
          { value: "4", label: "4 Spalten" },
        ],
      },
      {
        k: "cards",
        label: "Karten",
        type: "list",
        singular: "Karte",
        itemLabel: (c) => c.title || "Karte",
        newItem: () => ({ icon: "star", title: "", text: "" }),
        item: [
          { k: "icon", label: "Symbol", type: "icon" },
          { k: "title", label: "Titel", type: "text" },
          { k: "text", label: "Text", type: "rich", rows: 3 },
        ],
      },
      {
        k: "actions",
        label: "Buttons unter den Karten",
        type: "list",
        singular: "Button",
        note: "Leer lassen, wenn kein Button gewünscht ist. Mehrere stehen nebeneinander.",
        itemLabel: (a) => a.label || "Button",
        newItem: () => ({ label: "", href: "#kontakt", style: "sun" }),
        item: actionFields,
      },
      { k: "actionsNote", label: "Hinweis unter den Buttons", type: "text" },
    ],
    /* „cta“ ist die alte Schreibweise fuer einen einzelnen Button –
       sie wird in die Buttonliste uebernommen. */
    toForm: (d) => {
      const { note, ...legacy } = d.cta || {};
      return {
        ...d,
        cta: undefined,
        actions: (d.actions || []).length ? d.actions : d.cta ? [legacy] : [],
        actionsNote: d.actionsNote ?? note,
      };
    },
    fromForm: (d) => ({ ...d, cta: undefined }),
  },

  flow: {
    title: "Ablauf in Schritten",
    description: "Nummerierte Schrittketten und ein Prämien-Kasten.",
    fields: [
      { k: "kicker", label: "Kleine Überzeile", type: "text" },
      { k: "heading", label: "Überschrift", type: "text" },
      { k: "sub", label: "Text unter der Überschrift", type: "rich", rows: 4 },
      {
        k: "blocks",
        label: "Abläufe",
        type: "list",
        singular: "Ablauf",
        itemLabel: (b) => b.title || "Ablauf",
        newItem: () => ({ variant: "sun", icon: "home", title: "", text: "", steps: [] }),
        item: [
          { k: "title", label: "Titel", type: "text" },
          { k: "text", label: "Kurzbeschreibung", type: "text" },
          { k: "icon", label: "Symbol", type: "icon" },
          {
            k: "variant",
            label: "Farbe",
            type: "select",
            options: [
              { value: "sun", label: "Sonnengelb" },
              { value: "wave", label: "Türkis" },
            ],
          },
          {
            k: "steps",
            label: "Schritte",
            type: "list",
            singular: "Schritt",
            itemLabel: (s, i) => `${i + 1}. ${s.title || "Schritt"}`,
            newItem: () => ({ icon: "calendar", title: "", text: "" }),
            item: [
              { k: "icon", label: "Symbol", type: "icon" },
              { k: "title", label: "Titel", type: "text" },
              { k: "text", label: "Text", type: "text" },
            ],
          },
        ],
      },
      {
        k: "perks",
        label: "Prämien-Kasten",
        type: "list",
        singular: "Kasten",
        note: "Maximal einer.",
        itemLabel: (p) => p.title || "Prämien",
        newItem: () => ({ icon: "gift-big", title: "", text: "", items: [] }),
        item: [
          { k: "icon", label: "Symbol", type: "icon" },
          { k: "title", label: "Überschrift", type: "text" },
          { k: "text", label: "Kurzbeschreibung", type: "text" },
          {
            k: "items",
            label: "Möglichkeiten",
            type: "list",
            singular: "Möglichkeit",
            itemLabel: (i) => i.title || "Möglichkeit",
            newItem: () => ({ title: "", text: "" }),
            item: [
              { k: "title", label: "Titel", type: "text" },
              { k: "text", label: "Text", type: "rich", rows: 4 },
            ],
          },
          {
            k: "cta",
            label: "Button",
            type: "list",
            singular: "Button",
            itemLabel: (a) => a.label || "Button",
            newItem: () => ({ label: "", href: "#kontakt", style: "sun" }),
            item: actionFields,
          },
        ],
      },
    ],
    toForm: (d) => ({
      ...d,
      perks: d.perks ? [{ ...d.perks, cta: d.perks.cta ? [d.perks.cta] : [] }] : [],
    }),
    fromForm: (d) => {
      const p = d.perks?.[0];
      return { ...d, perks: p ? { ...p, cta: p.cta?.[0] || undefined } : undefined };
    },
  },

  channel: {
    title: "WhatsApp-Kanal",
    description: "Großer Hinweis-Kasten auf den Kanal – Symbol, Text, Vorteile und ein auffälliger Knopf.",
    fields: [
      { k: "kicker", label: "Kleine Überzeile", type: "text" },
      { k: "heading", label: "Überschrift", type: "text" },
      { k: "text", label: "Text", type: "rich", rows: 3 },
      { k: "points", label: "Vorteile", type: "lines", rows: 4, note: "Ein Vorteil je Zeile – kurz halten, sie stehen nebeneinander." },
      { k: "ctaLabel", label: "Beschriftung des Knopfs", type: "text" },
      { k: "note", label: "Hinweis unter dem Knopf", type: "text" },
      {
        k: "qr",
        label: "QR-Code zum Scannen zeigen",
        type: "checkbox",
        note: "Wird aus der Kanal-Adresse erzeugt. Am Handy ausgeblendet – dort führt der Knopf direkt hin.",
      },
      { k: "qrLabel", label: "Text unter dem QR-Code", type: "text" },
      { k: "qrAlt", label: "Beschreibung des QR-Codes", type: "text", note: "Für Screenreader." },
      {
        k: "href",
        label: "Abweichendes Ziel",
        type: "text",
        note: "Leer lassen – dann wird der Kanal aus den Kontaktdaten verwendet.",
      },
    ],
  },

  booking: {
    title: "Terminbuchung",
    description: "Erklärtext, Leistungsübersicht und der Kalender von Cal.com.",
    fields: [
      { k: "kicker", label: "Kleine Überzeile", type: "text" },
      { k: "heading", label: "Überschrift", type: "text" },
      { k: "mediaPosition", label: "Kalenderposition", type: "select", options: MEDIA_POSITIONS },
      {
        k: "paragraphs",
        label: "Absätze",
        type: "list",
        singular: "Absatz",
        itemLabel: (p, i) => `Absatz ${i + 1}`,
        newItem: () => ({ text: "" }),
        item: [{ k: "text", label: "Text", type: "rich", rows: 4 }],
      },
      {
        k: "blocks",
        label: "Leistungen",
        type: "list",
        singular: "Leistung",
        itemLabel: (b) => b.title || "Leistung",
        newItem: () => ({ title: "", items: [] }),
        item: [
          { k: "title", label: "Titel", type: "text" },
          { k: "items", label: "Stichpunkte", type: "lines", rows: 4 },
        ],
      },
      { k: "consentButton", label: "Beschriftung des Kalender-Buttons", type: "text" },
      {
        k: "consentNote",
        label: "Datenschutzhinweis am Kalender",
        type: "rich",
        rows: 3,
        note: 'Zwei-Klick-Lösung: erst nach dem Klick verbindet sich die Seite mit Cal.com. Link-Schreibweise: <a href="datenschutz.html" external>Datenschutz</a>',
      },
    ],
    toForm: (d) => ({ ...d, paragraphs: (d.paragraphs || []).map((text) => ({ text })) }),
    fromForm: (d) => ({ ...d, paragraphs: (d.paragraphs || []).map((p) => p.text).filter((t) => t && t.trim()) }),
  },

  contact: {
    title: "Kontakt",
    description: "Kontaktwege und das Nachrichtenformular.",
    fields: [
      { k: "kicker", label: "Kleine Überzeile", type: "text" },
      { k: "heading", label: "Überschrift", type: "text" },
      { k: "intro", label: "Einleitungstext", type: "rich", rows: 3 },
      { k: "mediaPosition", label: "Formularposition", type: "select", options: MEDIA_POSITIONS },
      {
        k: "links",
        label: "Kontaktwege",
        type: "list",
        singular: "Kontaktweg",
        note: "E-Mail und Telefonnummern kommen aus den Kontaktdaten – hier wird nur festgelegt, ob und wie sie erscheinen.",
        itemLabel: (l) => l.text || { email: "E-Mail", phone: "Mobil", landline: "Festnetz" }[l.kind] || "Link",
        newItem: () => ({ kind: "url", icon: "link", text: "", href: "https://", external: true }),
        item: [
          {
            k: "kind",
            label: "Art",
            type: "select",
            options: [
              { value: "email", label: "E-Mail (aus den Kontaktdaten)" },
              { value: "phone", label: "Mobilnummer (aus den Kontaktdaten)" },
              { value: "landline", label: "Festnetz (aus den Kontaktdaten)" },
              { value: "url", label: "Freier Link" },
            ],
          },
          { k: "icon", label: "Symbol", type: "icon" },
          { k: "label", label: "Beschriftung", type: "text", note: "Nur bei Telefonnummern, z. B. „Mobil“." },
          { k: "text", label: "Anzeigetext", type: "text", note: "Nur bei freien Links." },
          { k: "href", label: "Ziel", type: "text", note: "Nur bei freien Links." },
          { k: "external", label: "In neuem Tab öffnen", type: "checkbox" },
        ],
      },
      {
        k: "form",
        label: "Formular",
        type: "list",
        singular: "Formular",
        itemLabel: () => "Beschriftungen und Auswahlliste",
        newItem: () => ({}),
        item: [
          { k: "nameLabel", label: "Beschriftung „Name“", type: "text" },
          { k: "emailLabel", label: "Beschriftung „E-Mail“", type: "text" },
          { k: "reasonLabel", label: "Beschriftung „Grund“", type: "text" },
          { k: "reasonPlaceholder", label: "Platzhalter der Auswahlliste", type: "text" },
          { k: "messageLabel", label: "Beschriftung „Nachricht“", type: "text" },
          { k: "submit", label: "Beschriftung des Absende-Buttons", type: "text" },
          {
            k: "reasons",
            label: "Auswahlmöglichkeiten „Grund für die Kontaktaufnahme“",
            type: "lines",
            rows: 5,
            note: "Ein Grund je Zeile. Buttons mit Vorauswahl müssen exakt einen dieser Texte verwenden.",
          },
          { k: "consent", label: "Text der Einwilligung", type: "rich", rows: 3 },
        ],
      },
    ],
    toForm: (d) => ({ ...d, form: d.form ? [d.form] : [{}] }),
    fromForm: (d) => ({ ...d, form: d.form?.[0] || {} }),
  },
};

/* ---------- Allgemeine Einstellungen ---------- */

export const SETTINGS_PANELS = [
  {
    id: "seo",
    title: "Titel & Suchmaschinen",
    path: "site",
    description: "Was in der Browserleiste, bei Google und beim Teilen erscheint.",
    fields: [
      { k: "title", label: "Seitentitel", type: "text", note: "Höchstens 70 Zeichen – länger kürzt Google ab." },
      { k: "description", label: "Beschreibung für Suchmaschinen", type: "longtext", rows: 3, note: "Etwa 150 Zeichen." },
      { k: "ogDescription", label: "Beschreibung beim Teilen", type: "longtext", rows: 3, note: "Erscheint in WhatsApp, Facebook & Co. Leer = wie oben." },
      { k: "brandName", label: "Markenname", type: "text" },
      { k: "tagline", label: "Claim", type: "text", note: "Steht auch im Footer." },
      { k: "author", label: "Name der Inhaberin", type: "text" },
      { k: "themeColor", label: "Browserfarbe", type: "text", note: "Hex-Farbe, z. B. #041f24." },
      { k: "ogImageAlt", label: "Alternativtext des Teilen-Bilds", type: "text" },
    ],
  },
  {
    id: "kontakt",
    title: "Kontaktdaten",
    path: "contact",
    description: "Werden überall auf der Seite eingesetzt – Kontaktblock, Footer und strukturierte Daten.",
    fields: [
      { k: "email", label: "E-Mail-Adresse", type: "text" },
      { k: "phone", label: "Mobilnummer (Anzeige)", type: "text", note: "So wie sie auf der Seite steht, z. B. +49 1551 0279357." },
      { k: "phoneHref", label: "Mobilnummer (Anruf-Link)", type: "text", note: "Ohne Leerzeichen, z. B. +4915510279357." },
      { k: "landline", label: "Festnetz (Anzeige)", type: "text" },
      { k: "landlineHref", label: "Festnetz (Anruf-Link)", type: "text" },
      { k: "whatsappChannel", label: "WhatsApp-Kanal", type: "text", note: "Leer lassen, um das Symbol im Kopf auszublenden." },
    ],
  },
  {
    id: "dienste",
    title: "Dienste",
    path: "services",
    description: "Schlüssel für Formularversand, Spamschutz und Online-Terminbuchung.",
    fields: [
      { k: "web3formsKey", label: "Web3Forms Access Key", type: "text", note: "Leer = das Kontaktformular öffnet stattdessen das E-Mail-Programm." },
      { k: "hcaptchaSiteKey", label: "hCaptcha Site Key", type: "text", note: "Spamschutz, von Web3Forms verlangt." },
      { k: "calLink", label: "Cal.com-Link", type: "text", note: "z. B. benutzername/beratung. Leer = kein Kalender auf der Seite." },
      { k: "calOrigin", label: "Cal.com-Region", type: "text", note: "https://cal.eu für die EU-Region." },
      { k: "calEmbedJs", label: "Cal.com Embed-Skript", type: "text" },
    ],
  },
  {
    id: "kopf",
    title: "Kopfbereich",
    path: "header",
    description: "Logo und Button oben auf der Seite. Die Navigation entsteht automatisch aus den sichtbaren Bereichen.",
    fields: [
      { k: "logo", label: "Logo", type: "image" },
      { k: "brandLabel", label: "Beschriftung des Logo-Links", type: "text", note: "Für Screenreader." },
      { k: "channelLabel", label: "Beschriftung des WhatsApp-Symbols", type: "text" },
      { k: "channelCta", label: "Beschriftung des Kanal-Knopfs im Menü", type: "text", note: "Steht im aufgeklappten Menü auf Handy und Tablet." },
      {
        k: "cta",
        label: "Button im Kopfbereich",
        type: "list",
        singular: "Button",
        itemLabel: (a) => a.label || "Button",
        newItem: () => ({ label: "", href: "#termin", style: "sun" }),
        item: actionFields,
      },
    ],
    toForm: (d) => ({ ...d, cta: d.cta ? [d.cta] : [] }),
    fromForm: (d) => ({ ...d, cta: d.cta?.[0] || undefined }),
  },
  {
    id: "fuss",
    title: "Fußbereich",
    path: "footer",
    description: "Der Bereich ganz unten mit Impressum und Datenschutz.",
    fields: [
      { k: "partnerText", label: "Text vor dem Partner-Logo", type: "text" },
      {
        k: "partnerHref",
        label: "Ziel des Partner-Logos",
        type: "text",
        note: "Optional. Leer lassen, wenn das Logo nicht verlinkt sein soll.",
      },
      { k: "partnerLogo", label: "Partner-Logo", type: "image" },
      { k: "legal", label: "Rechtszeile", type: "rich", rows: 3 },
      { k: "review", label: "Hinweis zur redaktionellen Prüfung", type: "rich", rows: 2 },
      { k: "fine", label: "Kleingedrucktes", type: "rich", rows: 3, note: "Die Jahreszahl setzt die Seite selbst davor." },
    ],
  },
  {
    id: "firma",
    title: "Angaben für Suchmaschinen",
    path: "business",
    description: "Strukturierte Daten – helfen Google, das Angebot und den Einzugsbereich zu verstehen.",
    fields: [
      { k: "name", label: "Name des Betriebs", type: "text" },
      { k: "description", label: "Beschreibung", type: "longtext", rows: 3 },
      { k: "priceRange", label: "Preisniveau", type: "text", note: "z. B. €€" },
      {
        k: "areaServed",
        label: "Einzugsbereich",
        type: "list",
        singular: "Ort",
        itemLabel: (a) => a.name || "Ort",
        newItem: () => ({ type: "City", name: "" }),
        item: [
          { k: "name", label: "Name", type: "text" },
          {
            k: "type",
            label: "Art",
            type: "select",
            options: [
              { value: "City", label: "Stadt/Gemeinde" },
              { value: "AdministrativeArea", label: "Region/Landkreis" },
            ],
          },
        ],
      },
      { k: "sameAs", label: "Weitere Profile", type: "lines", rows: 3, note: "Eine Adresse je Zeile." },
    ],
  },
];
