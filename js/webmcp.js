/* ============================================================
   Shine On You — In-Page-Werkzeuge fuer KI-Agenten (WebMCP)
   ------------------------------------------------------------
   WebMCP ist ein W3C-Entwurf: die Seite meldet dem Browser-Agenten
   Werkzeuge an, ohne dass es dafuer einen Server braucht.
   (Chrome Origin-Trial, ChatGPT-Desktop-Browser.)

   Grundsatz hier: nur auskunftsgebende Werkzeuge plus eines, das das
   Kontaktformular vorbefuellt. Abgeschickt wird nichts — dafuer braucht
   es die Einwilligung und die hCaptcha-Pruefung eines Menschen.

   Alles laeuft in try/catch und hinter einer Funktionspruefung: wo der
   Browser WebMCP nicht kennt, passiert schlicht nichts.
   ============================================================ */

(function () {
  "use strict";

  var cfg = (window.SOY_CONFIG || {}).agent || {};
  var contact = window.SOY_CONFIG || {};

  /* Registrierung finden. document.modelContext ist der aktuelle Entwurf,
     navigator.modelContext die aeltere Schreibweise. */
  var host =
    (typeof document !== "undefined" && document.modelContext) ||
    (typeof navigator !== "undefined" && navigator.modelContext) ||
    null;
  if (!host) return;

  function text(value) {
    return { content: [{ type: "text", text: String(value) }] };
  }

  function json(value) {
    return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
  }

  var EMPTY_INPUT = { type: "object", properties: {}, additionalProperties: false };
  var READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

  var tools = [
    {
      name: "get_contact",
      description:
        "Kontaktdaten von " +
        (cfg.owner || "Shine On You") +
        " (proWIN-Beratung): E-Mail, Mobil, Festnetz, WhatsApp-Kanal, proWIN-Onlineshop und Ort.",
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
      execute: function () {
        return json({
          name: cfg.owner || contact.ownerName,
          jobTitle: cfg.jobTitle,
          business: contact.businessName,
          email: contact.email,
          mobile: contact.phone,
          landline: contact.landline,
          whatsappChannel: cfg.whatsappChannel,
          shop: cfg.shopUrl,
          prowinProfile: cfg.partnerUrl,
          location: cfg.locality,
          website: cfg.url,
          language: "de",
        });
      },
    },
    {
      name: "get_consulting_topics",
      description:
        "Die proWIN-Produktbereiche, zu denen hier beraten wird – jeweils mit kurzer Beschreibung.",
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
      execute: function () {
        return json({ summary: cfg.summary, topics: cfg.topics || [] });
      },
    },
    {
      name: "get_service_area",
      description: "Orte und Regionen, in denen die Beratung vor Ort stattfindet. Online geht überall.",
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
      execute: function () {
        return json({
          onSite: cfg.areaServed || [],
          base: cfg.locality,
          remote: "Beratung und proWINparty auch online per Video – ortsunabhängig.",
        });
      },
    },
    {
      name: "get_pricing",
      description:
        "Preisauskunft: Beratung und proWINparty sind kostenlos; Produktpreise setzt proWIN International fest.",
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
      execute: function () {
        return json({
          consulting: "kostenlos und unverbindlich (Telefon, Video oder vor Ort)",
          party: "proWINparty zuhause oder online – kostenlos und unverbindlich",
          products: "Preise laut proWIN-Onlineshop, EUR inkl. MwSt.",
          priceRange: cfg.priceRange,
          shop: cfg.shopUrl,
          details: cfg.url + "pricing.md",
          note: "Diese Seite legt keine Produktpreise fest und wickelt keine Zahlungen ab.",
        });
      },
    },
    {
      name: "get_booking_options",
      description:
        "Wie ein Beratungstermin oder eine proWINparty vereinbart wird, inklusive Buchungslink und Dauer.",
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
      execute: function () {
        return json({
          options: [
            { name: "Telefon- oder Videoberatung", duration: "ca. 30 Minuten", price: "kostenlos" },
            { name: "proWINparty (zuhause oder online)", duration: "ca. 60 Minuten", price: "kostenlos" },
          ],
          bookingUrl: cfg.bookingUrl,
          onPage: cfg.url + "#termin",
          note:
            "Der Kalender auf der Seite lädt erst nach einem Klick auf die Einwilligungs-Schaltfläche. " +
            "Alternativ per E-Mail oder Telefon anfragen.",
        });
      },
    },
    {
      name: "get_catalogs",
      description: "Liste der verfügbaren proWIN-Kataloge als PDF.",
      inputSchema: EMPTY_INPUT,
      annotations: READ_ONLY,
      execute: function () {
        return fetch("kataloge/manifest.json", { headers: { Accept: "application/json" } })
          .then(function (res) {
            if (!res.ok) throw new Error(String(res.status));
            return res.json();
          })
          .then(function (data) {
            var list = (data && data.kataloge) || [];
            return json({
              page: cfg.url + "katalog.html",
              catalogs: list.map(function (k) {
                return {
                  title: k.titel,
                  pages: k.seiten,
                  pdf: k.datei ? cfg.url + encodeURI(k.datei) : undefined,
                };
              }),
            });
          })
          .catch(function () {
            return text("Katalogliste nicht abrufbar. Die Übersicht steht auf " + cfg.url + "katalog.html.");
          });
      },
    },
    {
      name: "prefill_contact_form",
      description:
        "Füllt das Kontaktformular auf dieser Seite vor und springt dorthin. Schickt nichts ab – " +
        "Einwilligung und Captcha muss die Person selbst bestätigen.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name der anfragenden Person" },
          email: { type: "string", description: "E-Mail-Adresse für die Antwort" },
          reason: {
            type: "string",
            description: "Grund der Anfrage; muss einem der Einträge im Auswahlfeld entsprechen",
          },
          message: { type: "string", description: "Text der Nachricht" },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      execute: function (args) {
        var input = args || {};
        var filled = [];
        var skipped = [];

        function setValue(id, value) {
          var el = document.getElementById(id);
          if (!el || value === undefined || value === null || value === "") return;
          el.value = String(value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          filled.push(id);
        }

        setValue("c-name", input.name);
        setValue("c-email", input.email);
        setValue("c-message", input.message);

        if (input.reason) {
          var select = document.getElementById("c-reason");
          var match =
            select &&
            Array.prototype.slice.call(select.options).find(function (o) {
              return o.value && o.value.toLowerCase() === String(input.reason).toLowerCase();
            });
          if (match) {
            select.value = match.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
            filled.push("c-reason");
          } else {
            skipped.push("reason (kein passender Eintrag; erlaubt: " + reasonOptions().join(" | ") + ")");
          }
        }

        var section = document.getElementById("kontakt");
        if (section && section.scrollIntoView) section.scrollIntoView({ behavior: "smooth", block: "start" });

        return json({
          filled: filled,
          skipped: skipped,
          submitted: false,
          next: "Die Person muss die Datenschutz-Einwilligung setzen und das Formular selbst absenden.",
        });
      },
    },
  ];

  function reasonOptions() {
    var select = document.getElementById("c-reason");
    if (!select) return [];
    return Array.prototype.slice
      .call(select.options)
      .map(function (o) {
        return o.value;
      })
      .filter(Boolean);
  }

  /* Das Formular-Werkzeug hat nur Sinn, wenn das Formular auch da ist. */
  if (!document.getElementById("contactForm")) {
    tools = tools.filter(function (t) {
      return t.name !== "prefill_contact_form";
    });
  }

  try {
    if (typeof host.registerTool === "function") {
      tools.forEach(function (tool) {
        host.registerTool(tool);
      });
    } else if (typeof host.provideContext === "function") {
      /* Aeltere Fassung des Entwurfs: alle Werkzeuge in einem Aufruf. */
      host.provideContext({ tools: tools });
    }
  } catch (err) {
    /* Kein Grund, die Seite kaputt zu machen. */
    if (window.console && console.debug) console.debug("WebMCP nicht aktiv:", err);
  }
})();
