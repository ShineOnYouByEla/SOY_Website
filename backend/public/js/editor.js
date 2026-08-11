/* ============================================================
   Der Editor: Seitenleiste, Formulare, Entwurf und Vorschau
   ============================================================ */

import { api, ApiError } from "./api.js";
import { renderFields, setIconOptions, setSiteUrl } from "./fields.js";
import { katalogManager } from "./media.js";
import { SECTION_SCHEMA, SETTINGS_PANELS } from "./schema.js";
import {
  $,
  clear,
  confirmDialog,
  copyText,
  dialog,
  el,
  errorBox,
  field,
  formatDate,
  input,
  select,
  textarea,
  toast,
} from "./ui.js";

const state = {
  content: null,
  head: null,
  dirty: false,
  saving: false,
  /** Kennung des offenen Bereichs, z. B. "section:ueber" oder "settings:seo". */
  panel: null,
  siteUrl: "",
};

let saveTimer = null;
let previewTimer = null;

/* ============================================================
   Start
   ============================================================ */

export async function startEditor(user) {
  $("#topbarUser").textContent = user.email;

  // Zuerst die Werkzeugleiste: lassen sich die Inhalte nicht laden, muss das
  // Menü trotzdem erreichbar bleiben — sonst kommt man weder zum Abmelden
  // noch zur Benutzerverwaltung und sieht nur eine Meldung.
  bindToolbar();

  const [content, icons] = await Promise.all([api.getContent().catch((err) => err), loadIcons()]);
  setIconOptions(icons);

  if (content instanceof Error) {
    showLoadError(content);
    return;
  }

  state.content = content.content;
  state.head = content.head;
  state.siteUrl = content.siteUrl || "";
  setSiteUrl(state.siteUrl);

  const health = await api.health().catch(() => null);
  if (health?.siteUrl) {
    state.siteUrl = health.siteUrl;
    setSiteUrl(health.siteUrl);
  }
  if (health?.github?.error) {
    toast(`GitHub-Zugriff nicht möglich: ${health.github.error}`, "error");
  }

  setDirty(content.source === "draft");
  renderSidebar();
  openPanel(`section:${state.content.sections[0]?.id}`);
  refreshPreview();
}

/**
 * Die Inhalte fehlen — meist eine Frage der Konfiguration. Statt einer
 * verschwindenden Kurzmeldung bleibt die Ursache stehen, und über das Menü
 * kommt man weiterhin an Konto, Benutzer und Abmelden.
 */
function showLoadError(err) {
  const editor = clear($("#editor"));
  editor.append(
    el(
      "div",
      { class: "errors" },
      el("strong", { text: "Die Inhalte konnten nicht geladen werden." }),
      el("p", { text: err.message }),
      el("p", {
        class: "field-note",
        text:
          "Häufige Gründe: GITHUB_BRANCH zeigt auf einen Branch ohne content/site.json, " +
          "oder GITHUB_TOKEN fehlt bzw. ist abgelaufen. Das Menü oben rechts funktioniert weiterhin.",
      }),
      el(
        "div",
        { class: "row" },
        el("button", { class: "btn", type: "button", onClick: () => location.reload() }, "Erneut versuchen")
      )
    )
  );
  $("#btnSave").disabled = true;
  $("#btnPublish").disabled = true;
  $("#btnDiscard").disabled = true;
}

async function loadIcons() {
  try {
    const data = await fetch("/api/icons", { credentials: "same-origin" }).then((r) => r.json());
    return data.icons || [];
  } catch {
    return [];
  }
}

/* ============================================================
   Entwurfsstand
   ============================================================ */

function setDirty(value) {
  state.dirty = value;
  $("#draftBadge").hidden = !value;
  $("#btnDiscard").disabled = !value;
  $("#btnPublish").disabled = !value;
}

/** Nach jeder Aenderung: kurz warten, dann speichern und Vorschau erneuern. */
function markChanged() {
  setDirty(true);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft({ silent: true }), 1200);

  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 1600);
}

