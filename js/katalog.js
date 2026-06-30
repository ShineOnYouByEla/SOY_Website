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
  const viewerEl  = document.getElementById("catalogViewer");
  const toolbarEl = document.getElementById("catalogToolbar");
  const emptyEl   = document.getElementById("catalogEmpty");

  let KATALOGE = [];
  let pageFlip = null;
  let renderToken = 0; // bricht veraltete Render-Vorgänge ab
  let currentPdf = null;      // aktuell geladenes PDF (für die Zoom-Ansicht)
  let currentPageCount = 0;

  /* ---- Steuerung verdrahten (unabhängig von den Daten) ---- */
  if (prevBtn) prevBtn.addEventListener("click", () => pageFlip && pageFlip.flipPrev());
  if (nextBtn) nextBtn.addEventListener("click", () => pageFlip && pageFlip.flipNext());
  if (zoomBtn) zoomBtn.addEventListener("click", () => openZoom());
  // Doppeltipp/Doppelklick auf die Seite öffnet ebenfalls die Zoom-Ansicht
  if (stageEl) stageEl.addEventListener("dblclick", () => openZoom());
  document.addEventListener("keydown", (e) => {
    if (zoomOpen) {
      if (e.key === "Escape") closeZoom();
      if (e.key === "ArrowLeft")  zoomStep(-1);
      if (e.key === "ArrowRight") zoomStep(1);
      return;
    }
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

  /* ============================================================
     Zoom-Ansicht: einzelne Seite in hoher Auflösung, zum
     Reinzoomen (zwei Finger / Doppeltipp) und Verschieben
     ============================================================ */
  const zoomOverlay = document.getElementById("zoomOverlay");
  const zoomViewport = document.getElementById("zoomViewport");
  const zoomImg = document.getElementById("zoomImg");
  const zoomLoading = document.getElementById("zoomLoading");
  const zoomIndic = document.getElementById("zoomIndicator");
  const zoomPrev = document.getElementById("zoomPrev");
  const zoomNext = document.getElementById("zoomNext");
  const zoomClose = document.getElementById("zoomClose");

  let zoomOpen = false;
  let zoomPageNum = 1;            // 1-basiert
  let zoomRenderToken = 0;
  // Transform-Zustand
  let baseW = 0, baseH = 0, scale = 1, tx = 0, ty = 0;
  const MIN_SCALE = 1, MAX_SCALE = 6;
  const pointers = new Map();
  let pinchStart = null;
  let lastTapTime = 0, lastTapX = 0, lastTapY = 0;

  if (zoomClose) zoomClose.addEventListener("click", closeZoom);
  if (zoomPrev) zoomPrev.addEventListener("click", () => zoomStep(-1));
  if (zoomNext) zoomNext.addEventListener("click", () => zoomStep(1));

  if (zoomViewport) {
    zoomViewport.addEventListener("pointerdown", onPointerDown);
    zoomViewport.addEventListener("pointermove", onPointerMove);
    zoomViewport.addEventListener("pointerup", onPointerUp);
    zoomViewport.addEventListener("pointercancel", onPointerUp);
    zoomViewport.addEventListener("pointerleave", onPointerUp);
    // natives Doppeltipp-Zoom des Browsers unterdrücken (wir machen es selbst)
    zoomViewport.addEventListener("dblclick", (e) => { e.preventDefault(); toggleDoubleZoom(e.clientX, e.clientY); });
  }

  async function openZoom(pageNum) {
    if (!currentPdf) return;
    let n = pageNum;
    if (!n && pageFlip) n = pageFlip.getCurrentPageIndex() + 1; // aktuelle Seite
    zoomPageNum = Math.min(Math.max(n || 1, 1), currentPageCount);

    zoomOpen = true;
    zoomOverlay.hidden = false;
    zoomOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("zoom-lock");
    await loadZoomPage();
  }

  function closeZoom() {
    zoomOpen = false;
    zoomOverlay.hidden = true;
    zoomOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("zoom-lock");
    pointers.clear(); pinchStart = null;
    // Blätterer an die zuletzt gelesene Seite setzen
    if (pageFlip) { try { pageFlip.turnToPage(zoomPageNum - 1); } catch (e) {} }
  }

  function zoomStep(dir) {
    const next = zoomPageNum + dir;
    if (next < 1 || next > currentPageCount) return;
    zoomPageNum = next;
    loadZoomPage();
  }

  async function loadZoomPage() {
    const token = ++zoomRenderToken;
    if (zoomIndic) zoomIndic.textContent = "Seite " + zoomPageNum + " / " + currentPageCount;
    if (zoomPrev) zoomPrev.disabled = zoomPageNum <= 1;
    if (zoomNext) zoomNext.disabled = zoomPageNum >= currentPageCount;
    if (zoomLoading) zoomLoading.hidden = false;
    if (zoomImg) zoomImg.style.visibility = "hidden";

    let url;
    try {
      url = await renderPageToImage(currentPdf, zoomPageNum, 2200); // hohe Auflösung
    } catch (e) {
      if (token !== zoomRenderToken) return;
      if (zoomLoading) zoomLoading.textContent = "Seite konnte nicht geladen werden.";
      return;
    }
    if (token !== zoomRenderToken || !zoomOpen) return;

    zoomImg.onload = () => {
      if (token !== zoomRenderToken) return;
      if (zoomLoading) zoomLoading.hidden = true;
      zoomImg.style.visibility = "visible";
      fitZoom();
    };
    zoomImg.src = url;
  }

  /* Bild einpassen (scale = 1 zeigt die ganze Seite) */
  function fitZoom() {
    const vpW = zoomViewport.clientWidth;
    const vpH = zoomViewport.clientHeight;
    const iw = zoomImg.naturalWidth || 1;
    const ih = zoomImg.naturalHeight || 1;
    const fit = Math.min(vpW / iw, vpH / ih);
    baseW = iw * fit;
    baseH = ih * fit;
    zoomImg.style.width = baseW + "px";
    zoomImg.style.height = baseH + "px";
    scale = 1;
    tx = (vpW - baseW) / 2;
    ty = (vpH - baseH) / 2;
    applyTransform();
  }

  function applyTransform() {
    clampTranslate();
    zoomImg.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
  }

  function clampTranslate() {
    const vpW = zoomViewport.clientWidth;
    const vpH = zoomViewport.clientHeight;
    const w = baseW * scale, h = baseH * scale;
    if (w <= vpW) { tx = (vpW - w) / 2; }
    else { tx = Math.min(0, Math.max(vpW - w, tx)); }
    if (h <= vpH) { ty = (vpH - h) / 2; }
    else { ty = Math.min(0, Math.max(vpH - h, ty)); }
  }

  function setScaleAround(px, py, newScale) {
    newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    // Bildpunkt unter (px,py) vor und nach dem Skalieren konstant halten
    const ix = (px - tx) / scale;
    const iy = (py - ty) / scale;
    scale = newScale;
    tx = px - ix * scale;
    ty = py - iy * scale;
    applyTransform();
  }

  function toggleDoubleZoom(clientX, clientY) {
    const r = zoomViewport.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    setScaleAround(px, py, scale > 1.2 ? 1 : 2.6);
  }

  function onPointerDown(e) {
    if (!zoomOpen) return;
    zoomViewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) startPinch();
  }

  function onPointerMove(e) {
    if (!zoomOpen || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2 && pinchStart) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const r = zoomViewport.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - r.left;
      const midY = (pts[0].y + pts[1].y) / 2 - r.top;
      setScaleAround(midX, midY, pinchStart.scale * (dist / pinchStart.dist));
    } else if (pointers.size === 1) {
      tx += e.clientX - prev.x;
      ty += e.clientY - prev.y;
      applyTransform();
    }
  }

  function onPointerUp(e) {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    try { zoomViewport.releasePointerCapture(e.pointerId); } catch (_) {}
    if (pointers.size < 2) pinchStart = null;

    // Doppeltipp erkennen (Touch)
    if (e.pointerType !== "mouse" && pointers.size === 0) {
      const now = Date.now();
      const moved = Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY);
      if (now - lastTapTime < 320 && moved < 30) {
        toggleDoubleZoom(e.clientX, e.clientY);
        lastTapTime = 0;
      } else {
        lastTapTime = now; lastTapX = e.clientX; lastTapY = e.clientY;
      }
    }
  }

  function startPinch() {
    const pts = [...pointers.values()];
    pinchStart = {
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
      scale: scale,
    };
  }

  window.addEventListener("resize", () => { if (zoomOpen && zoomImg.naturalWidth) fitZoom(); });

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
