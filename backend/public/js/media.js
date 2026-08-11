/* ============================================================
   Bilder: im Browser verkleinern, hochladen, auswaehlen
   ------------------------------------------------------------
   Die Verkleinerung passiert bewusst hier und nicht im Worker:
   sie spart Uebertragung, haelt die Seite schnell und bleibt
   unter dem Speicherlimit der Entwurfsdatenbank.
   ============================================================ */

import { api } from "./api.js";
import { clear, confirmDialog, dialog, el, field, formatBytes, input, toast } from "./ui.js";

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

/* ============================================================
   Kataloge (PDF)
   ------------------------------------------------------------
   Verwaltet werden hier nur die PDF-Dateien und kataloge/titel.json.
   Die Liste, durch die katalog.html blaettert (manifest.json),
   entsteht beim Veroeffentlichen aus genau diesen beiden Dingen —
   deshalb wird sie hier bewusst nicht geschrieben.
   ============================================================ */

/** Dateiname aufraeumen: Endung sicherstellen, unerlaubte Zeichen ersetzen. */
function katalogDateiname(eingabe) {
  const roh = String(eingabe || "").split(/[\\/]/).pop().trim();
  const ohneEndung = roh.replace(/\.pdf$/i, "");
  const sauber = ohneEndung
    .replace(/[^A-Za-z0-9 ._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .trim();
  return sauber ? `${sauber.slice(0, 110)}.pdf` : "";
}

/** Kleiner Knopf mit Symbol fuer die Zeilen der Katalogliste. */
function iconButton(label, symbol, onClick, extra = {}) {
  return el("button", { class: "btn btn-sm", type: "button", title: label, "aria-label": label, onClick, ...extra }, symbol);
}

/** Formular fuer Anzeigename und Dateiname eines Katalogs. */
function katalogFormular({ ueberschrift, titel, autoTitel, dateiname, hinweis }) {
  return dialog((body, close) => {
    const werte = { titel, dateiname };
    const speichern = () =>
      close({
        titel: werte.titel.trim(),
        dateiname: katalogDateiname(werte.dateiname),
      });

    const titelFeld = input(titel, (v) => (werte.titel = v), { maxlength: 120 });
    titelFeld.addEventListener("keydown", (e) => {
      if (e.key === "Enter") speichern();
    });

    body.append(
      el("h2", { text: ueberschrift }),
      field(
        "Anzeigename",
        titelFeld,
        autoTitel
          ? `Leer lassen für den Namen aus der Datei: „${autoTitel}“`
          : "Leer lassen – dann entsteht der Name aus dem Dateinamen."
      ),
      field(
        "Dateiname",
        input(dateiname, (v) => (werte.dateiname = v), { maxlength: 120 }),
        hinweis
      ),
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { class: "btn", type: "button", onClick: () => close(null) }, "Abbrechen"),
        el("button", { class: "btn btn-primary", type: "button", onClick: speichern }, "Speichern")
      )
    );
  });
}