async function saveDraft({ silent = false } = {}) {
  if (state.saving) return false;
  state.saving = true;
  $("#btnSave").disabled = true;

  try {
    await api.saveDraft(state.content);
    setDirty(true);
    if (!silent) toast("Entwurf gespeichert.", "ok");
    showErrors(null);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.errors) {
      showErrors(err.errors);
      if (!silent) toast("Bitte zuerst die markierten Punkte korrigieren.", "error");
    } else {
      toast(err.message, "error");
    }
    return false;
  } finally {
    state.saving = false;
    $("#btnSave").disabled = false;
  }
}

function showErrors(errors) {
  const existing = $("#editorErrors");
  if (existing) existing.remove();
  if (!errors?.length) return;
  const box = errorBox("Diese Punkte verhindern das Veröffentlichen:", errors);
  box.id = "editorErrors";
  $("#editor").prepend(box);
}

function refreshPreview() {
  const frame = $("#previewFrame");
  // Cache-Buster, damit der Browser wirklich neu lädt.
  frame.src = `/api/preview?t=${Date.now()}`;
}

/* ============================================================
   Seitenleiste
   ============================================================ */

function renderSidebar() {
  const bar = clear($("#sidebar"));

  /* --- Bereiche der Seite --- */
  const sections = el("div", { class: "side-group" });
  sections.append(el("p", { class: "side-title", text: "Bereiche der Seite" }));

  state.content.sections.forEach((section, index) => {
    const hidden = section.enabled === false;
    const item = el("button", {
      type: "button",
      class: `side-item${state.panel === `section:${section.id}` ? " is-active" : ""}${hidden ? " is-hidden" : ""}`,
      draggable: "true",
      "data-index": String(index),
      onClick: () => openPanel(`section:${section.id}`),
    });

    item.append(
      el("span", { class: "side-drag", "aria-hidden": "true", text: "⠿" }),
      el("span", { class: "side-label", text: section.title || section.id }),
      el("span", {
        class: "side-toggle",
        role: "button",
        tabindex: "0",
        title: hidden ? "Bereich einblenden" : "Bereich ausblenden",
        text: hidden ? "🚫" : "👁",
        onClick: (e) => {
          e.stopPropagation();
          section.enabled = hidden;
          renderSidebar();
          markChanged();
        },
      })
    );

    attachDragHandlers(item, index);
    sections.append(item);
  });

  sections.append(
    el(
      "button",
      { type: "button", class: "side-item", onClick: addSection },
      el("span", { class: "side-label", text: "+ Bereich hinzufügen" })
    )
  );

  /* --- Einstellungen --- */
  const settings = el("div", { class: "side-group" });
  settings.append(el("p", { class: "side-title", text: "Einstellungen" }));
  for (const panel of SETTINGS_PANELS) {
    settings.append(
      el(
        "button",
        {
          type: "button",
          class: `side-item${state.panel === `settings:${panel.id}` ? " is-active" : ""}`,
          onClick: () => openPanel(`settings:${panel.id}`),
        },
        el("span", { class: "side-label", text: panel.title })
      )
    );
  }

  /* --- Dateien --- */
  const files = el("div", { class: "side-group" });
  files.append(
    el("p", { class: "side-title", text: "Dateien" }),
    el(
      "button",
      { type: "button", class: "side-item", onClick: katalogManager },
      el("span", { class: "side-label", text: "Kataloge (PDF)" })
    )
  );

  bar.append(sections, settings, files);
}

/* Reihenfolge per Ziehen aendern. */
let dragFrom = null;

