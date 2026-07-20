/* ============================================================
   Shine On You — Theme-Umschalter (System / Hell / Dunkel)
   ------------------------------------------------------------
   Der Umschalter kennt drei Zustände und rotiert bei jedem Klick:
     System → Hell → Dunkel → System …
   • "System" folgt der Betriebssystem-Einstellung und wechselt
     live mit, wenn dort umgestellt wird. Es wird nichts gespeichert.
   • "Hell"/"Dunkel" sind bewusste Wahlen und werden in localStorage
     gemerkt (überschreiben die System-Einstellung).
   data-theme      = tatsächlich sichtbares Theme ("light"/"dark")
   data-theme-mode = gewählter Modus ("system"/"light"/"dark")
   Der frühe Inline-Setter im <head> setzt beide Attribute bereits,
   damit weder Theme noch Icon aufblitzen.
   ============================================================ */
(function initTheme() {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const STORAGE_KEY = "soy-theme";
  const THEME_COLOR = { dark: "#041f24", light: "#fbf7f0" };
  const ORDER = ["system", "light", "dark"];
  const mql = window.matchMedia("(prefers-color-scheme: light)");

  const LABEL = {
    system: "Design: System – klicken für Hell",
    light: "Design: Hell – klicken für Dunkel",
    dark: "Design: Dunkel – klicken für System",
  };

  // Gespeicherten Modus lesen; alles außer "light"/"dark" gilt als "system"
  function storedMode() {
    let v = null;
    try { v = localStorage.getItem(STORAGE_KEY); } catch (e) { /* egal */ }
    return v === "light" || v === "dark" ? v : "system";
  }

  // Modus → tatsächliches Theme auflösen
  function resolve(mode) {
    if (mode === "light" || mode === "dark") return mode;
    return mql.matches ? "light" : "dark";
  }

  function apply(mode) {
    const theme = resolve(mode);
    root.setAttribute("data-theme", theme);
    root.setAttribute("data-theme-mode", mode);
    if (meta) meta.setAttribute("content", THEME_COLOR[theme]);

    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.setAttribute("aria-label", LABEL[mode]);
      // Zyklus-Schalter: aria-pressed passt hier nicht mehr
      btn.removeAttribute("aria-pressed");
    });
  }

  // Anzeige an den (vom Inline-Setter gesetzten) Zustand angleichen
  apply(storedMode());

  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = ORDER[(ORDER.indexOf(storedMode()) + 1) % ORDER.length];
      try {
        if (next === "system") localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, next);
      } catch (e) { /* egal */ }
      apply(next);
    });
  });

  // Systemwechsel live übernehmen, solange der Modus "system" aktiv ist
  try {
    mql.addEventListener("change", () => {
      if (storedMode() === "system") apply("system");
    });
  } catch (e) { /* matchMedia nicht verfügbar */ }
})();