export async function katalogManager() {
  return dialog(async (body, close) => {
    const list = el("ul", { class: "list-plain katalog-list" });
    /** Aktueller Stand aus dem Backend – auch die Grundlage fuer das Sortieren. */
    let files = [];
    let siteUrl = "";
    let busy = false;

    /** Eine Aktion ausfuehren und danach neu laden; Doppelklicks abfangen. */
    const run = async (aufgabe, meldung) => {
      if (busy) return;
      busy = true;
      try {
        await aufgabe();
        if (meldung) toast(meldung, "ok");
      } catch (err) {
        toast(err.message, "error");
      } finally {
        busy = false;
        await refresh();
      }
    };

    const zeile = (f, index) => {
      const kopf = el(
        "div",
        { class: "katalog-head" },
        el("strong", { text: f.title }),
        f.hidden ? el("span", { class: "badge", text: "ausgeblendet" }) : null
      );

      const meta = el("span", {
        class: "list-meta",
        text: `${f.name} · ${formatBytes(f.size)}`,
      });

      const aktionen = el(
        "div",
        { class: "katalog-actions" },
        iconButton("Nach oben", "↑", () => verschiebe(index, -1), { disabled: index === 0 }),
        iconButton("Nach unten", "↓", () => verschiebe(index, 1), { disabled: index === files.length - 1 }),
        el(
          "button",
          {
            class: "btn btn-sm",
            type: "button",
            title: f.hidden
              ? "Wieder auf der Katalogseite zeigen"
              : "Von der Katalogseite nehmen – die PDF bleibt erhalten",
            onClick: () =>
              run(
                () => api.updateKatalog(f.name, { hidden: !f.hidden }),
                f.hidden ? "Katalog wird wieder angezeigt." : "Katalog ausgeblendet."
              ),
          },
          f.hidden ? "Einblenden" : "Ausblenden"
        ),
        el("button", { class: "btn btn-sm", type: "button", onClick: () => bearbeite(f) }, "Umbenennen"),
        el(
          "button",
          {
            class: "btn btn-sm btn-danger",
            type: "button",
            onClick: async () => {
              const yes = await confirmDialog({
                title: "Katalog löschen?",
                text: `„${f.name}“ wird sofort aus der Website entfernt. Das lässt sich nur über Git rückgängig machen.`,
                confirmLabel: "Löschen",
                danger: true,
              });
              if (!yes) return;
              await run(() => api.deleteKatalog(f.name), "Katalog gelöscht. Die Seite aktualisiert sich in etwa einer Minute.");
            },
          },
          "Löschen"
        )
      );

      const link = siteUrl
        ? el("a", {
            class: "list-meta",
            href: `${siteUrl.replace(/\/+$/, "")}/katalog.html?katalog=${encodeURIComponent(f.id)}`,
            target: "_blank",
            rel: "noopener",
            text: "auf der Seite ansehen",
          })
        : null;

      return el("li", {}, kopf, el("div", { class: "katalog-meta" }, meta, link), aktionen);
    };

    const verschiebe = (index, richtung) => {
      const ziel = index + richtung;
      if (ziel < 0 || ziel >= files.length) return;
      const namen = files.map((f) => f.name);
      [namen[index], namen[ziel]] = [namen[ziel], namen[index]];
      return run(() => api.orderKataloge(namen), "Reihenfolge gespeichert.");
    };

    const bearbeite = async (f) => {
      const werte = await katalogFormular({
        ueberschrift: "Katalog umbenennen",
        titel: f.customTitle || "",
        autoTitel: f.autoTitle,
        dateiname: f.name,
        hinweis:
          "Achtung: Beim Umbenennen ändert sich auch der Direktlink zu diesem Katalog – " +
          "bereits geteilte Links funktionieren danach nicht mehr.",
      });
      if (!werte) return;
      if (!werte.dateiname) return toast("Der Dateiname darf nicht leer sein.", "error");

      const changes = {};
      if (werte.titel !== (f.customTitle || "")) changes.title = werte.titel;
      if (werte.dateiname !== f.name) changes.filename = werte.dateiname;
      if (!Object.keys(changes).length) return;

      await run(() => api.updateKatalog(f.name, changes), "Gespeichert. Die Seite aktualisiert sich in etwa einer Minute.");
    };

    const refresh = async () => {
      clear(list);
      let data;
      try {
        data = await api.listKataloge();
      } catch (err) {
        list.append(el("li", { text: err.message }));
        return;
      }
      files = data.files || [];
      siteUrl = data.siteUrl || "";

      if (!files.length) {
        list.append(el("li", { text: "Noch keine Kataloge vorhanden." }));
        return;
      }
      files.forEach((f, i) => list.append(zeile(f, i)));
    };

    const hochladen = async () => {
      const file = await pickFile("application/pdf");
      if (!file) return;

      const werte = await katalogFormular({
        ueberschrift: "Neuen Katalog hochladen",
        titel: "",
        autoTitel: "",
        dateiname: file.name,
        hinweis: "Bestimmt auch den Direktlink zu diesem Katalog.",
      });
      if (!werte) return;
      if (!werte.dateiname) return toast("Der Dateiname darf nicht leer sein.", "error");

      toast("Katalog wird hochgeladen – das kann bei großen PDFs etwas dauern …");
      await run(
        () => api.uploadKatalog(file, werte.dateiname, werte.titel),
        "Katalog hochgeladen. Die Seite aktualisiert sich in etwa einer Minute."
      );
    };

    body.append(
      el("h2", { text: "Kataloge verwalten" }),
      el("p", {
        class: "auth-note",
        text:
          "PDF-Kataloge gehen sofort live – unabhängig von den übrigen Änderungen. " +
          "Die Reihenfolge hier ist auch die Reihenfolge auf der Katalogseite.",
      }),
      list,
      el(
        "div",
        { class: "dialog-actions" },
        el("button", { class: "btn", type: "button", onClick: () => close(true) }, "Schließen"),
        el("button", { class: "btn btn-primary", type: "button", onClick: hochladen }, "Katalog hochladen")
      )
    );

    await refresh();
  });
}
