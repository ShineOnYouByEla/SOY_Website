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
  let pageImages = [];        // Vorschau-Bilder der Seiten (für die Lupe)
  let isFlipping = false;     // gerade eine Blätter-Animation aktiv?

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
    pageFlip.on("changeState", (e) => {
      // Lupe nur im Ruhezustand zeigen, nicht während des Blätterns
      isFlipping = e && e.data && e.data !== "read";
      if (isFlipping) hideLens();
      updateIndicator(pageCount);
    });
    pageFlip.loadFromImages(images);

    pageImages = images;       // Bildquellen für die Lupe merken
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
    setMagnifier(false); // Lupe schließen, solange die Vollbild-Ansicht offen ist
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
    if (stageEl) stageEl.classList.toggle("lens-active", on);
    if (!on) hideLens();
  }

  function showLens() {
    if (!lensVisible) { ensureLensEl().classList.add("is-visible"); lensVisible = true; }
  }
  function hideLens() {
    if (lensVisible && lensEl) { lensEl.classList.remove("is-visible"); lensVisible = false; }
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
    const canvas = stageEl.querySelector("canvas.stf__canvas");
    if (!canvas) return null;

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

    const cr = canvas.getBoundingClientRect();
    const sx = cr.width / (canvas.width || cr.width);
    const sy = cr.height / (canvas.height || cr.height);
    const bookLeft = cr.left + rect.left * sx;
    const bookTop  = cr.top  + rect.top  * sy;
    const pw = rect.pageWidth * sx;
    const ph = rect.height * sy;

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
