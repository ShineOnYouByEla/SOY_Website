/* ============================================================
   Bilder: im Browser verkleinern, hochladen, auswaehlen
   ------------------------------------------------------------
   Die Verkleinerung passiert bewusst hier und nicht im Worker:
   sie spart Uebertragung, haelt die Seite schnell und bleibt
   unter dem Speicherlimit der Entwurfsdatenbank.
   ============================================================ */

import { api } from "./api.js";
import { $, clear, dialog, el, formatBytes, toast } from "./ui.js";

/* Breiter als das braucht die Seite nirgends – auch nicht auf Retina-Displays. */
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1920;
const QUALITY = 0.85;

/**
 * Verkleinert ein Bild und wandelt es nach WebP.
 * SVGs bleiben unangetastet – die sind bereits klein und skalieren beliebig.
 * @returns {Promise<{file: File, name: string, width: number, height: number}>}
 */
export async function prepareImage(file) {
  const baseName = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

  if (file.type === "image/svg+xml") {
    return { file, name: `${baseName || "bild"}.svg`, width: 0, height: 0 };
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("Diese Datei konnte nicht als Bild gelesen werden.");

  const scale = Math.min(1, MAX_WIDTH / bitmap.width, MAX_HEIGHT / bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
  if (!blob) throw new Error("Das Bild konnte nicht umgewandelt werden.");

  const name = `${baseName || "bild"}.webp`;
  return { file: new File([blob], name, { type: "image/webp" }), name, width, height };
}

/** Datei auswaehlen lassen. */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const picker = el("input", { type: "file", accept, style: "display:none" });
    picker.addEventListener("change", () => {
      resolve(picker.files?.[0] || null);
      picker.remove();
    });
    document.body.append(picker);
    picker.click();
  });
}

/**
 * Kompletter Ablauf: auswaehlen, verkleinern, hochladen.
 * @returns {Promise<{src, width, height}|null>}
 */
export async function uploadNewImage() {
  const file = await pickFile("image/png,image/jpeg,image/webp,image/avif,image/svg+xml");
  if (!file) return null;

  try {
    const prepared = await prepareImage(file);
    const result = await api.uploadMedia(prepared.file, prepared.name);
    toast(`Bild hochgeladen (${formatBytes(result.size)}). Es geht beim Veröffentlichen mit live.`, "ok");
    return { src: result.path, width: prepared.width, height: prepared.height };
  } catch (err) {
    toast(err.message, "error");
    return null;
  }
}

/**
 * Auswahl aus bereits vorhandenen Bildern – oder ein neues hochladen.
 * @returns {Promise<{src, width, height}|null>}
 */
export async function chooseImage(siteUrl) {
  let data;
  try {
    data = await api.listMedia();
  } catch (err) {
    toast(err.message, "error");
    return null;
  }

  const base = String(data.siteUrl || siteUrl || "").replace(/\/+$/, "");
  const entries = [
    ...data.pending.map((p) => ({ ...p, pending: true })),
    ...data.live.filter((l) => !data.pending.some((p) => p.path === l.path)),
  ];

  return dialog((body, close) => {
    const grid = el("div", { class: "media-grid" });

    for (const entry of entries) {
      const url = entry.pending
        ? `/api/media/pending/${encodeURIComponent(entry.path)}`
        : `${base}/${entry.path}`;

      grid.append(
        el(
          "button",
          {
            type: "button",
            class: "media-tile",
            title: `${entry.path} · ${formatBytes(entry.size)}`,
            onClick: () => close({ src: entry.path, width: 0, height: 0 }),
          },
          el("span", { class: "media-tile-img", style: `background-image:url("${url}")` }),
          el("span", { class: "media-tile-name", text: entry.path.split("/").pop() }),
          entry.pending ? el("span", { class: "badge", text: "neu" }) : null
        )
      );
    }

    body.append(
      el("h2", { text: "Bild auswählen" }),
      entries.length
        ? grid
        : el("p", { class: "auth-note", text: "Es sind noch keine Bilder vorhanden." }),
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { class: "btn", type: "button", onClick: () => close(null) }, "Abbrechen"),
        el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onClick: async () => {
              const result = await uploadNewImage();
              if (result) close(result);
            },
          },
          "Neues Bild hochladen"
        )
      )
    );
  });
}

/* ---------- Kataloge ---------- */

export async function katalogManager() {
  return dialog(async (body, close) => {
    const list = el("ul", { class: "list-plain" });

    const refresh = async () => {
      clear(list);
      let data;
      try {
        data = await api.listKataloge();
      } catch (err) {
        list.append(el("li", { text: err.message }));
        return;
      }
      if (!data.files.length) {
        list.append(el("li", { text: "Noch keine Kataloge vorhanden." }));
        return;
      }
      for (const f of data.files) {
        list.append(
          el(
            "li",
            {},
            el(
              "span",
              {},
              el("strong", { text: f.title || f.name }),
              el("span", { class: "list-meta", text: ` ${f.name} · ${formatBytes(f.size)}` })
            ),
            el(
              "button",
              {
                class: "btn btn-sm btn-danger",
                type: "button",
                onClick: async () => {
                  const { confirmDialog } = await import("./ui.js");
                  const yes = await confirmDialog({
                    title: "Katalog löschen?",
                    text: `„${f.name}“ wird sofort aus der Website entfernt. Das lässt sich nur über Git rückgängig machen.`,
                    confirmLabel: "Löschen",
                    danger: true,
                  });
                  if (!yes) return;
                  try {
                    await api.deleteKatalog(f.name);
                    toast("Katalog gelöscht. Die Seite aktualisiert sich in etwa einer Minute.", "ok");
                    await refresh();
                  } catch (err) {
                    toast(err.message, "error");
                  }
                },
              },
              "Löschen"
            )
          )
        );
      }
    };

    body.append(
      el("h2", { text: "Kataloge verwalten" }),
      el("p", {
        class: "auth-note",
        text: "PDF-Kataloge gehen sofort live – unabhängig von den übrigen Änderungen.",
      }),
      list,
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { class: "btn", type: "button", onClick: () => close(true) }, "Schließen"),
        el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onClick: async () => {
              const file = await pickFile("application/pdf");
              if (!file) return;
              const title = prompt("Anzeigename für den Katalog (optional):", file.name.replace(/\.pdf$/i, ""));
              toast("Katalog wird hochgeladen …");
              try {
                await api.uploadKatalog(file, file.name, title || "");
                toast("Katalog hochgeladen. Die Seite aktualisiert sich in etwa einer Minute.", "ok");
                await refresh();
              } catch (err) {
                toast(err.message, "error");
              }
            },
          },
          "Katalog hochladen"
        )
      )
    );

    await refresh();
  });
}
