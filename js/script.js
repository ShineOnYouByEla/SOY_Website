/* ============================================================
   Shine On You — Interaktion
   ------------------------------------------------------------
   HIER ANPASSEN: deine Kontaktdaten & Dienste
   ============================================================ */
const CONFIG = {
  businessName: "Shine On You",
  ownerName: "Manuela Zimmert",
  email: "manuela@shineonyou.de",    // Kontakt-/Empfangsadresse
  phone: "+49 173 2008319",          // Telefonnummer (Anzeige)
  phoneHref: "+491732008319",        // Telefonnummer für tel:-Link (ohne Leerzeichen)

  /* --- Formularversand (ohne dass sich das Mailprogramm öffnet) ---
     Web3Forms: auf https://web3forms.com die Empfänger-E-Mail eintragen,
     den per Mail erhaltenen Access Key hier einsetzen.
     Leer lassen = Fallback: öffnet vorausgefüllte E-Mail im Mailprogramm. */
  web3formsKey: "ee15661a-109f-4c28-aac7-bcb24f223a98",                  // Access Key von web3forms.com

  /* --- Online-Terminbuchung (Cal.com) ---
     Konto auf https://cal.com anlegen, Apple Kalender verbinden, Event-Typ
     erstellen, dann den Link "benutzername/event" hier eintragen.
     Leer lassen = Fallback: das .ics-Buchungsformular bleibt aktiv.
     Hinweis: Hier ist die EU-Region (cal.eu) hinterlegt. */
  calLink: "manuelazi",                          // z. B. "shineonyou/beratung"
  calOrigin: "https://cal.eu",                   // Booking-Origin (EU-Region)
  calEmbedJs: "https://app.cal.eu/embed/embed.js", // Embed-Loader passend zur Region
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

/* Versand über Web3Forms (Promise: true = erfolgreich) */
async function sendViaWeb3Forms(fields) {
  const res = await fetch("https://api.web3forms.com/submit", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ access_key: CONFIG.web3formsKey, ...fields }),
  });
  const data = await res.json().catch(() => ({}));
  return res.ok && data.success;
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

/* ===== Online-Terminbuchung (Cal.com) =====
   Datenschutzkonforme 2-Klick-Lösung: Das Cal.com-Embed (externer Dienst) wird
   NICHT automatisch geladen. Stattdessen zeigen wir einen Einwilligungs-Hinweis;
   erst ein Klick lädt das Widget und stellt damit die Verbindung zu Cal.com her. */
function initCalEmbed() {
  const container = document.getElementById("calEmbed");
  const consent = document.getElementById("calConsent");
  if (!CONFIG.calLink || !container) return; // nichts konfiguriert -> nichts laden

  // Einwilligungs-Box anzeigen; Embed erst nach Klick laden.
  if (consent) {
    consent.hidden = false;
    const btn = document.getElementById("calConsentBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        consent.hidden = true;
        loadCalEmbed(container);
      }, { once: true });
    }
    return;
  }

  // Fallback (keine Einwilligungs-Box im Markup): direkt laden.
  loadCalEmbed(container);
}

function loadCalEmbed(container) {
  const form = document.getElementById("bookingForm");

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
  })(window, CONFIG.calEmbedJs);

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

    // Anfrage an die Inhaberin: bevorzugt per Web3Forms, sonst mailto
    if (CONFIG.web3formsKey) {
      bookingForm.classList.add("is-loading");
      bookingHint.classList.remove("error");
      bookingHint.textContent = "Kalenderdatei heruntergeladen – Anfrage wird gesendet …";
      try {
        const ok = await sendViaWeb3Forms({
          subject: `Terminanfrage ${data.date} ${data.time} – ${data.name}`,
          from_name: data.name,
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
        } else { throw new Error("Web3Forms"); }
      } catch (_) {
        bookingForm.classList.remove("is-loading");
        bookingHint.classList.add("error");
        bookingHint.textContent = "Senden fehlgeschlagen – bitte per E-Mail oder Telefon melden.";
      }
      return;
    }

    // Fallback ohne Web3Forms: vorausgefüllte E-Mail
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

    if (CONFIG.web3formsKey) {
      contactForm.classList.add("is-loading");
      contactHint.classList.remove("error");
      contactHint.textContent = "Nachricht wird gesendet …";
      try {
        const ok = await sendViaWeb3Forms({
          subject: `Neue Kontaktanfrage von ${data.name} – Shine On You`,
          from_name: "Shine On You · Website",
          replyto: data.email,          // Antwort geht direkt an die anfragende Person
          botcheck: data.botcheck,      // Honeypot an Web3Forms durchreichen (Spam-Schutz)
          Name: data.name,
          "E-Mail": data.email,
          Nachricht: data.message,
        });
        contactForm.classList.remove("is-loading");
        if (ok) {
          showSuccess(
            contactForm,
            "Nachricht gesendet!",
            "Danke für deine Nachricht – ich melde mich so schnell wie möglich bei dir."
          );
        } else { throw new Error("Web3Forms"); }
      } catch (_) {
        contactForm.classList.remove("is-loading");
        contactHint.classList.add("error");
        contactHint.textContent = "Senden fehlgeschlagen – bitte per E-Mail oder Telefon melden.";
      }
      return;
    }

    // Fallback ohne Web3Forms: vorausgefüllte E-Mail
    contactHint.classList.remove("error");
    contactHint.textContent = "Dein E-Mail-Programm öffnet sich – bitte die Nachricht noch absenden.";
    openMailto(`Kontaktanfrage von ${data.name}`, [
      `Name: ${data.name}`, `E-Mail: ${data.email}`, "", data.message,
    ]);
  });
}

/* ===== Parallax (testweise) =====
   Elemente mit data-parallax="0.3" bewegen sich beim Scrollen langsamer als
   die Seite. Respektiert prefers-reduced-motion und läuft über rAF. */
(function initParallax() {
  const els = Array.from(document.querySelectorAll("[data-parallax]"));
  if (!els.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let ticking = false;
  function update() {
    const y = window.scrollY || window.pageYOffset || 0;
    for (const el of els) {
      const speed = parseFloat(el.dataset.parallax) || 0;
      el.style.transform = `translate3d(0, ${(y * speed).toFixed(1)}px, 0)`;
    }
    ticking = false;
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();
})();
