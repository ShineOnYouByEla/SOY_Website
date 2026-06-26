/* ============================================================
   Shine On You — Interaktion
   ------------------------------------------------------------
   HIER ANPASSEN: deine Kontaktdaten & Dienste
   ============================================================ */
const CONFIG = {
  businessName: "Shine On You",
  email: "christoph@zeitler.tech",   // <- deine Kontakt-/Empfangsadresse
  phone: "+49 (0) 000 000 000",      // <- deine Telefonnummer (Anzeige)
  phoneHref: "+490000000000",        // <- Telefonnummer für tel:-Link (ohne Leerzeichen)
  instagram: "https://instagram.com/", // <- Instagram-Profil

  /* --- Formularversand (ohne dass sich das Mailprogramm öffnet) ---
     Formspree: Konto auf https://formspree.io anlegen, Formular erstellen,
     dann die ID aus der URL  https://formspree.io/f/XXXXXXXX  hier eintragen.
     Leer lassen = Fallback: öffnet vorausgefüllte E-Mail im Mailprogramm. */
  formspreeId: "",                   // z. B. "xpzgkqyw"

  /* --- Online-Terminbuchung (Cal.com) ---
     Konto auf https://cal.com anlegen, Apple Kalender verbinden, Event-Typ
     erstellen, dann den Link "benutzername/event" hier eintragen.
     Leer lassen = Fallback: das .ics-Buchungsformular bleibt aktiv. */
  calLink: "",                       // z. B. "shineonyou/beratung"
  calOrigin: "https://cal.com",      // bei self-hosted Cal anpassen
};

/* Kontaktdaten in die Seite schreiben (zentral pflegbar) */
(function applyConfig() {
  const email = document.getElementById("contactEmail");
  if (email) { email.textContent = CONFIG.email; email.href = "mailto:" + CONFIG.email; }
  const phone = document.getElementById("contactPhone");
  if (phone) { phone.textContent = CONFIG.phone; phone.href = "tel:" + CONFIG.phoneHref; }
})();

/* Jahr im Footer */
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ===== Mobile-Navigation ===== */
const toggle = document.querySelector(".nav-toggle");
const mobileNav = document.getElementById("mobileNav");
if (toggle && mobileNav) {
  toggle.addEventListener("click", () => {
    const open = mobileNav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
  });
  mobileNav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      mobileNav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );
}

/* ===== Helfer ===== */
function pad(n) { return String(n).padStart(2, "0"); }

/* Lokale Zeit als "floating" iCal-Stempel (wird im Kalender als Ortszeit gelesen) */
function icsStamp(date) {
  return (
    date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
    "T" + pad(date.getHours()) + pad(date.getMinutes()) + "00"
  );
}