function attachDragHandlers(item, index) {
  item.addEventListener("dragstart", (e) => {
    dragFrom = index;
    item.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    // Firefox startet das Ziehen sonst nicht.
    e.dataTransfer.setData("text/plain", String(index));
  });
  item.addEventListener("dragend", () => {
    dragFrom = null;
    item.classList.remove("is-dragging");
  });
  item.addEventListener("dragover", (e) => {
    if (dragFrom === null) return;
    e.preventDefault();
    item.classList.add("is-drop-target");
  });
  item.addEventListener("dragleave", () => item.classList.remove("is-drop-target"));
  item.addEventListener("drop", (e) => {
    e.preventDefault();
    item.classList.remove("is-drop-target");
    if (dragFrom === null || dragFrom === index) return;
    const list = state.content.sections;
    const [moved] = list.splice(dragFrom, 1);
    list.splice(index, 0, moved);
    dragFrom = null;
    renderSidebar();
    markChanged();
  });
}

async function addSection() {
  const result = await dialog((body, close) => {
    const draft = { type: "cards", title: "", id: "" };
    body.append(
      el("h2", { text: "Bereich hinzufügen" }),
      field(
        "Art des Bereichs",
        select("cards", Object.entries(SECTION_SCHEMA).filter(([t]) => t !== "hero").map(([value, s]) => ({ value, label: s.title })), (v) => (draft.type = v))
      ),
      field("Name in der Seitenleiste", input("", (v) => (draft.title = v))),
      field(
        "Kennung für den Sprunglink",
        input("", (v) => (draft.id = v)),
        "Kleinbuchstaben, Ziffern und Bindestriche. Wird zu #kennung in der Navigation."
      ),
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { class: "btn", type: "button", onClick: () => close(null) }, "Abbrechen"),
        el("button", { class: "btn btn-primary", type: "button", onClick: () => close(draft) }, "Hinzufügen")
      )
    );
  });

  if (!result) return;
  const id = result.id.trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]*$/.test(id)) return toast("Die Kennung ist ungültig.", "error");
  if (state.content.sections.some((s) => s.id === id)) return toast("Diese Kennung gibt es schon.", "error");

  state.content.sections.push({
    id,
    type: result.type,
    title: result.title.trim() || id,
    navLabel: result.title.trim() || id,
    enabled: true,
    data: emptyDataFor(result.type),
  });

  renderSidebar();
  openPanel(`section:${id}`);
  markChanged();
}

/* Sinnvoller Startinhalt, damit die Pruefung nicht sofort meckert. */
function emptyDataFor(type) {
  if (type === "cards") {
    return { kicker: "", heading: "Neue Überschrift", cards: [{ icon: "star", title: "Neue Karte", text: "" }] };
  }
  if (type === "about") {
    return {
      kicker: "",
      heading: "Neue Überschrift",
      image: { src: "assets/img/manuela.webp", alt: "Bitte Alternativtext ergänzen", width: 760, height: 1013 },
      paragraphs: ["Hier steht dein Text."],
    };
  }
  if (type === "flow") return { heading: "Neue Überschrift", blocks: [] };
  if (type === "booking") return { heading: "Beratungstermin vereinbaren", paragraphs: [], blocks: [] };
  if (type === "contact") {
    return {
      heading: "Kontakt",
      links: [{ kind: "email", icon: "mail" }],
      form: { reasons: ["Allgemeine Anfrage"], consent: "" },
    };
  }
  return {};
}

/* ============================================================
   Formularbereiche
   ============================================================ */

/**
 * Notbehelf für Bereiche, deren Typ diese Oberfläche nicht kennt.
 *
 * Der Grund ist fast immer derselbe: die Inhalte kommen live aus GitHub, die
 * Oberfläche dagegen steckt im Docker-Image. Kommt ein neuer Sektionstyp
 * dazu, kennt ein älteres Image ihn noch nicht. Früher stand hier nur „gibt
 * es keine Bearbeitung“ – Name, Sichtbarkeit und Löschen waren damit
 * ebenfalls blockiert. Jetzt bleibt der Rahmen bedienbar, und für den Notfall
 * lassen sich die Rohdaten bearbeiten.
 */
