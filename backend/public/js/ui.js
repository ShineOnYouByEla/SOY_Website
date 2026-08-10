/* ============================================================
   Kleine UI-Helfer: Elemente bauen, Meldungen, Dialoge
   ============================================================ */

/**
 * Baut ein Element.
 * el("div", { class: "x" }, "Text", el("b", {}, "fett"))
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ---------- Kurzmeldung ---------- */

let toastTimer = null;

export function toast(message, kind = "") {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast${kind ? ` is-${kind}` : ""}`;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (node.hidden = true), kind === "error" ? 7000 : 3500);
}

/* ---------- Dialoge ---------- */

/** Zeigt einen Dialog. `build` bekommt close(result) und fuellt den Inhalt. */
export function dialog(build) {
  const dlg = $("#dialog");
  const body = clear($("#dialogBody"));

  return new Promise((resolve) => {
    let settled = false;
    const close = (result) => {
      if (settled) return;
      settled = true;
      dlg.close();
      resolve(result);
    };
    dlg.addEventListener("close", () => close(undefined), { once: true });
    build(body, close);
    dlg.showModal();
  });
}

/** Ja/Nein-Rueckfrage. */
export function confirmDialog({ title, text, confirmLabel = "Ja", danger = false }) {
  return dialog((body, close) => {
    body.append(
      el("h2", { text: title }),
      el("p", { text, class: "auth-note" }),
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { class: "btn", type: "button", onClick: () => close(false) }, "Abbrechen"),
        el(
          "button",
          {
            class: `btn ${danger ? "btn-danger" : "btn-primary"}`,
            type: "button",
            onClick: () => close(true),
          },
          confirmLabel
        )
      )
    );
  });
}

/** Fehlerliste aus der Inhaltspruefung anzeigen. */
export function errorBox(title, errors) {
  return el(
    "div",
    { class: "errors" },
    el("strong", { text: title }),
    el("ul", {}, ...errors.map((e) => el("li", { text: e })))
  );
}

/* ---------- Formulare ---------- */

/** Beschriftetes Eingabefeld. */
export function field(label, control, note) {
  const id = control.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  control.id = id;
  return el(
    "div",
    { class: "field" },
    el("label", { for: id, text: label }),
    control,
    note ? el("p", { class: "field-note", text: note }) : null
  );
}

export function input(value, onInput, attrs = {}) {
  const node = el("input", { type: "text", ...attrs });
  node.value = value ?? "";
  node.addEventListener("input", () => onInput(node.value));
  return node;
}

export function textarea(value, onInput, attrs = {}) {
  const node = el("textarea", { rows: 4, ...attrs });
  node.value = value ?? "";
  node.addEventListener("input", () => onInput(node.value));
  return node;
}

export function select(value, options, onChange, attrs = {}) {
  const node = el("select", attrs);
  for (const opt of options) {
    const o = el("option", { value: opt.value, text: opt.label });
    if (String(opt.value) === String(value)) o.selected = true;
    node.append(o);
  }
  node.addEventListener("change", () => onChange(node.value));
  return node;
}

export function checkbox(label, checked, onChange) {
  const box = el("input", { type: "checkbox" });
  box.checked = Boolean(checked);
  box.addEventListener("change", () => onChange(box.checked));
  return el("label", { class: "check" }, box, el("span", { text: label }));
}

/**
 * Text in die Zwischenablage legen.
 * navigator.clipboard gibt es nur in einem "sicheren Kontext" — ueber http
 * im Heimnetz also nicht. Dann faellt die Funktion auf den alten Weg ueber
 * ein unsichtbares Textfeld zurueck.
 * @returns {Promise<boolean>}
 */
export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* z. B. abgelehnte Berechtigung – unten weiterversuchen */
    }
  }

  const helper = el("textarea", {
    readonly: true,
    style: "position:fixed; top:-1000px; left:-1000px; opacity:0",
  });
  helper.value = text;
  document.body.append(helper);
  helper.select();
  helper.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  helper.remove();
  return ok;
}

/** Datumsformat fuer Anzeigen. */
export function formatDate(value) {
  if (!value) return "";
  const d = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

export function formatBytes(n) {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