function downloadICS(filename, content) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Versand über Formspree (Promise: true = erfolgreich) */
async function sendViaFormspree(fields) {
  const res = await fetch(`https://formspree.io/f/${CONFIG.formspreeId}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  });
  return res.ok;
}

/* mailto-Fallback öffnen */
function openMailto(subject, lines) {
  const body = lines.join("%0D%0A");
  window.location.href =
    `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${body}`;
}

/* Formular durch Erfolgsmeldung ersetzen */
function showSuccess(form, title, text) {
  const box = document.createElement("div");
  box.className = "card form-success";
  box.setAttribute("role", "status");
  box.innerHTML =
    '<div class="form-success-ic" aria-hidden="true">' +
    '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>' +
    "</div><h3></h3><p></p>";
  box.querySelector("h3").textContent = title;
  box.querySelector("p").textContent = text;
  form.replaceWith(box);
}

/* Minimum für Datumsfeld = heute */
const dateInput = document.getElementById("b-date");
if (dateInput) {
  const t = new Date();
  dateInput.min = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/* ===== Online-Terminbuchung (Cal.com) ===== */
function initCalEmbed() {
  const container = document.getElementById("calEmbed");
  const form = document.getElementById("bookingForm");
  if (!CONFIG.calLink || !container) return; // -> .ics-Formular bleibt aktiv

  // Offizielles Cal.com Embed-Snippet
  (function (C, A) {
    let d = C.document;
    C.Cal = C.Cal || function () {
      let cal = C.Cal, ar = arguments;
      if (!cal.loaded) {
        cal.ns = {}; cal.q = cal.q || [];
        d.head.appendChild(d.createElement("script")).src = A;
        cal.loaded = true;
      }
      if (ar[0] === "init") {
        const api = function () { api.q.push(arguments); };
        const ns = ar[1];
        if (typeof ns === "string") { cal.ns[ns] = cal.ns[ns] || api; api.q = api.q || []; cal.ns[ns].q = cal.ns[ns].q || []; cal.ns[ns].q.push(ar); cal.q.push(["initNamespace", ns]); }
        else { cal.q.push(ar); }
        return;
      }
      cal.q.push(ar);
    };
  })(window, "https://app.cal.com/embed/embed.js");

  Cal("init", { origin: CONFIG.calOrigin });
  Cal("inline", { elementOrSelector: "#calEmbed", calLink: CONFIG.calLink, layout: "month_view" });
  Cal("ui", {
    hideEventTypeDetails: false,
    layout: "month_view",
    cssVarsPerTheme: { dark: { "cal-brand": "#e9b690" } },
  });

  container.hidden = false;
  if (form) form.hidden = true;
}
initCalEmbed();

/* ===== Terminbuchung (.ics-Fallback) ===== */
const bookingForm = document.getElementById("bookingForm");
const bookingHint = document.getElementById("bookingHint");

if (bookingForm) {
  bookingForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!bookingForm.reportValidity()) return;

    const data = Object.fromEntries(new FormData(bookingForm).entries());
    const [hh, mm] = data.time.split(":").map(Number);
    const start = new Date(data.date + "T00:00:00");
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const summary = `Beratungstermin – ${CONFIG.businessName}`;
    const desc =
      `Terminart: ${data.mode}\\nName: ${data.name}\\nE-Mail: ${data.email}` +
      (data.note ? `\\nThema: ${data.note}` : "");

    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Shine On You//Termin//DE",
      "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
      `UID:soy-${start.getTime()}@shineonyou`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`,
      `SUMMARY:${summary}`, `DESCRIPTION:${desc}`,
      `ORGANIZER;CN=${CONFIG.businessName}:mailto:${CONFIG.email}`,
      `ATTENDEE;CN=${data.name};RSVP=TRUE:mailto:${data.email}`,
      "BEGIN:VALARM", "TRIGGER:-PT1H", "ACTION:DISPLAY", "DESCRIPTION:Erinnerung",
      "END:VALARM", "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");

    downloadICS(`Termin-${data.date}-${data.time.replace(":", "")}.ics`, ics);

    // Anfrage an die Inhaber:in: bevorzugt per Formspree, sonst mailto
    if (CONFIG.formspreeId) {
      const btn = bookingForm.querySelector("button[type=submit]");
      bookingForm.classList.add("is-loading");
      bookingHint.classList.remove("error");
      bookingHint.textContent = "Kalenderdatei heruntergeladen – Anfrage wird gesendet …";
      try {
        const ok = await sendViaFormspree({
          _subject: `Terminanfrage ${data.date} ${data.time} – ${data.name}`,
          Anliegen: "Terminanfrage",
          Datum: data.date, Uhrzeit: data.time, Art: data.mode,
          Name: data.name, email: data.email, Thema: data.note || "—",
        });
        bookingForm.classList.remove("is-loading");
        if (ok) {
          showSuccess(
            bookingForm,
            "Termin angefragt!",
            "Deine Anfrage ist eingegangen und die Kalenderdatei wurde heruntergeladen. Ich melde mich zur Bestätigung."
          );
        } else { throw new Error("Formspree"); }
      } catch (_) {
        bookingForm.classList.remove("is-loading");
        bookingHint.classList.add("error");
        bookingHint.textContent = "Senden fehlgeschlagen – bitte per E-Mail oder Telefon melden.";
      }
      return;
    }

    // Fallback ohne Formspree: vorausgefüllte E-Mail
    bookingHint.classList.remove("error");
    bookingHint.textContent =
      "✓ Kalenderdatei heruntergeladen. Dein E-Mail-Programm öffnet sich für die Anfrage …";
    setTimeout(() => {
      openMailto(`Terminanfrage ${data.date} ${data.time} – ${data.name}`, [
        `Hallo ${CONFIG.businessName}-Team,`, "",
        "ich möchte einen Beratungstermin vereinbaren:", "",
        `Datum: ${data.date}`, `Uhrzeit: ${data.time}`, `Art: ${data.mode}`,
        `Name: ${data.name}`, `E-Mail: ${data.email}`,
        ...(data.note ? [`Thema: ${data.note}`] : []),
        "", "Viele Grüße",
      ]);
    }, 600);
  });
}

/* ===== Kontaktformular ===== */
const contactForm = document.getElementById("contactForm");
const contactHint = document.getElementById("contactHint");

if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!contactForm.reportValidity()) return;

    const data = Object.fromEntries(new FormData(contactForm).entries());

    if (CONFIG.formspreeId) {
      contactForm.classList.add("is-loading");
      contactHint.classList.remove("error");
      contactHint.textContent = "Nachricht wird gesendet …";
      try {
        const ok = await sendViaFormspree({
          _subject: `Kontaktanfrage von ${data.name}`,
          Name: data.name, email: data.email, Nachricht: data.message,
        });
        contactForm.classList.remove("is-loading");
        if (ok) {
          showSuccess(
            contactForm,
            "Nachricht gesendet!",
            "Danke für deine Nachricht – ich melde mich so schnell wie möglich bei dir."
          );
        } else { throw new Error("Formspree"); }
      } catch (_) {
        contactForm.classList.remove("is-loading");
        contactHint.classList.add("error");
        contactHint.textContent = "Senden fehlgeschlagen – bitte per E-Mail oder Telefon melden.";
      }
      return;
    }

    // Fallback ohne Formspree: vorausgefüllte E-Mail
    contactHint.classList.remove("error");
    contactHint.textContent = "Dein E-Mail-Programm öffnet sich – bitte die Nachricht noch absenden.";
    openMailto(`Kontaktanfrage von ${data.name}`, [
      `Name: ${data.name}`, `E-Mail: ${data.email}`, "", data.message,
    ]);
  });
}

/* ===== Impressum / Datenschutz Platzhalter ===== */
["impressumLink", "datenschutzLink"].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      alert(
        "Hinweis: Impressum und Datenschutzerklärung müssen noch ergänzt werden.\n" +
        "Für eine geschäftliche Website in Deutschland sind beide gesetzlich verpflichtend."
      );
    });
  }
});