function unknownTypeNotice(section) {
  const hint = el("p", { class: "hint" });

  const box = textarea(JSON.stringify(section.data ?? {}, null, 2), (value) => {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      hint.textContent = "Noch kein gültiges JSON – die Eingabe wird nicht übernommen.";
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      hint.textContent = "Die Inhalte eines Bereichs müssen ein Objekt sein, also mit { beginnen.";
      return;
    }
    hint.textContent = "";
    section.data = parsed;
    markChanged();
  }, { rows: 18, class: "raw-json", spellcheck: "false" });

  return el(
    "div",
    { class: "group" },
    el(
      "div",
      { class: "notice" },
      el("strong", { text: `Diese Oberfläche kennt den Typ „${section.type}“ noch nicht.` }),
      el("p", {
        text:
          "Die Inhalte werden live aus GitHub gelesen, die Eingabemasken stecken dagegen " +
          "im Admin-Backend. Der Bereich ist also neuer als das laufende Backend. " +
          "Sobald das Image aus dem aktuellen Stand neu gebaut und der Container ersetzt " +
          "wurde, erscheint hier die passende Maske.",
      }),
      el("p", {
        class: "field-note",
        text: "Name, Navigation, Sichtbarkeit, Reihenfolge und Löschen funktionieren in der Zwischenzeit weiter.",
      })
    ),
    el(
      "details",
      { class: "raw-details" },
      el("summary", { text: "Rohdaten bearbeiten (nur im Notfall)" }),
      el("p", {
        class: "field-note",
        text: "Die Inhalte des Bereichs als JSON. Wird nur übernommen, solange die Schreibweise gültig ist.",
      }),
      box,
      hint
    )
  );
}

function openPanel(key) {
  state.panel = key;
  renderSidebar();

  const editor = clear($("#editor"));
  const [kind, id] = String(key).split(":");

  if (kind === "section") {
    const section = state.content.sections.find((s) => s.id === id);
    if (!section) return;
    const schema = SECTION_SCHEMA[section.type];

    editor.append(
      el(
        "div",
        { class: "editor-head" },
        el("h2", { text: section.title || section.id }),
        el("p", { text: schema ? schema.description : `Bereich vom Typ „${section.type}“.` })
      )
    );

    /* Rahmen des Bereichs: Name, Sprunglink, Sichtbarkeit */
    const meta = [
      { k: "title", label: "Name in der Seitenleiste", type: "text" },
      { k: "navLabel", label: "Beschriftung in der Navigation", type: "text", note: "Leer lassen, damit der Bereich nicht in der Navigation auftaucht." },
    ];
    editor.append(
      ...renderFields(meta, section, () => {
        renderSidebar();
        markChanged();
      })
    );

    if (schema) {
      /* Die eigentlichen Inhalte – ueber die Umwandlung des Schemas. */
      const formData = schema.toForm ? schema.toForm(section.data || {}) : { ...(section.data || {}) };
      const commit = () => {
        section.data = schema.fromForm ? schema.fromForm(formData) : formData;
        markChanged();
      };
      editor.append(...renderFields(schema.fields, formData, commit));
    } else {
      editor.append(unknownTypeNotice(section));
    }

    if (section.type !== "hero") {
      editor.append(
        el(
          "div",
          { class: "row" },
          el(
            "button",
            {
              type: "button",
              class: "btn btn-danger",
              onClick: async () => {
                const yes = await confirmDialog({
                  title: "Bereich löschen?",
                  text: `„${section.title || section.id}“ wird vollständig entfernt. Zum Ausblenden reicht das Auge-Symbol in der Seitenleiste.`,
                  confirmLabel: "Löschen",
                  danger: true,
                });
                if (!yes) return;
                state.content.sections = state.content.sections.filter((s) => s !== section);
                renderSidebar();
                openPanel(`section:${state.content.sections[0]?.id}`);
                markChanged();
              },
            },
            "Bereich löschen"
          )
        )
      );
    }
    return;
  }

  if (kind === "settings") {
    const panel = SETTINGS_PANELS.find((p) => p.id === id);
    if (!panel) return;

    editor.append(
      el("div", { class: "editor-head" }, el("h2", { text: panel.title }), el("p", { text: panel.description }))
    );

    if (!state.content[panel.path]) state.content[panel.path] = {};
    const target = state.content[panel.path];
    const formData = panel.toForm ? panel.toForm(target) : target;
    const commit = () => {
      if (panel.fromForm) state.content[panel.path] = panel.fromForm(formData);
      markChanged();
    };
    editor.append(...renderFields(panel.fields, formData, commit));
  }
}

