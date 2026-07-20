/* ============================================================
   Shine On You — Theme-Umschalter (Hell/Dunkel)
   ------------------------------------------------------------
   Setzt data-theme auf <html>, merkt sich die Wahl in localStorage
   und aktualisiert die Browser-Themefarbe. Der frühe Inline-Setter
   im <head> verhindert bereits ein Aufblitzen des falschen Themes;
   diese Datei kümmert sich um Umschalten & Persistenz.
   ============================================================ */
(function initTheme() {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const STORAGE_KEY = "soy-theme";
  const THEME_COLOR = { dark: "#041f24", light: "#fbf7f0" };

  function current() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    if (meta) meta.setAttribute("content", THEME_COLOR[theme]);

    const nextIsLight = theme === "dark"; // ein Klick würde nach hell wechseln
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.setAttribute(
        "aria-label",
        nextIsLight ? "Zu hellem Design wechseln" : "Zu dunklem Design wechseln"
      );
      btn.setAttribute("aria-pressed", String(theme === "light"));
    });
  }

  // Anzeige an den (ggf. vom Inline-Setter gesetzten) Zustand angleichen
  apply(current());

  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = current() === "light" ? "dark" : "light";
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) { /* egal */ }
      apply(next);
    });
  });

  // Systemwechsel nur übernehmen, solange keine bewusste Wahl gespeichert ist
  try {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", (e) => {
      let stored = null;
      try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) { /* egal */ }
      if (!stored) apply(e.matches ? "light" : "dark");
    });
  } catch (e) { /* matchMedia nicht verfügbar */ }
})();
