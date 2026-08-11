# Kataloge

In diesem Ordner liegen die PDF-Kataloge, durch die auf der Seite
`katalog.html` geblättert werden kann.

## Am bequemsten: über das Admin

Im Admin unter **Dateien → Kataloge (PDF)** lässt sich alles erledigen:
hochladen, Anzeigename vergeben, Datei umbenennen, Reihenfolge festlegen,
vorübergehend ausblenden und löschen. Jede Änderung landet sofort als Commit
in diesem Ordner – die Seite aktualisiert sich danach in etwa einer Minute.

Wer lieber direkt im Repository arbeitet, findet unten alles Nötige.

## Neuen Katalog hinzufügen – so einfach geht's

**Einfach die PDF-Datei in diesen Ordner `kataloge/` hochladen. Fertig.**

Direkt auf GitHub:
1. Diesen Ordner `kataloge/` öffnen
2. **Add file → Upload files**
3. PDF hineinziehen und **Commit changes**

Beim nächsten Veröffentlichen wird die Katalog-Liste automatisch aus den
vorhandenen PDFs erzeugt – du musst **keinen Code mehr anpassen**. Sind
mehrere Kataloge vorhanden, erscheint oben automatisch eine Auswahl.

> Der Anzeigename wird automatisch aus dem Dateinamen abgeleitet
> (z. B. `fruehjahr-2026.pdf` → „Fruehjahr 2026"). Tipp: Dateien mit einer
> Zahl beginnen lassen (`01_…`, `02_…`), um die Reihenfolge zu bestimmen –
> die Zahl wird im Namen nicht angezeigt.

## Anzeigename, Reihenfolge, Ausblenden: `titel.json`

Alles, was nicht schon im Dateinamen steht, kommt in `titel.json`.
Schlüssel ist immer der Dateiname **ohne** `.pdf`:

```json
{
  "fruehjahr-2026": "Frühjahr 2026",
  "wellness": { "titel": "Wellness & Wohlbefinden", "position": 1 },
  "alter-flyer": { "versteckt": true }
}
```

| Angabe | Bedeutung |
|---|---|
| Text statt Objekt | Kurzform, wenn nur der Anzeigename abweicht |
| `titel` | Anzeigename (sonst aus dem Dateinamen abgeleitet) |
| `position` | Reihenfolge; kleinere Zahl zuerst. Kataloge ohne Angabe folgen dahinter, sortiert nach Dateinamen |
| `versteckt` | `true` blendet den Katalog aus, ohne die PDF zu löschen. Der Direktlink zur Datei funktioniert weiterhin |

Die Datei wird auch vom Admin geschrieben – deshalb verschwinden dort beim
Speichern Einträge zu Dateien, die es nicht mehr gibt.

## Katalog austauschen, umbenennen oder entfernen

- **Austauschen:** PDF mit gleichem Namen ersetzen.
- **Umbenennen:** Datei umbenennen und – falls vorhanden – den Schlüssel in
  `titel.json` mitziehen. Achtung: Damit ändert sich auch die `id` und
  bereits geteilte Direktlinks stimmen nicht mehr.
- **Entfernen:** PDF-Datei löschen (und – falls vorhanden – den Eintrag in
  `titel.json`). Der Katalog verschwindet beim nächsten Veröffentlichen.

## Direkt zu einem Katalog verlinken

Jeder Katalog bekommt automatisch eine `id` (aus dem Dateinamen).
`katalog.html?katalog=<id>` öffnet ihn direkt. Die `id`-Werte stehen in der
automatisch erzeugten Datei `manifest.json` – und im Admin hinter
„auf der Seite ansehen". Die `id` hängt nur am Dateinamen: Anzeigename und
Reihenfolge zu ändern lässt vorhandene Links also unberührt.

## Hinweise

- Der Bereich ist **nicht indexiert** (taucht nicht bei Google auf) und ist
  nicht im Menü verlinkt – erreichbar nur über den direkten Link.
- `manifest.json` wird beim Veröffentlichen **automatisch** aus den PDFs und
  `titel.json` erzeugt (`node scripts/build-katalog-manifest.mjs`) und muss
  nicht von Hand gepflegt werden.
- Für flüssiges Blättern sind PDFs bis ~30–40 Seiten ideal. Sehr große
  Dateien brauchen beim ersten Laden etwas länger. Über das Admin sind
  maximal 30 MB pro Datei möglich.