/* ============================================================
   Werkzeugleiste
   ============================================================ */

let toolbarBound = false;

function bindToolbar() {
  // Mehrfaches Binden wuerde jeden Klick doppelt ausloesen – das Menue
  // ginge dann auf und sofort wieder zu.
  if (toolbarBound) return;
  toolbarBound = true;

  $("#btnSave").addEventListener("click", () => saveDraft());
  $("#btnRefresh").addEventListener("click", refreshPreview);

  $("#btnDiscard").addEventListener("click", async () => {
    const yes = await confirmDialog({
      title: "Änderungen verwerfen?",
      text: "Der Entwurf wird gelöscht und die Seite zeigt wieder den veröffentlichten Stand. Das lässt sich nicht rückgängig machen.",
      confirmLabel: "Verwerfen",
      danger: true,
    });
    if (!yes) return;
    try {
      await api.discardDraft();
      const fresh = await api.getContent();
      state.content = fresh.content;
      state.head = fresh.head;
      setDirty(false);
      renderSidebar();
      openPanel(`section:${state.content.sections[0]?.id}`);
      refreshPreview();
      toast("Entwurf verworfen.", "ok");
    } catch (err) {
      toast(err.message, "error");
    }
  });

  $("#btnPublish").addEventListener("click", publish);

  /* Menue */
  const menu = $("#menu");
  $("#btnMenu").addEventListener("click", () => {
    menu.hidden = !menu.hidden;
    $("#btnMenu").setAttribute("aria-expanded", String(!menu.hidden));
  });
  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== $("#btnMenu")) menu.hidden = true;
  });
  menu.addEventListener("click", (e) => {
    const action = e.target.dataset?.menu;
    if (!action) return;
    menu.hidden = true;
    if (action === "logout") doLogout();
    if (action === "account") accountDialog();
    if (action === "users") usersDialog();
    if (action === "history") historyDialog();
    if (action === "audit") auditDialog();
  });

  /* Vorschaubreite */
  for (const btn of document.querySelectorAll(".preview-actions [data-width]")) {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preview-actions [data-width]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const width = Number(btn.dataset.width);
      $("#previewFrame").style.width = width ? `${width}px` : "100%";
    });
  }

  /* Strg/Cmd+S speichert. */
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveDraft();
    }
  });

  /* Vor dem Schliessen warnen, solange etwas ungespeichert ist. */
  window.addEventListener("beforeunload", (e) => {
    if (state.dirty && saveTimer) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

async function publish() {
  // Erst den aktuellen Stand sichern – sonst fehlt die letzte Eingabe.
  clearTimeout(saveTimer);
  if (!(await saveDraft({ silent: true }))) return;

  const message = await dialog((body, close) => {
    let text = "";
    body.append(
      el("h2", { text: "Änderungen veröffentlichen" }),
      el("p", {
        class: "auth-note",
        text: "Die Änderungen werden ins Repository übernommen. Die Live-Seite aktualisiert sich danach automatisch – das dauert etwa eine Minute.",
      }),
      field("Kurze Notiz (optional)", input("", (v) => (text = v)), "Erscheint als Beschreibung in der Änderungshistorie."),
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { class: "btn", type: "button", onClick: () => close(null) }, "Abbrechen"),
        el("button", { class: "btn btn-primary", type: "button", onClick: () => close(text || "") }, "Veröffentlichen")
      )
    );
  });

  if (message === null || message === undefined) return;

  $("#btnPublish").disabled = true;
  toast("Wird veröffentlicht …");
  try {
    const result = await api.publish(message, state.head);
    setDirty(false);
    state.head = result.commit.sha;
    toast("Veröffentlicht. Die Live-Seite ist in etwa einer Minute aktuell.", "ok");
    showErrors(null);
  } catch (err) {
    if (err instanceof ApiError && err.errors) {
      showErrors(err.errors);
      toast("Bitte zuerst die markierten Punkte korrigieren.", "error");
    } else {
      toast(err.message, "error");
    }
    $("#btnPublish").disabled = false;
  }
}

