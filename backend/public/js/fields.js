/* ============================================================
   Formularbaukasten
   ------------------------------------------------------------
   Aus einer Feldbeschreibung entsteht das Eingabeformular.
   Jede Aenderung schreibt direkt ins Inhaltsobjekt und meldet
   sich per onChange, damit Entwurf und Vorschau nachziehen.
   ============================================================ */

import { chooseImage } from "./media.js";
import { checkbox, el, field, input, select, textarea } from "./ui.js";

/* Wird beim Start aus /api/icons gefuellt. */
export let ICON_OPTIONS = [];
export function setIconOptions(list) {
  ICON_OPTIONS = list;
}

let siteUrl = "";
export function setSiteUrl(url) {
  siteUrl = url;
}

/* ---------- Einzelne Feldtypen ---------- */

function renderOne(desc, obj, onChange) {
  const value = obj?.[desc.k];
  const set = (v) => {
    obj[desc.k] = v;
    onChange();
  };

  switch (desc.type) {
    case "text":
      return field(desc.label, input(value, set, { placeholder: desc.placeholder || "" }), desc.note);

    case "longtext":
      return field(desc.label, textarea(value, set, { rows: desc.rows || 4 }), desc.note);

    /* Fliesstext mit erlaubtem <strong>, <em>, <br /> und <a href="…"> */
    case "rich":
      return field(
        desc.label,
        textarea(value, set, { rows: desc.rows || 5 }),
        desc.note || "Erlaubt: <strong>fett</strong>, <em>kursiv</em>, <br /> für einen Zeilenumbruch."
      );

    /* Liste einfacher Zeilen – eine Zeile je Eintrag */
    case "lines": {
      const node = textarea((value || []).join("\n"), (v) => {
        obj[desc.k] = v.split("\n").map((s) => s.trim()).filter(Boolean);
        onChange();
      }, { rows: desc.rows || 4 });
      return field(desc.label, node, desc.note || "Ein Eintrag je Zeile.");
    }

    case "number": {
      const node = input(value, (v) => set(v === "" ? undefined : Number(v)), { type: "number" });
      return field(desc.label, node, desc.note);
    }

    case "select":
      return field(desc.label, select(value ?? "", desc.options, (v) => set(v === "" ? undefined : v)), desc.note);

    case "icon":
      return field(
        desc.label,
        select(value ?? "", [{ value: "", label: "– kein Symbol –" }, ...ICON_OPTIONS], set),
        desc.note
      );

    case "checkbox":
      return checkbox(desc.label, value, set);

    case "image":
      return renderImage(desc, obj, onChange);

    case "list":
      return renderList(desc, obj, onChange);

    default:
      return el("p", { class: "field-note", text: `Unbekannter Feldtyp: ${desc.type}` });
  }
}

/* ---------- Bildfeld ---------- */

function renderImage(desc, obj, onChange) {
  const img = obj[desc.k] || (obj[desc.k] = { src: "", alt: "" });

  const thumb = el("div", { class: "media-thumb" });
  const paint = () => {
    const url = img.src?.startsWith("assets/")
      ? `${siteUrl.replace(/\/+$/, "")}/${img.src}`
      : img.src || "";
    thumb.style.backgroundImage = url ? `url("${url}")` : "none";
  };
  paint();

  const pathLabel = el("p", { class: "field-note", text: img.src || "kein Bild gewählt" });

  const replace = el(
    "button",
    {
      type: "button",
      class: "btn btn-sm",
      onClick: async () => {
        const picked = await chooseImage(siteUrl);
        if (!picked) return;
        img.src = picked.src;
        if (picked.width) {
          img.width = picked.width;
          img.height = picked.height;
        }
        pathLabel.textContent = img.src;
        // Neu hochgeladene Bilder liegen noch nicht auf der Live-Seite,
        // deshalb ueber das Backend anzeigen.
        thumb.style.backgroundImage = `url("/api/media/pending/${encodeURIComponent(img.src)}")`;
        setTimeout(paint, 50);
        onChange();
      },
    },
    "Bild wählen"
  );

  return el(
    "div",
    { class: "group" },
    el("h3", { text: desc.label }),
    el(
      "div",
      { class: "media-picker" },
      thumb,
      el(
        "div",
        { class: "media-fields" },
        field(
          "Alternativtext",
          input(img.alt, (v) => {
            img.alt = v;
            onChange();
          }),
          "Beschreibt das Bild für Screenreader und Suchmaschinen. Pflicht."
        ),
        pathLabel,
        el("div", { class: "row" }, replace)
      )
    )
  );
}

