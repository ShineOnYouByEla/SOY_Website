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

   ------------------------------------------------------------
   Wie die Seiten hierher kommen:

   Diese Datei rechnet nichts mehr aus PDFs aus. Das erledigt beim
   Veröffentlichen einmal scripts/build-katalog-seiten.mjs und legt fertige
   WebP-Bilder unter kataloge/seiten/<id>/ ab. Hier werden nur noch Bilder
   angezeigt – und zwar nur die, die gerade gebraucht werden.

   Der Grund: Auf einem Mittelklasse-Handy dauerte das Rechnen beim
   56-Seiten-Magazin rund 51 Sekunden, dazu 16 Sekunden für die 24 MB
   große PDF. Jetzt lädt die erste Seite als ~190 KB großes Bild.
   ============================================================ */
(function () {
  "use strict";

  if (typeof St === "undefined") {
    return showError("Die benötigte Bibliothek konnte nicht geladen werden.");
  }

  // Die Bühne (.catalog-stage) bleibt immer stehen und trägt die Bedienung.
  // Das #flipbook darin wird pro Katalog neu angelegt – siehe neueBuehne().
  const stageHost = document.querySelector(".catalog-stage");
  let   stageEl   = document.getElementById("flipbook");
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
  let currentKatalog = null;  // gerade gezeigter Eintrag aus dem Manifest
  let currentPageCount = 0;
  let currentRatio = 1;       // Seitenverhältnis (Breite/Höhe) der Katalogseiten
  let seitenImgs = [];        // die <img> der Seiten, Reihenfolge = Seitenfolge
  let isFlipping = false;     // gerade eine Blätter-Animation aktiv?

  /* Nicht alle Seiten auf einmal laden: Beim Magazin wären das 56 Bilder
     und rund 10 MB, von denen man die meisten nie ansieht. Geladen wird ein
     Fenster um die aktuelle Seite – nach vorn großzügiger, weil dorthin
     geblättert wird. */
  const VORLAUF_VOR     = 5;
  const VORLAUF_ZURUECK = 2;

  /* ---- Steuerung verdrahten (unabhängig von den Daten) ---- */
  if (prevBtn) prevBtn.addEventListener("click", () => pageFlip && pageFlip.flipPrev());
  if (nextBtn) nextBtn.addEventListener("click", () => pageFlip && pageFlip.flipNext());
  if (zoomBtn) zoomBtn.addEventListener("click", () => openZoom());
  // Doppeltipp/Doppelklick auf die Seite öffnet ebenfalls die Zoom-Ansicht
  // Die Bedienung hängt an der Bühne, nicht am #flipbook: Letzteres wird bei
  // jedem Katalogwechsel ausgetauscht und würde seine Ereignisse verlieren.
  // „Gemeint ist das Buch“ prüfen wir über das aktuelle #flipbook.
  const aufSeite = (e) => !!stageEl && stageEl.contains(e.target);

  if (stageHost) {
    stageHost.addEventListener("dblclick", (e) => { if (aufSeite(e)) openZoom(); });
    // Am Handy feuert kein dblclick – Doppeltipp selbst erkennen
    let tapTime = 0, tapX = 0, tapY = 0;
    stageHost.addEventListener("pointerup", (e) => {
      if (e.pointerType !== "touch" || !aufSeite(e)) return;
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
        KATALOGE = list.filter((k) => k && k.id);
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
     Katalog auswählen & aufbauen
     ============================================================ */
  function selectCatalog(id, updateUrl) {
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

    zeigeKatalog(katalog);
  }

  /**
   * Adresse eines Seitenbildes aus dem Muster im Manifest.
   * `{nnn}` ist die dreistellige Seitenzahl – siehe shared/kataloge.mjs.
   */
  function bildAdresse(muster, nummer) {
    if (!muster) return "";
    return encodeURI(String(muster).replace("{nnn}", String(nummer).padStart(3, "0")));
  }

  /* ============================================================
     Den Blätterer aufbauen. Das geht sofort: Seitenzahl und
     Seitenverhältnis stehen im Manifest, die Bilder kommen nach.
     ============================================================ */
  function zeigeKatalog(katalog) {
    setBusy(true);
    if (statusEl) statusEl.classList.remove("is-error");
    if (toolbarEl) toolbarEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;
    if (viewerEl) viewerEl.hidden = false;

    // alten Blätterer entfernen und eine frische Bühne einhängen
    neueBuehne();
    resetMagnifier();   // Lupen-Zwischenspeicher leeren, Lupe ausblenden

    const pageCount = Number(katalog.seiten);
    if (!katalog.bild || !Number.isFinite(pageCount) || pageCount < 1) {
      // Kein Seitenbild vorhanden: Der Katalog ist noch nicht aufbereitet.
      currentKatalog = null;
      currentPageCount = 0;
      return showError(
        'Der Katalog „' + (katalog.titel || katalog.id) + "“ wird gerade aufbereitet. " +
        "Bitte schau in ein paar Minuten noch einmal vorbei."
      );
    }

    currentKatalog = katalog;
    currentPageCount = pageCount;
    currentRatio = Number(katalog.ratio) > 0 ? Number(katalog.ratio) : 1 / Math.SQRT2;

    // Seiten als leere Blätter anlegen; die Bilder kommen über das Fenster
    seitenImgs = [];
    const blaetter = [];
    for (let i = 1; i <= pageCount; i++) blaetter.push(createPageElement(i));

    const baseH = 760;
    const baseW = Math.round(baseH * currentRatio);
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

    pageFlip.on("flip", () => { ladeUmgebung(); updateIndicator(pageCount); });
    pageFlip.on("changeState", (e) => {
      // Lupe nur im Ruhezustand zeigen, nicht während des Blätterns
      isFlipping = e && e.data && e.data !== "read";
      if (isFlipping) hideLens();
      ladeUmgebung();
      updateIndicator(pageCount);
    });
    // Wichtig für die Schärfe: die Seiten als echte <img>-Elemente einhängen
    // (loadFromHTML) statt sie von der Bibliothek auf ein Canvas zeichnen zu
    // lassen (loadFromImages). Das Canvas arbeitet nur in CSS-Pixeln und ist
    // dadurch auf Handys mit hoher Pixeldichte zwangsläufig unscharf – Bilder
    // skaliert der Browser dagegen in echter Geräteauflösung.
    pageFlip.loadFromHTML(blaetter);

    ladeUmgebung();
    updateIndicator(pageCount);
    setBusy(false);
    setStatus("");
    if (toolbarEl) toolbarEl.hidden = false;
  }

  /* Frisches #flipbook für den nächsten Katalog einhängen.

     Wichtig: destroy() der Blätter-Bibliothek räumt nicht nur auf, sondern
     nimmt auch den Container mit, den man ihr übergeben hat – das #flipbook
     ist danach nicht mehr im Dokument. Ohne diesen Neuaufbau würde der
     zweite Katalog in ein losgelöstes Element gezeichnet und die Bühne
     bliebe leer: Genau daran scheiterte bisher jeder Katalogwechsel. */
  function neueBuehne() {
    if (pageFlip) { try { pageFlip.destroy(); } catch (e) {} pageFlip = null; }
    if (stageEl) stageEl.remove();
    stageEl = document.createElement("div");
    stageEl.id = "flipbook";
    stageEl.className = "flipbook";
    if (stageHost) stageHost.appendChild(stageEl);
    seitenImgs = [];
    return stageEl;
  }

  /* Eine Katalogseite als Blätter-Element (weißes Blatt mit Bild) aufbauen.
     Das Bild bekommt seine Adresse erst, wenn die Seite in die Nähe der
     aktuellen rückt – siehe ladeUmgebung(). */
  function createPageElement(nummer) {
    const holder = document.createElement("div");
    holder.className = "flip-page";
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    holder.appendChild(img);
    seitenImgs[nummer - 1] = img;
    return holder;
  }

  /** Ein einzelnes Seitenbild anfordern (nur beim ersten Mal). */
  function ladeSeite(index) {
    const img = seitenImgs[index];
    if (!img || img.dataset.geholt || !currentKatalog) return;
    img.dataset.geholt = "1";
    img.src = bildAdresse(currentKatalog.bild, index + 1);
  }

  /** Die aktuelle Seite und ihre Nachbarn laden. */
  function ladeUmgebung() {
    if (!pageFlip || !currentPageCount) return;
    let mitte = 0;
    try { mitte = pageFlip.getCurrentPageIndex(); } catch (e) { mitte = 0; }
    const von = Math.max(0, mitte - VORLAUF_ZURUECK);
    const bis = Math.min(currentPageCount - 1, mitte + VORLAUF_VOR);
    for (let i = von; i <= bis; i++) ladeSeite(i);
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
     Vollbild-Ansicht: die Seite in der großen Fassung, zum
     Reinzoomen und Verschieben. Geblättert wird mit den Pfeilen,
     den Pfeiltasten oder per Wischen.
     ============================================================ */
  const zoomOverlay  = document.getElementById("zoomOverlay");
  const zoomViewport = document.getElementById("zoomViewport");
  const zoomStage    = document.getElementById("zoomStage");
  const zoomFlipEl   = document.getElementById("zoomFlip");
  const zoomLoading  = document.getElementById("zoomLoading");
  const zoomIndic    = document.getElementById("zoomIndicator");
  const zoomClose    = document.getElementById("zoomClose");
  // Blättern geht über zwei Wege: die Knöpfe in der oberen Leiste und die
  // Pfeile direkt links/rechts neben der Seite. Beide werden gleich behandelt.
  const zoomPrevBtns = ["zoomPrev", "zoomPrevSide"].map((id) => document.getElementById(id)).filter(Boolean);
  const zoomNextBtns = ["zoomNext", "zoomNextSide"].map((id) => document.getElementById(id)).filter(Boolean);

  let zoomOpen = false;
  let zoomIndex = 0;              // aktuell gezeigte Seite (0-basiert)
  let zoomImgEl = null;           // <img> mit der aktuellen Seite in großer Fassung
  const Z_MIN = 1, Z_MAX = 4;     // Zoom-Grenzen der Vollbild-Bühne
  let zScale = 1, ztx = 0, zty = 0;
  const zPointers = new Map();
  let zPinch = null;
  let zDown = null;               // Start eines Einzelzeigers (Wischen/Tippen)
  let zLastTapTime = 0, zLastTapX = 0, zLastTapY = 0;

  if (zoomClose) zoomClose.addEventListener("click", closeZoom);
  zoomPrevBtns.forEach((b) => wireZoomFlipButton(b, -1));
  zoomNextBtns.forEach((b) => wireZoomFlipButton(b, 1));

  /* Blätter-Knopf verdrahten. Die Pfeile neben der Seite liegen innerhalb der
     Vollbild-Bühne – ihr pointerdown darf dort nicht als Wischen/Ziehen
     ankommen, sonst schluckt die Zeigererfassung der Bühne den Klick. */
  function wireZoomFlipButton(btn, dir) {
    btn.addEventListener("click", () => zoomFlip(dir));
    btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

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
    if (zoomOpen || !currentKatalog || !currentPageCount) return;
    hideLens(); // Lupe ausblenden, solange die Vollbild-Ansicht offen ist
    let n = pageNum;
    if (!n && pageFlip) n = pageFlip.getCurrentPageIndex() + 1; // aktuelle Seite
    zoomIndex = Math.min(Math.max((n || 1) - 1, 0), currentPageCount - 1);

    zoomOpen = true;
    zoomOverlay.hidden = false;
    zoomOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("zoom-lock");

    // <img> für die große Seite anlegen (einmalig)
    if (zoomFlipEl) {
      zoomFlipEl.innerHTML = "";
      zoomImgEl = document.createElement("img");
      zoomImgEl.className = "zoom-page";
      zoomImgEl.alt = "";
      zoomImgEl.decoding = "async";
      zoomImgEl.addEventListener("load", () => {
        if (zoomLoading) zoomLoading.hidden = true;
        placeZoomSideArrows();   // Pfeile an die Seitenkanten setzen
      });
      zoomImgEl.addEventListener("error", () => {
        if (zoomLoading) { zoomLoading.hidden = false; zoomLoading.textContent = "Seite konnte nicht geladen werden."; }
      });
      zoomFlipEl.appendChild(zoomImgEl);
    }
    showZoomPage(zoomIndex);
  }

  /* Eine Seite in der großen Fassung anzeigen. Um das Zwischenspeichern
     kümmert sich der Browser – es sind ganz normale Bilder. */
  function showZoomPage(idx) {
    if (!currentKatalog || !zoomImgEl) return;
    zoomIndex = Math.min(Math.max(idx, 0), currentPageCount - 1);
    resetZoomTransform();          // beim Seitenwechsel wieder die ganze Seite zeigen
    updateZoomIndicator();
    if (zoomLoading) { zoomLoading.hidden = false; zoomLoading.textContent = "Seite wird geladen …"; }

    zoomImgEl.src = bildAdresse(currentKatalog.bildGross, zoomIndex + 1);
    if (zoomImgEl.complete && zoomImgEl.naturalWidth > 0 && zoomLoading) zoomLoading.hidden = true;

    // nächste Seite im Hintergrund anstoßen
    if (zoomIndex + 1 < currentPageCount) {
      new Image().src = bildAdresse(currentKatalog.bildGross, zoomIndex + 2);
    }
  }

  function closeZoom() {
    if (!zoomOpen) return;
    zoomOpen = false;
    const idx = zoomIndex;
    zoomOverlay.hidden = true;
    zoomOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("zoom-lock");
    zPointers.clear(); zPinch = null; zDown = null;
    if (zoomViewport) zoomViewport.style.removeProperty("--zoom-side-x");
    if (zoomFlipEl) zoomFlipEl.innerHTML = "";
    zoomImgEl = null;
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
    zoomPrevBtns.forEach((b) => { b.disabled = zoomIndex <= 0; });
    zoomNextBtns.forEach((b) => { b.disabled = zoomIndex >= n - 1; });
  }

  /* Die Pfeile links/rechts sollen direkt an den Seitenkanten stehen – am
     Computer also nicht weit außen am Bildschirmrand, sondern dort, wo die
     Seite aufhört. Ist links und rechts kein Platz (Handy), bleiben sie mit
     kleinem Abstand am Rand und liegen leicht über der Seite. */
  function placeZoomSideArrows() {
    if (!zoomViewport || !zoomImgEl) return;
    const side = zoomViewport.querySelector(".zoom-side");
    if (!side) return;
    const vp = zoomViewport.getBoundingClientRect();
    const page = zoomImgEl.getBoundingClientRect();
    const free = Math.min(page.left - vp.left, vp.right - page.right); // Platz neben der Seite
    const x = Math.max(8, Math.round(free - side.offsetWidth - 14));
    zoomViewport.style.setProperty("--zoom-side-x", x + "px");
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
    resetZoomTransform();     // Seite wieder mittig einpassen
    placeZoomSideArrows();    // Pfeile neben die neu eingepasste Seite setzen
  });

  /* ============================================================
     Lupe: eine runde Vergrößerung, die man mit der Maus über den
     Katalog bewegt. Der Blätter-Effekt bleibt dabei erhalten – die
     Lupe schwebt einfach über dem laufenden Blätterer.
     (Nur an Geräten mit Maus/Trackpad sinnvoll – am Handy bleibt die
     Vollbild-Ansicht zum Zoomen.)
     ============================================================ */
  const LENS_SIZE = 240;       // Durchmesser der Lupe in Pixeln
  let   LENS_ZOOM = 2.2;       // Vergrößerungsfaktor (mit Mausrad änderbar)

  let magnifierOn = false;
  let lensVisible = false;
  let lastClient  = null;            // zuletzt bekannte Mausposition
  const lensGross = new Map();       // Seite (1-basiert) → große Bildadresse, sobald geladen
  let lensEl = null;

  // Lupe gibt es nur, wenn ein echter Zeiger (Maus/Trackpad) vorhanden ist
  const canHover = !!(window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches);

  if (magBtn) {
    if (!canHover || !stageHost) {
      magBtn.hidden = true;
    } else {
      magBtn.hidden = false;
      magBtn.addEventListener("click", () => setMagnifier(!magnifierOn));
      stageHost.addEventListener("pointermove", (e) => {
        if (magnifierOn && e.pointerType !== "touch") moveLens(e.clientX, e.clientY);
      });
      stageHost.addEventListener("pointerleave", hideLens);
      stageHost.addEventListener("wheel", (e) => {
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
    // (die Regel dazu hängt am .catalog-stage, siehe css/katalog.css)
    if (stageHost) stageHost.classList.add("lens-show");
  }
  function hideLens() {
    if (lensVisible && lensEl) { lensEl.classList.remove("is-visible"); lensVisible = false; }
    if (stageHost) stageHost.classList.remove("lens-show");
  }

  function resetMagnifier() {
    lensGross.clear();
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
    const klein = seitenImgs[idx] && seitenImgs[idx].getAttribute("src");
    // Solange die große Fassung noch lädt, zeigt die Lupe die kleine
    const src = lensGross.get(info.pageNum) || klein;
    if (!src) { hideLens(); return; }
    ensureGross(info.pageNum); // größere Vorlage im Hintergrund holen

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

  /* Die große Fassung einer Seite holen – damit die Lupe so scharf ist wie
     die Vollbild-Ansicht. Erst wenn sie da ist, wird umgeschaltet. */
  function ensureGross(pageNum) {
    if (lensGross.has(pageNum) || !currentKatalog) return;
    lensGross.set(pageNum, null); // als „wird geholt“ markieren
    const katalog = currentKatalog;
    const url = bildAdresse(katalog.bildGross, pageNum);
    const img = new Image();
    img.addEventListener("load", () => {
      if (katalog !== currentKatalog) { lensGross.delete(pageNum); return; }
      lensGross.set(pageNum, url);
      // Wenn die Maus noch auf dieser Seite steht: schärfer nachziehen
      if (magnifierOn && lastClient) moveLens(lastClient.x, lastClient.y);
    });
    img.addEventListener("error", () => { lensGross.delete(pageNum); });
    img.src = url;
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