async function doLogout() {
  try {
    await api.logout();
  } finally {
    location.reload();
  }
}

/* ============================================================
   Dialoge aus dem Menue
   ============================================================ */

function accountDialog() {
  return dialog((body, close) => {
    let current = "";
    let next = "";
    let repeat = "";
    const hint = el("p", { class: "hint" });

    body.append(
      el("h2", { text: "Konto & Sicherheit" }),
      field("Aktuelles Passwort", input("", (v) => (current = v), { type: "password", autocomplete: "current-password" })),
      field(
        "Neues Passwort",
        input("", (v) => (next = v), { type: "password", autocomplete: "new-password" }),
        "Mindestens 12 Zeichen, Groß- und Kleinbuchstaben sowie eine Ziffer."
      ),
      field("Neues Passwort wiederholen", input("", (v) => (repeat = v), { type: "password", autocomplete: "new-password" })),
      hint,
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { class: "btn", type: "button", onClick: () => close() }, "Schließen"),
        el(
          "button",
          {
            class: "btn",
            type: "button",
            onClick: async () => {
              const password = prompt("Zur Sicherheit: bitte das aktuelle Passwort eingeben.");
              if (!password) return;
              try {
                const res = await api.newRecoveryCodes(password);
                close();
                showRecoveryCodes(res.recoveryCodes);
              } catch (err) {
                hint.textContent = err.message;
              }
            },
          },
          "Neue Wiederherstellungscodes"
        ),
        el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onClick: async () => {
              if (next !== repeat) {
                hint.textContent = "Die beiden neuen Passwörter stimmen nicht überein.";
                return;
              }
              try {
                await api.changePassword(current, next);
                close();
                toast("Passwort geändert. Andere Geräte wurden abgemeldet.", "ok");
              } catch (err) {
                hint.textContent = err.message;
              }
            },
          },
          "Passwort ändern"
        )
      )
    );
  });
}

/** Wird auch nach der Ersteinrichtung aufgerufen. */
export function showRecoveryCodes(codes) {
  return dialog((body, close) => {
    body.append(
      el("h2", { text: "Neue Wiederherstellungscodes" }),
      el("p", {
        class: "auth-note",
        text: "Die alten Codes gelten nicht mehr. Bewahre diese hier sicher auf – jeder funktioniert genau einmal.",
      }),
      el("ul", { class: "codes" }, ...codes.map((c) => el("li", { text: c }))),
      el(
        "div",
        { class: "dialog-actions" },
        el(
          "button",
          {
            class: "btn",
            type: "button",
            onClick: async () => {
              const ok = await copyText(codes.join("\n"));
              toast(ok ? "Kopiert." : "Kopieren hat nicht geklappt – bitte abschreiben.", ok ? "ok" : "error");
            },
          },
          "Kopieren"
        ),
        el("button", { class: "btn btn-primary", type: "button", onClick: () => close() }, "Fertig")
      )
    );
  });
}

