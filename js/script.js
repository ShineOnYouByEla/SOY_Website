/* ============================================================
   Shine On You — Interaktion
   ------------------------------------------------------------
   HIER ANPASSEN: deine Kontaktdaten
   ============================================================ */
const CONFIG = {
  businessName: "Shine On You",
  email: "christoph@zeitler.tech",   // <- deine Kontakt-/Empfangsadresse
  phone: "+49 (0) 000 000 000",      // <- deine Telefonnummer (Anzeige)
  phoneHref: "+490000000000",        // <- Telefonnummer für tel:-Link (ohne Leerzeichen)
  instagram: "https://instagram.com/", // <- Instagram-Profil
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
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    "00"
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

/* Minimum für Datumsfeld = heute */
const dateInput = document.getElementById("b-date");
if (dateInput) {
  const t = new Date();
  dateInput.min = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/* ===== Terminbuchung ===== */
const bookingForm = document.getElementById("bookingForm");
const bookingHint = document.getElementById("bookingHint");

if (bookingForm) {
  bookingForm.addEventListener("submit", (e) => {
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

    const uid = `soy-${start.getTime()}@shineonyou`;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Shine On You//Termin//DE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(start)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${desc}`,
      `ORGANIZER;CN=${CONFIG.businessName}:mailto:${CONFIG.email}`,
      `ATTENDEE;CN=${data.name};RSVP=TRUE:mailto:${data.email}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      "DESCRIPTION:Erinnerung",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    downloadICS(`Termin-${data.date}-${data.time.replace(":", "")}.ics`, ics);

    // Anfrage zusätzlich per E-Mail an die Inhaber:in
    const subject = `Terminanfrage ${data.date} ${data.time} – ${data.name}`;
    const body =
      `Hallo ${CONFIG.businessName}-Team,%0D%0A%0D%0A` +
      `ich möchte einen Beratungstermin vereinbaren:%0D%0A%0D%0A` +
      `Datum: ${data.date}%0D%0AUhrzeit: ${data.time}%0D%0AArt: ${data.mode}%0D%0A` +
      `Name: ${data.name}%0D%0AE-Mail: ${data.email}%0D%0A` +
      (data.note ? `Thema: ${data.note}%0D%0A` : "") +
      `%0D%0AViele Grüße`;

    bookingHint.classList.remove("error");
    bookingHint.textContent =
      "✓ Kalenderdatei wurde heruntergeladen. Dein E-Mail-Programm öffnet sich für die Anfrage …";

    setTimeout(() => {
      window.location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${body}`;
    }, 600);
  });
}

/* ===== Kontaktformular (mailto-Fallback ohne Backend) ===== */
const contactForm = document.getElementById("contactForm");
const contactHint = document.getElementById("contactHint");

if (contactForm) {
  contactForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!contactForm.reportValidity()) return;

    const data = Object.fromEntries(new FormData(contactForm).entries());
    const subject = `Kontaktanfrage von ${data.name}`;
    const body =
      `Name: ${data.name}%0D%0AE-Mail: ${data.email}%0D%0A%0D%0A${encodeURIComponent(data.message)}`;

    contactHint.classList.remove("error");
    contactHint.textContent = "Dein E-Mail-Programm öffnet sich – bitte die Nachricht noch absenden.";
    window.location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${body}`;
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
