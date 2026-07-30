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
  const zoomBtn   = document.getElementById("zoomBtn");
  const magBtn    = document.getElementById("magnifierBtn");
  const viewerEl  = document.getElementById("catalogViewer");
  const toolbarEl = document.getElementById("catalogToolbar");
  const emptyEl   = document.getElementById("catalogEmpty");

  let KATALOGE = [];
  let pageFlip = null;
  let renderToken = 0; // bricht veraltete Render-Vorgänge ab
  let currentPdf = null;      // aktuell geladenes PDF (für die Zoom-Ansicht)
  let currentPageCount = 0;
  let pageImages = [];        // Vorschau-Bilder der Seiten (für Lupe & Vollbild)
  let isFlipping = false;     // gerade eine Blätter-Animation aktiv?
  let currentRatio = 1;       // Seitenverhältnis (Breite/Höhe) der Katalogseiten

  /* ---- Steuerung verdrahten (unabhängig von den Daten) ---- */
  if (prevBtn) prevBtn.addEventListener("click", () => pageFlip && pageFlip.flipPrev());
  if (nextBtn) nextBtn.addEventListener("click", () => pageFlip && pageFlip.flipNext());
  if (zoomBtn) zoomBtn.addEventListener("click", () => openZoom());
  // Doppeltipp/Doppelklick auf die Seite öffnet ebenfalls die Zoom-Ansicht
  if (stageEl) {
    stageEl.addEventListener("dblclick", () => openZoom());
    // Am Handy feuert kein dblclick – Doppeltipp selbst erkennen
    let tapTime = 0, tapX = 0, tapY = 0;
    stageEl.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "touch") return;
      const now = Date.now();
      if (now - tapTime < 320 && Math.hypot(e.clientX - tapX, e.clientY - tapY) < 30) {
        tapTime = 0;
        openZoom();
      } else {
        tapTime = now; tapX = e.clientX; tapY = e.clientY;
      }
    });
  }
  document.addEventListener("keydown", (e) => {
    if (zoomOpen) {
      if (e.key === "Escape") closeZoom();
      if (e.key === "ArrowLeft")  zoomFlip(-1);
      if (e.key === "ArrowRight") zoomFlip(1);
      return;
    }
    if (magnifierOn && e.key === "Escape") { setMagnifier(false); return; }
    if (!pageFlip) return;
    if (e.key === "ArrowLeft")  { pageFlip.flipPrev(); }
    if (e.key === "ArrowRight") { pageFlip.flipNext(); }
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
    resetMagnifier();   // Lupen-Zwischenspeicher leeren, Lupe ausblenden

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
    currentPdf = pdf;                 // für die Zoom-Ansicht merken
    currentPageCount = pageCount;
    // Seitenverhältnis der ersten Seite als Maß für das Buch
    const firstVp = (await pdf.getPage(1)).getViewport({ scale: 1 });
    const ratio = firstVp.width / firstVp.height;
    currentRatio = ratio;             // für die Vollbild-Ansicht merken

    // Alle Seiten als Bilder rendern.
    // Renderbreite an die Bildschirmdichte anpassen, damit die Seiten auch
    // auf hochauflösenden Handys (device-pixel-ratio 2–3) und beim Reinzoomen
    // in die Vollbild-Ansicht scharf bleiben. Nach oben gedeckelt, damit große
    // Kataloge nicht zu viel Speicher/Ladezeit brauchen (Schärfe vs. Speicher).
    const images = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const targetW = Math.max(1100, Math.min(1800, Math.round(1100 * dpr)));
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
    pageFlip.on("changeState", (e) => {
      // Lupe nur im Ruhezustand zeigen, nicht während des Blätterns
      isFlipping = e && e.data && e.data !== "read";
      if (isFlipping) hideLens();
      updateIndicator(pageCount);
    });
    // Wichtig für die Schärfe: die Seiten als echte <img>-Elemente einhängen
    // (loadFromHTML) statt sie von der Bibliothek auf ein Canvas zeichnen zu
    // lassen (loadFromImages). Das Canvas arbeitet nur in CSS-Pixeln und ist
    // dadurch auf Handys mit hoher Pixeldichte zwangsläufig unscharf – Bilder
    // skaliert der Browser dagegen in echter Geräteauflösung.
    pageFlip.loadFromHTML(images.map(createPageElement));

    pageImages = images;       // Bildquellen für die Lupe merken
    updateIndicator(pageCount);
    setBusy(false);
    setStatus("");
    if (toolbarEl) toolbarEl.hidden = false;
  }

  /* Eine Katalogseite als Blätter-Element (weißes Blatt mit Bild) aufbauen */
  function createPageElement(src) {
    const holder = document.createElement("div");
    holder.className = "flip-page";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    holder.appendChild(img);
    return holder;
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
    // Etwas höhere JPEG-Qualität – feine Schrift bleibt so besser lesbar.
    const url = canvas.toDataURL("image/jpeg", 0.92);
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

  /* ============================================================
     Vollbild-Ansicht: ein zweiter, großer Blätterer mit demselben
     schönen Blätter-Effekt. Zum Vergrößern kann man die ganze Bühne
     zoomen (Mausrad/Doppelklick bzw. zwei Finger) und verschieben.
     Geblättert wird mit den Pfeilen, den Pfeiltasten oder per Wischen.
     ============================================================ */
  const zoomOverlay  = document.getElementById("zoomOverlay");
  const zoomViewport = document.getElementById("zoomViewport");
  const zoomStage    = document.getElementById("zoomStage");
  const zoomFlipEl   = document.getElementById("zoomFlip");
  const zoomLoading  = document.getElementById("zoomLoading");
  const zoomIndic    = document.getElementById("zoomIndicator");
  const zoomPrev     = document.getElementById("zoomPrev");
  const zoomNext     = document.getElementById("zoomNext");
  const zoomClose    = document.getElementById("zoomClose");

  let zoomOpen = false;
  let zoomIndex = 0;              // aktuell gezeigte Seite (0-basiert)
  let zoomImgEl = null;           // <img> mit der aktuellen Seite in hoher Auflösung
  let zoomRenderToken = 0;        // bricht veraltete Seiten-Renderings ab
  const Z_MIN = 1, Z_MAX = 4;     // Zoom-Grenzen der Vollbild-Bühne
  let zScale = 1, ztx = 0, zty = 0;
  const zPointers = new Map();
  let zPinch = null;
  let zDown = null;               // Start eines Einzelzeigers (Wischen/Tippen)
  let zLastTapTime = 0, zLastTapX = 0, zLastTapY = 0;

  /* Scharfe Vollbild-Seiten: Jede Seite wird für die Vollbild-Ansicht einzeln
     in hoher Auflösung als Bild gerendert (nicht über die Blätter-Bibliothek,
     die intern nur in CSS-Pixeln zeichnet und dadurch auf Handys unscharf
     bliebe). So bleibt auch die feine Schrift beim Reinzoomen lesbar. */
  const MAX_CANVAS_DIM = 4000;    // sichere Canvas-Kante (iOS-Limit ~4096)
  const ZOOM_READ_W    = 2800;    // Ziel-Renderbreite der scharfen Seiten
  const ZOOM_CACHE_MAX = 8;       // max. gemerkte scharfe Seiten (Speicher)
  const zoomCache = new Map();    // Seiten-Index (0-basiert) -> scharfe Bild-URL
  const zoomCacheLRU = [];        // Reihenfolge fürs Verdrängen (ältestes zuerst)

  if (zoomClose) zoomClose.addEventListener("click", closeZoom);
  if (zoomPrev) zoomPrev.addEventListener("click", () => zoomFlip(-1));
  if (zoomNext) zoomNext.addEventListener("click", () => zoomFlip(1));

  if (zoomViewport) {
    zoomViewport.addEventListener("pointerdown", onZoomPointerDown);
    zoomViewport.addEventListener("pointermove", onZoomPointerMove);
    zoomViewport.addEventListener("pointerup", onZoomPointerUp);
    zoomViewport.addEventListener("pointercancel", onZoomPointerUp);
    // Doppelklick (Maus) zoomt an der Stelle hinein/heraus
    zoomViewport.addEventListener("dblclick", (e) => { e.preventDefault(); toggleZoomAt(e.clientX, e.clientY); });
    // Mausrad zoomt an der Zeigerstelle
    zoomViewport.addEventListener("wheel", (e) => {
      if (!zoomOpen) return;
      e.preventDefault();
      const r = zoomViewport.getBoundingClientRect();
      setZoomScaleAround(e.clientX - r.left, e.clientY - r.top, zScale + (e.deltaY < 0 ? 0.3 : -0.3));
    }, { passive: false });
  }

  function openZoom(pageNum) {
    if (zoomOpen || !currentPdf || !currentPageCount) return;
    hideLens(); // Lupe ausblenden, solange die Vollbild-Ansicht offen ist
    let n = pageNum;
    if (!n && pageFlip) n = pageFlip.getCurrentPageIndex() + 1; // aktuelle Seite
    zoomIndex = Math.min(Math.max((n || 1) - 1, 0), currentPageCount - 1);

    zoomOpen = true;
    zoomOverlay.hidden = false;
    zoomOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("zoom-lock");

    // <img> für die scharfe Seite anlegen (einmalig)
    if (zoomFlipEl) {
      zoomFlipEl.innerHTML = "";
      zoomImgEl = document.createElement("img");
      zoomImgEl.className = "zoom-page";
      zoomImgEl.alt = "";
      zoomImgEl.decoding = "async";
      zoomFlipEl.appendChild(zoomImgEl);
    }
    showZoomPage(zoomIndex);
  }

  /* Eine Seite in hoher Auflösung rendern und im Vollbild scharf anzeigen. */
  function showZoomPage(idx) {
    if (!currentPdf) return;
    zoomIndex = Math.min(Math.max(idx, 0), currentPageCount - 1);
    resetZoomTransform();          // beim Seitenwechsel wieder die ganze Seite zeigen
    updateZoomIndicator();
    if (zoomLoading) { zoomLoading.hidden = false; zoomLoading.textContent = "Seite wird geladen …"; }

    const token = ++zoomRenderToken;
    const pdf = currentPdf;
    getZoomImage(pdf, zoomIndex).then((url) => {
      if (token !== zoomRenderToken || pdf !== currentPdf || !zoomOpen || !zoomImgEl) return;
      zoomImgEl.src = url;
      if (zoomLoading) zoomLoading.hidden = true;
      prefetchZoomImage(pdf, zoomIndex + 1); // nächste Seite im Hintergrund vorbereiten
    }).catch(() => {
      if (token !== zoomRenderToken) return;
      if (zoomLoading) { zoomLoading.hidden = false; zoomLoading.textContent = "Seite konnte nicht geladen werden."; }
    });
  }

  /* Scharfe Seite (gemerkt) holen oder neu rendern. Breite so gedeckelt, dass
     die Canvas-Kante das Geräte-Limit (iOS ~4096) nicht überschreitet. */
  function getZoomImage(pdf, idx) {
    if (zoomCache.has(idx)) { touchZoomCache(idx); return Promise.resolve(zoomCache.get(idx)); }
    const ratio = currentRatio || 0.707;
    const w = Math.min(ZOOM_READ_W, Math.floor(MAX_CANVAS_DIM * ratio), Math.floor(MAX_CANVAS_DIM));
    return renderPageToImage(pdf, idx + 1, w).then((url) => {
      if (pdf === currentPdf) rememberZoomImage(idx, url);
      return url;
    });
  }

  function prefetchZoomImage(pdf, idx) {
    if (idx < 0 || idx >= currentPageCount || zoomCache.has(idx)) return;
    getZoomImage(pdf, idx).catch(() => {});
  }

  function rememberZoomImage(idx, url) {
    zoomCache.set(idx, url);
    touchZoomCache(idx);
    while (zoomCacheLRU.length > ZOOM_CACHE_MAX) zoomCache.delete(zoomCacheLRU.shift());
  }
  function touchZoomCache(idx) {
    const p = zoomCacheLRU.indexOf(idx);
    if (p >= 0) zoomCacheLRU.splice(p, 1);
    zoomCacheLRU.push(idx);
  }

  function closeZoom() {
    if (!zoomOpen) return;
    zoomOpen = false;
    zoomRenderToken++;             // laufende Renderings verwerfen
    const idx = zoomIndex;
    zoomOverlay.hidden = true;
    zoomOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("zoom-lock");
    zPointers.clear(); zPinch = null; zDown = null;
    if (zoomFlipEl) zoomFlipEl.innerHTML = "";
    zoomImgEl = null;
    // scharfe Seiten wieder freigeben (Speicher)
    zoomCache.clear(); zoomCacheLRU.length = 0;
    // normalen Blätterer an die zuletzt gesehene Seite setzen
    if (pageFlip) { try { pageFlip.turnToPage(idx); } catch (e) {} }
  }

  function zoomFlip(dir) {
    if (!zoomOpen) return;
    const next = zoomIndex + (dir < 0 ? -1 : 1);
    if (next < 0 || next >= currentPageCount) return;
    showZoomPage(next);
  }

  function updateZoomIndicator() {
    const n = currentPageCount;
    if (zoomIndic) zoomIndic.textContent = "Seite " + (zoomIndex + 1) + " / " + n;
    if (zoomPrev) zoomPrev.disabled = zoomIndex <= 0;
    if (zoomNext) zoomNext.disabled = zoomIndex >= n - 1;
  }

  /* ---- Zoom & Verschieben der ganzen Vollbild-Bühne ---- */
  function resetZoomTransform() { zScale = 1; ztx = 0; zty = 0; applyZoom(); }

  function applyZoom() {
    clampZoom();
    if (zoomStage) zoomStage.style.transform = "translate(" + ztx + "px," + zty + "px) scale(" + zScale + ")";
    if (zoomViewport) zoomViewport.classList.toggle("is-zoomed", zScale > 1.02);
  }

  function clampZoom() {
    const vpW = zoomViewport.clientWidth, vpH = zoomViewport.clientHeight;
    const w = vpW * zScale, h = vpH * zScale;
    if (w <= vpW) ztx = (vpW - w) / 2; else ztx = Math.min(0, Math.max(vpW - w, ztx));
    if (h <= vpH) zty = (vpH - h) / 2; else zty = Math.min(0, Math.max(vpH - h, zty));
  }

  function setZoomScaleAround(px, py, newScale) {
    newScale = Math.min(Z_MAX, Math.max(Z_MIN, newScale));
    const ix = (px - ztx) / zScale, iy = (py - zty) / zScale;
    zScale = newScale;
    ztx = px - ix * zScale;
    zty = py - iy * zScale;
    applyZoom();
  }

  function toggleZoomAt(clientX, clientY) {
    const r = zoomViewport.getBoundingClientRect();
    setZoomScaleAround(clientX - r.left, clientY - r.top, zScale > 1.2 ? 1 : 2.4);
  }

  /* ---- Zeiger: Wischen zum Blättern, Ziehen zum Verschieben (gezoomt),
         Kneifen/Doppeltipp zum Zoomen ---- */
  function onZoomPointerDown(e) {
    if (!zoomOpen) return;
    zoomViewport.setPointerCapture(e.pointerId);
    zPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (zPointers.size === 2) { startZoomPinch(); zDown = null; }
    else if (zPointers.size === 1) { zDown = { x: e.clientX, y: e.clientY, t: Date.now(), type: e.pointerType }; }
  }

  function onZoomPointerMove(e) {
    if (!zoomOpen || !zPointers.has(e.pointerId)) return;
    const prev = zPointers.get(e.pointerId);
    zPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (zPointers.size === 2 && zPinch) {
      const pts = [...zPointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const r = zoomViewport.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - r.left;
      const midY = (pts[0].y + pts[1].y) / 2 - r.top;
      setZoomScaleAround(midX, midY, zPinch.scale * (dist / zPinch.dist));
    } else if (zPointers.size === 1 && zScale > 1.02) {
      ztx += e.clientX - prev.x;
      zty += e.clientY - prev.y;
      applyZoom();
    }
  }

  function onZoomPointerUp(e) {
    if (!zPointers.has(e.pointerId)) return;
    zPointers.delete(e.pointerId);
    try { zoomViewport.releasePointerCapture(e.pointerId); } catch (_) {}
    if (zPointers.size < 2) zPinch = null;
    if (zPointers.size !== 0) return;

    const start = zDown; zDown = null;
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    const dist = Math.hypot(dx, dy), dt = Date.now() - start.t;

    // Wischen zum Blättern (nur ungezoomt, deutlich waagerecht)
    if (zScale <= 1.02 && dist > 60 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 800) {
      zoomFlip(dx < 0 ? 1 : -1);
      zLastTapTime = 0;
      return;
    }
    // Doppeltipp zum Zoomen (Touch; die Maus nutzt dblclick)
    if (start.type !== "mouse" && dist < 24) {
      const now = Date.now();
      if (now - zLastTapTime < 320 && Math.hypot(e.clientX - zLastTapX, e.clientY - zLastTapY) < 30) {
        toggleZoomAt(e.clientX, e.clientY);
        zLastTapTime = 0;
      } else {
        zLastTapTime = now; zLastTapX = e.clientX; zLastTapY = e.clientY;
      }
    }
  }

  function startZoomPinch() {
    const pts = [...zPointers.values()];
    zPinch = {
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
      scale: zScale,
    };
  }

  window.addEventListener("resize", () => {
    if (!zoomOpen) return;
    resetZoomTransform(); // Seite wieder mittig einpassen
  });

  /* ============================================================
     Lupe: eine runde Vergrößerung, die man mit der Maus über den
     Katalog bewegt. Der Blätter-Effekt bleibt dabei erhalten – die
     Lupe schwebt einfach über dem laufenden Blätterer.
     (Nur an Geräten mit Maus/Trackpad sinnvoll – am Handy bleibt die
     Vollbild-Ansicht zum Zoomen.)
     ============================================================ */
  const LENS_SIZE     = 240;   // Durchmesser der Lupe in Pixeln
  const LENS_HIRES_W  = 1800;  // Renderbreite der scharfen Lupen-Vorlage
  let   LENS_ZOOM     = 2.2;   // Vergrößerungsfaktor (mit Mausrad änderbar)

  let magnifierOn = false;
  let lensVisible = false;
  let lastClient  = null;            // zuletzt bekannte Mausposition
  const lensHiRes = new Map();       // Seite (1-basiert) → scharfe Bild-URL
  let lensEl = null;

  // Lupe gibt es nur, wenn ein echter Zeiger (Maus/Trackpad) vorhanden ist
  const canHover = !!(window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches);

  if (magBtn) {
    if (!canHover) {
      magBtn.hidden = true;
    } else {
      magBtn.hidden = false;
      magBtn.addEventListener("click", () => setMagnifier(!magnifierOn));
      stageEl.addEventListener("pointermove", (e) => {
        if (magnifierOn && e.pointerType !== "touch") moveLens(e.clientX, e.clientY);
      });
      stageEl.addEventListener("pointerleave", hideLens);
      stageEl.addEventListener("wheel", (e) => {
        if (!magnifierOn || !lensVisible) return;
        e.preventDefault();
        LENS_ZOOM = Math.min(4, Math.max(1.6, LENS_ZOOM + (e.deltaY < 0 ? 0.2 : -0.2)));
        if (lastClient) moveLens(lastClient.x, lastClient.y);
      }, { passive: false });
      // Lupe ist von Anfang an aktiv: einfach mit der Maus über die Seite fahren
      setMagnifier(true);
    }
  }

  function ensureLensEl() {
    if (lensEl) return lensEl;
    lensEl = document.createElement("div");
    lensEl.className = "catalog-lens";
    lensEl.setAttribute("aria-hidden", "true");
    lensEl.style.width = LENS_SIZE + "px";
    lensEl.style.height = LENS_SIZE + "px";
    document.body.appendChild(lensEl);
    return lensEl;
  }

  function setMagnifier(on) {
    on = !!on && canHover;
    magnifierOn = on;
    if (magBtn) magBtn.setAttribute("aria-pressed", on ? "true" : "false");
    if (!on) hideLens();
  }

  function showLens() {
    if (!lensVisible) { ensureLensEl().classList.add("is-visible"); lensVisible = true; }
    // Solange die Lupe sichtbar ist, ersetzt sie den Mauszeiger
    if (stageEl) stageEl.classList.add("lens-show");
  }
  function hideLens() {
    if (lensVisible && lensEl) { lensEl.classList.remove("is-visible"); lensVisible = false; }
    if (stageEl) stageEl.classList.remove("lens-show");
  }

  function resetMagnifier() {
    lensHiRes.clear();
    hideLens();
  }

  /* Bestimmt, über welcher Katalogseite die Maus steht, und an welcher
     Stelle dieser Seite (0…1). Funktioniert nur in der Doppelseiten-
     Ansicht (Desktop) und im Ruhezustand – sonst gibt es nichts zu zeigen. */
  function lensSource(clientX, clientY) {
    if (!pageFlip || isFlipping) return null;
    const block = stageEl.querySelector(".stf__block");
    if (!block) return null;

    let rect, spread;
    try {
      if (pageFlip.render.getOrientation() !== "landscape") return null;
      rect = pageFlip.render.getRect();
      const spreads = pageFlip.pages.getSpread();
      spread = spreads[pageFlip.pages.getCurrentSpreadIndex()];
    } catch (e) { return null; }
    if (!rect || !spread) return null;

    // Welche Seite liegt links, welche rechts? (siehe page-flip-Logik)
    let leftIdx = null, rightIdx = null;
    if (spread.length === 2) { leftIdx = spread[0]; rightIdx = spread[1]; }
    else if (spread[0] === currentPageCount - 1) { leftIdx = spread[0]; }
    else { rightIdx = spread[0]; }

    // Der Buchbereich liegt in CSS-Pixeln innerhalb des Blätter-Containers
    const cr = block.getBoundingClientRect();
    const bookLeft = cr.left + rect.left;
    const bookTop  = cr.top  + rect.top;
    const pw = rect.pageWidth;
    const ph = rect.height;

    const fy = (clientY - bookTop) / ph;
    if (fy < 0 || fy > 1) return null;
    const lx = clientX - bookLeft;

    let idx = null, fx = null;
    if (lx >= 0 && lx < pw && leftIdx !== null) { idx = leftIdx; fx = lx / pw; }
    else if (lx >= pw && lx < 2 * pw && rightIdx !== null) { idx = rightIdx; fx = (lx - pw) / pw; }
    else return null;

    return { pageNum: idx + 1, fx: fx, fy: fy, pw: pw, ph: ph };
  }

  function moveLens(clientX, clientY) {
    if (!magnifierOn) return;
    const info = lensSource(clientX, clientY);
    if (!info) { hideLens(); return; }

    lastClient = { x: clientX, y: clientY };
    const idx = info.pageNum - 1;
    const src = lensHiRes.get(info.pageNum) || pageImages[idx];
    if (!src) { hideLens(); return; }
    ensureHiRes(info.pageNum); // schärfere Vorlage im Hintergrund nachladen

    const el = ensureLensEl();
    const bgW = info.pw * LENS_ZOOM;
    const bgH = info.ph * LENS_ZOOM;
    el.style.backgroundImage = 'url("' + src + '")';
    el.style.backgroundSize = bgW + "px " + bgH + "px";
    el.style.backgroundPosition =
      (LENS_SIZE / 2 - info.fx * bgW) + "px " + (LENS_SIZE / 2 - info.fy * bgH) + "px";
    el.style.left = (clientX - LENS_SIZE / 2) + "px";
    el.style.top  = (clientY - LENS_SIZE / 2) + "px";
    showLens();
  }

  /* Seite einmalig in hoher Auflösung rendern und merken – damit die
     Lupe so scharf ist wie die Vollbild-Ansicht. */
  function ensureHiRes(pageNum) {
    if (lensHiRes.has(pageNum) || !currentPdf) return;
    lensHiRes.set(pageNum, null); // als „wird geladen" markieren
    const pdf = currentPdf;
    renderPageToImage(pdf, pageNum, LENS_HIRES_W).then((url) => {
      if (pdf !== currentPdf) { lensHiRes.delete(pageNum); return; }
      lensHiRes.set(pageNum, url);
      // Wenn die Maus noch auf dieser Seite steht: scharf nachziehen
      if (magnifierOn && lastClient) moveLens(lastClient.x, lastClient.y);
    }).catch(() => { lensHiRes.delete(pageNum); });
  }

  window.addEventListener("resize", () => { if (magnifierOn) hideLens(); });

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