/** Benutzer und offene Einladungen verwalten. */
async function usersDialog() {
  return dialog(async (body, close) => {
    const list = el("ul", { class: "list-plain" });
    const hint = el("p", { class: "hint" });

    const refresh = async () => {
      clear(list);
      let data;
      try {
        data = await api.listUsers();
      } catch (err) {
        list.append(el("li", { text: err.message }));
        return;
      }

      for (const u of data.users) {
        const status = u.disabled
          ? "gesperrt"
          : u.totp_enabled
            ? `zuletzt angemeldet ${formatDate(u.last_login_at) || "nie"}`
            : "zweiter Faktor noch nicht eingerichtet";

        list.append(
          el(
            "li",
            {},
            el(
              "span",
              {},
              el("strong", { text: u.name || u.email }),
              el("span", { class: "list-meta", text: ` ${u.email} · ${status}${u.self ? " · das bist du" : ""}` })
            ),
            u.self
              ? el("span", { class: "list-meta", text: "—" })
              : el(
                  "span",
                  { class: "row" },
                  el(
                    "button",
                    {
                      class: "btn btn-sm",
                      type: "button",
                      onClick: async () => {
                        try {
                          await api.setUserDisabled(u.id, !u.disabled);
                          await refresh();
                        } catch (err) {
                          hint.textContent = err.message;
                        }
                      },
                    },
                    u.disabled ? "Entsperren" : "Sperren"
                  ),
                  el(
                    "button",
                    {
                      class: "btn btn-sm btn-danger",
                      type: "button",
                      onClick: async () => {
                        const yes = await confirmDialog({
                          title: "Konto löschen?",
                          text: `„${u.email}" wird endgültig entfernt – samt Sitzungen und Wiederherstellungscodes.`,
                          confirmLabel: "Löschen",
                          danger: true,
                        });
                        if (!yes) return;
                        try {
                          await api.deleteUser(u.id);
                          await refresh();
                        } catch (err) {
                          hint.textContent = err.message;
                        }
                      },
                    },
                    "Löschen"
                  )
                )
          )
        );
      }

      for (const i of data.invites) {
        list.append(
          el(
            "li",
            {},
            el(
              "span",
              {},
              el("strong", { text: i.email }),
              el("span", { class: "list-meta", text: ` eingeladen, gültig bis ${formatDate(i.expires_at)}` })
            ),
            el(
              "button",
              {
                class: "btn btn-sm btn-danger",
                type: "button",
                onClick: async () => {
                  try {
                    await api.revokeInvite(i.id);
                    await refresh();
                  } catch (err) {
                    hint.textContent = err.message;
                  }
                },
              },
              "Zurückziehen"
            )
          )
        );
      }
    };

    let email = "";
    body.append(
      el("h2", { text: "Benutzer & Zugänge" }),
      el("p", {
        class: "auth-note",
        text:
          "Neue Zugänge entstehen über einen Einladungslink. Die eingeladene Person " +
          "setzt ihr Passwort selbst und richtet danach die Zwei-Faktor-App ein – " +
          "so wandert nie ein Passwort durch einen Chat.",
      }),
      list,
      field("E-Mail einladen", input("", (v) => (email = v), { type: "email" })),
      hint,
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { class: "btn", type: "button", onClick: () => close() }, "Schließen"),
        el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onClick: async () => {
              hint.textContent = "";
              try {
                const res = await api.invite(email.trim());
                await refresh();
                showInviteLink(res);
              } catch (err) {
                hint.textContent = err.message;
              }
            },
          },
          "Einladen"
        )
      )
    );

    await refresh();
  });
}

