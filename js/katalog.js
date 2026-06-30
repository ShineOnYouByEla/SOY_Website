/* ============================================================
   Shine On You — Katalog-Blätterer
   ------------------------------------------------------------
   NEUEN KATALOG HINZUFÜGEN – ganz einfach:
     → Lade die PDF-Datei in den Ordner  kataloge/  hoch. Fertig.

   Die Liste der Kataloge wird beim Veröffentlichen automatisch aus den
   PDF-Dateien im Ordner erzeugt (kataloge/manifest.json). Du musst hier
   nichts mehr von Hand eintragen.

   Schöneren Anzeigenamen vergeben (optional): in kataloge/titel.json
   einen Eintrag ergänzen – siehe kataloge/README.md.
   ============================================================ */
(function () {
  "use strict";

  if (typeof pdfjsLib === "undefined" || typeof St === "undefined") {
    return showError("Die benötigten Bibliotheken konnten nicht geladen werden.");
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = "js/vendor/pdf.worker.min.js";

  const stageEl   = document.getElementById("flipbook");
  const tabsEl    = document.getElementById("catalogTabs");
  const statusEl  = document.getElementById("catalogStatus");
  const indicEl   = document.getElementById("pageIndicator");
  const prevBtn   = document.getElementById("prevPage");
  const nextBtn   = document.getElementById("nextPage");
  const fsBtn     = document.getElementById("fullscreenBtn");
  const viewerEl  = document.getElementById("catalogViewer");
  const toolbarEl = document.getElementById("catalogToolbar");
  const emptyEl   = document.getElementById("catalogEmpty");

  let KATALOGE = [];
  let pageFlip = null;
  let renderToken = 0; // bricht veraltete Render-Vorgänge ab

  /* ---- Steuerung verdrahten (unabhängig von den Daten) ---- */
  if (prevBtn) prevBtn.addEventListener("click", () => pageFlip && pageFlip.flipPrev());
  if (nextBtn) nextBtn.addEventListener("click", () => pageFlip && pageFlip.flipNext());
  if (fsBtn) fsBtn.addEventListener("click", toggleFullscreen);
  document.addEventListener("keydown", (e) => {
    if (!pageFlip) return;
    if (e.key === "ArrowLeft")  { pageFlip.flipPrev(); }
    if (e.key === "ArrowRight") { pageFlip.flipNext(); }
  });
  document.addEventListener("fullscreenchange", () => {
    if (fsBtn) fsBtn.setAttribute("aria-pressed", String(!!document.fullscreenElement));
  });

  /* ---- Katalog-Liste laden und Seite aufbauen ---- */
  loadManifest();

  async function loadManifest() {
    setStatus("Kataloge werden geladen …");
    try {
      const res = await fetch("kataloge/manifest.json", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data && data.kataloge) || [];
        // nur gültige Einträge übernehmen
        KATALOGE = list.filter((k) => k && k.id && k.datei);
      }
    } catch (e) {
      /* Manifest fehlt/fehlerhaft → leerer Zustand */
    }
    init();
  }

  function init() {
    setStatus("");

    if (!KATALOGE.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (viewerEl) viewerEl.hidden = true;
      return;
    }

    // Auswahl-Tabs aufbauen (nur bei mehr als einem Katalog)
    if (KATALOGE.length > 1 && tabsEl) {
      tabsEl.innerHTML = "";
      KATALOGE.forEach((k) => {
        const btn = document.createElement("button");
        btn.className = "catalog-tab";
        btn.type = "button";
        btn.textContent = k.titel || k.id;
        btn.dataset.id = k.id;
        btn.addEventListener("click", () => selectCatalog(k.id, true));
        tabsEl.appendChild(btn);
      });
      tabsEl.hidden = false;
    }

    // Startkatalog bestimmen (URL-Parameter ?katalog=… oder erster Eintrag)
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("katalog");
    const start = KATALOGE.find((k) => k.id === wanted) || KATALOGE[0];
    selectCatalog(start.id, false);
  }

  /* ============================================================
     Katalog auswählen & laden
     ============================================================ */
  async function selectCatalog(id, updateUrl) {
    const katalog = KATALOGE.find((k) => k.id === id) || KATALOGE[0];

    // aktiven Tab markieren
    if (tabsEl) {
      tabsEl.querySelectorAll(".catalog-tab").forEach((b) =>
        b.classList.toggle("is-active", b.dataset.id === katalog.id)
      );
    }
    // URL aktualisieren (ohne Neuladen)
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("katalog", katalog.id);
      history.replaceState(null, "", url);
    }

    await renderCatalog(katalog);
  }

  /* ============================================================
     PDF rendern und Blätterer aufbauen
     ============================================================ */
  async function renderCatalog(katalog) {
    const token = ++renderToken;
    setBusy(true);
    setStatus("Katalog wird geladen …");
    if (statusEl) statusEl.classList.remove("is-error");
    if (toolbarEl) toolbarEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;
    if (viewerEl) viewerEl.hidden = false;

    // alten Blätterer entfernen
    if (pageFlip) { try { pageFlip.destroy(); } catch (e) {} pageFlip = null; }
    stageEl.innerHTML = "";

    let pdf;
    try {
      pdf = await pdfjsLib.getDocument(katalog.datei).promise;
    } catch (err) {
      if (token !== renderToken) return;
      return showError(
        'Der Katalog „' + (katalog.titel || katalog.id) + "“ konnte nicht geladen werden. " +
        "Bitte prüfe, ob die Datei unter „" + katalog.datei + "“ vorhanden ist."
      );
    }

    const pageCount = pdf.numPages;
    // Seitenverhältnis der ersten Seite als Maß für das Buch
    const firstVp = (await pdf.getPage(1)).getViewport({ scale: 1 });
    const ratio = firstVp.width / firstVp.height;

    // Alle Seiten als Bilder rendern
    const images = [];
    const targetW = 1100; // Renderbreite je Seite (Schärfe vs. Speicher)
    for (let i = 1; i <= pageCount; i++) {
      if (token !== renderToken) return; // Katalog wurde inzwischen gewechselt
      setStatus("Seite " + i + " von " + pageCount + " wird vorbereitet …");
      try {
        images.push(await renderPageToImage(pdf, i, targetW));
      } catch (err) {
        if (token !== renderToken) return;
        return showError("Beim Aufbereiten der Seiten ist ein Fehler aufgetreten.");
      }
    }
    if (token !== renderToken) return;

    // Blätterer aufbauen
    const baseH = 760;
    const baseW = Math.round(baseH * ratio);
    pageFlip = new St.PageFlip(stageEl, {
      width: baseW,
      height: baseH,
      size: "stretch",
      minWidth: 280,
      maxWidth: 1400,
      minHeight: 380,
      maxHeight: 1900,
      drawShadow: true,
      maxShadowOpacity: 0.5,
      flippingTime: 700,
      usePortrait: true,        // Mobil einseitig, Desktop Doppelseite
      showCover: true,          // erste Seite als Titel/Cover
      mobileScrollSupport: false,
      useMouseEvents: true,
      swipeDistance: 30,
    });

    pageFlip.on("flip", () => updateIndicator(pageCount));
    pageFlip.on("changeState", () => updateIndicator(pageCount));
    pageFlip.loadFromImages(images);

    updateIndicator(pageCount);
    setBusy(false);
    setStatus("");
    if (toolbarEl) toolbarEl.hidden = false;
  }

  /* PDF-Seite auf ein Canvas rendern und als Bild-URL zurückgeben */
  async function renderPageToImage(pdf, pageNumber, targetW) {
    const page = await pdf.getPage(pageNumber);
    const unscaled = page.getViewport({ scale: 1 });
    const scale = targetW / unscaled.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    // weißer Hintergrund (PDFs ohne eigenen Hintergrund)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const url = canvas.toDataURL("image/jpeg", 0.85);
    page.cleanup();
    return url;
  }

  /* ---- Anzeige der aktuellen Seite ---- */
  function updateIndicator(pageCount) {
    if (!indicEl || !pageFlip) return;
    const idx = pageFlip.getCurrentPageIndex(); // 0-basiert
    const portrait = pageFlip.getOrientation && pageFlip.getOrientation() === "portrait";
    let label;
    if (portrait) {
      label = (idx + 1) + " / " + pageCount;
    } else {
      // Doppelseite: linke + rechte Seite
      const right = Math.min(idx + 1, pageCount - 1);
      label = (idx === right) ? (idx + 1) + " / " + pageCount
                              : (idx + 1) + "–" + (right + 1) + " / " + pageCount;
    }
    indicEl.textContent = "Seite " + label;
    if (prevBtn) prevBtn.disabled = idx <= 0;
    if (nextBtn) nextBtn.disabled = idx >= pageCount - 1;
  }

  /* ---- Vollbild ---- */
  function toggleFullscreen() {
    const target = viewerEl || document.documentElement;
    if (!document.fullscreenElement) {
      if (target.requestFullscreen) target.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  /* ---- Hilfs-Funktionen ---- */
  function setStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.hidden = !text;
  }
  function setBusy(b) {
    if (viewerEl) viewerEl.classList.toggle("is-busy", b);
  }
  function showError(msg) {
    setBusy(false);
    if (toolbarEl) toolbarEl.hidden = true;
    if (statusEl) { statusEl.textContent = msg; statusEl.hidden = false; statusEl.classList.add("is-error"); }
  }
})();