/* ---------- Wiederholbare Bloecke ---------- */

function renderList(desc, obj, onChange) {
  if (!Array.isArray(obj[desc.k])) obj[desc.k] = [];
  const items = obj[desc.k];

  const container = el("div", {});

  const rebuild = () => {
    container.replaceChildren(
      ...items.map((item, index) =>
        el(
          "div",
          { class: "item" },
          el(
            "div",
            { class: "item-head" },
            el("span", {
              class: "item-title",
              text: desc.itemLabel ? desc.itemLabel(item, index) : `${desc.singular || "Eintrag"} ${index + 1}`,
            }),
            el(
              "div",
              { class: "item-tools" },
              el("button", {
                type: "button",
                title: "Nach oben",
                disabled: index === 0,
                onClick: () => move(index, -1),
                text: "↑",
              }),
              el("button", {
                type: "button",
                title: "Nach unten",
                disabled: index === items.length - 1,
                onClick: () => move(index, 1),
                text: "↓",
              }),
              el("button", {
                type: "button",
                title: "Kopieren",
                onClick: () => {
                  items.splice(index + 1, 0, structuredClone(item));
                  rebuild();
                  onChange();
                },
                text: "⧉",
              }),
              el("button", {
                type: "button",
                title: "Entfernen",
                onClick: () => {
                  items.splice(index, 1);
                  rebuild();
                  onChange();
                },
                text: "✕",
              })
            )
          ),
          ...desc.item.map((sub) => renderOne(sub, item, () => {
            // Beschriftung mitziehen, wenn sich der Titel aendert.
            if (desc.itemLabel) rebuildLabels();
            onChange();
          }))
        )
      )
    );
  };

  const rebuildLabels = () => {
    container.querySelectorAll(".item-title").forEach((node, index) => {
      if (items[index]) node.textContent = desc.itemLabel(items[index], index);
    });
  };

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    rebuild();
    onChange();
  };

  rebuild();

  return el(
    "div",
    { class: "group" },
    el("h3", { text: desc.label }),
    desc.note ? el("p", { class: "field-note", text: desc.note }) : null,
    container,
    el(
      "button",
      {
        type: "button",
        class: "btn btn-sm",
        onClick: () => {
          items.push(desc.newItem ? desc.newItem() : {});
          rebuild();
          onChange();
        },
      },
      `+ ${desc.singular || "Eintrag"} hinzufügen`
    )
  );
}

/* ---------- Gruppe von Feldern ---------- */

/**
 * @param {Array} descs   Feldbeschreibungen
 * @param {object} obj    Datenobjekt, in das geschrieben wird
 * @param {Function} onChange
 */
export function renderFields(descs, obj, onChange) {
  const nodes = [];
  let run = [];

  // Aufeinanderfolgende einfache Felder landen in einem gemeinsamen Kasten,
  // Bilder und Listen bringen ihren eigenen mit. Die Reihenfolge bleibt.
  const flush = () => {
    if (!run.length) return;
    nodes.push(el("div", { class: "group" }, el("div", { class: "group-grid" }, ...run)));
    run = [];
  };

  for (const desc of descs) {
    if (desc.type === "image" || desc.type === "list") {
      flush();
      nodes.push(renderOne(desc, obj, onChange));
    } else {
      run.push(renderOne(desc, obj, onChange));
    }
  }
  flush();
  return nodes;
}