/** Der Link wird genau einmal angezeigt – gespeichert ist nur sein Hash. */
function showInviteLink(invite) {
  return dialog((body, close) => {
    body.append(
      el("h2", { text: "Einladung erstellt" }),
      el("p", {
        class: "auth-note",
        text: `Diesen Link an ${invite.email} weitergeben. Er gilt bis ${formatDate(invite.expiresAt)}, funktioniert genau einmal und lässt sich später nicht noch einmal anzeigen.`,
      }),
      el("p", { class: "secret", text: invite.url }),
      el(
        "div",
        { class: "dialog-actions" },
        el(
          "button",
          {
            class: "btn",
            type: "button",
            onClick: async () => {
              const ok = await copyText(invite.url);
              toast(ok ? "Link kopiert." : "Kopieren hat nicht geklappt – bitte abschreiben.", ok ? "ok" : "error");
            },
          },
          "Kopieren"
        ),
        el("button", { class: "btn btn-primary", type: "button", onClick: () => close() }, "Fertig")
      )
    );
  });
}

async function historyDialog() {
  const data = await api.contentStatus().catch((err) => ({ error: err.message }));
  return dialog((body, close) => {
    body.append(el("h2", { text: "Verlauf" }));

    if (data.error) {
      body.append(el("p", { class: "hint", text: data.error }));
    } else {
      if (data.deploy) {
        const label =
          data.deploy.status === "completed"
            ? data.deploy.conclusion === "success"
              ? "Letzte Veröffentlichung erfolgreich"
              : "Letzte Veröffentlichung fehlgeschlagen"
            : "Veröffentlichung läuft gerade";
        body.append(el("p", { class: "auth-note", text: `${label} · ${formatDate(data.deploy.startedAt)}` }));
      }
      body.append(
        el(
          "ul",
          { class: "list-plain" },
          ...(data.history || []).map((h) =>
            el(
              "li",
              {},
              el("span", {}, el("strong", { text: h.message }), el("span", { class: "list-meta", text: ` ${h.author}` })),
              el("span", { class: "list-meta", text: formatDate(h.date) })
            )
          )
        )
      );
    }

    body.append(
      el("div", { class: "dialog-actions" }, el("button", { class: "btn btn-primary", type: "button", onClick: () => close() }, "Schließen"))
    );
  });
}

async function auditDialog() {
  const data = await api.audit().catch((err) => ({ error: err.message }));
  const LABELS = {
    login: "Anmeldung",
    login_failed: "Fehlgeschlagene Anmeldung",
    logout: "Abmeldung",
    mfa_failed: "Falscher Bestätigungscode",
    mfa_enabled: "Zweiter Faktor eingerichtet",
    recovery_used: "Wiederherstellungscode benutzt",
    recovery_failed: "Falscher Wiederherstellungscode",
    recovery_regenerated: "Neue Wiederherstellungscodes",
    password_changed: "Passwort geändert",
    publish: "Veröffentlicht",
    draft_discarded: "Entwurf verworfen",
    katalog_upload: "Katalog hochgeladen",
    katalog_delete: "Katalog gelöscht",
    setup: "Ersteinrichtung",
    invite_created: "Einladung erstellt",
    invite_accepted: "Einladung angenommen",
    invite_revoked: "Einladung zurückgezogen",
    user_disabled: "Konto gesperrt",
    user_enabled: "Konto entsperrt",
    user_deleted: "Konto gelöscht",
  };

  return dialog((body, close) => {
    body.append(el("h2", { text: "Protokoll" }));
    if (data.error) {
      body.append(el("p", { class: "hint", text: data.error }));
    } else {
      body.append(
        el(
          "ul",
          { class: "list-plain" },
          ...(data.entries || []).map((e) =>
            el(
              "li",
              {},
              el(
                "span",
                {},
                el("strong", { text: LABELS[e.action] || e.action }),
                el("span", { class: "list-meta", text: ` ${e.email || ""}${e.detail ? ` · ${e.detail}` : ""}` })
              ),
              el("span", { class: "list-meta", text: formatDate(e.at) })
            )
          )
        )
      );
    }
    body.append(
      el("div", { class: "dialog-actions" }, el("button", { class: "btn btn-primary", type: "button", onClick: () => close() }, "Schließen"))
    );
  });
}
