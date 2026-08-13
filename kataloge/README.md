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

## Was beim Veröffentlichen mit den PDFs passiert

Auf der Seite selbst wird **keine PDF mehr geöffnet**. Beim Veröffentlichen
werden die Seiten einmal zu Bildern gerendert; die Besucher bekommen nur
noch diese Bilder – und davon nur die Seiten, die sie wirklich ansehen.

Vorher rechnete jedes Endgerät die Seiten selbst aus der PDF. Beim
56-Seiten-Magazin dauerte das auf einem Mittelklasse-Handy rund 51 Sekunden,
dazu 16 Sekunden für die 24 MB große Datei. Jetzt ist die erste Seite nach
etwa einer halben Sekunde da.

Zwei Schritte laufen dafür automatisch in GitHub Actions:

| Skript | Was es tut |
|---|---|
| `scripts/build-katalog-seiten.mjs` | rendert jede PDF-Seite nach `kataloge/seiten/<id>/` – einmal für die Buchansicht (1500 px) und einmal für Vollbild und Lupe (2400 px), beides als WebP |
| `scripts/build-katalog-manifest.mjs` | schreibt `manifest.json` mit Titeln, Reihenfolge, Seitenzahl und den Adressen der Bilder |

Der Ordner `kataloge/seiten/` liegt **nicht** im Repository – er entsteht beim
Veröffentlichen. Gerendert wird nur, was sich geändert hat: `info.json` merkt
sich den Hash der PDF, und GitHub Actions hebt die fertigen Seiten zwischen
zwei Läufen auf. Ein Deploy ohne neuen Katalog kostet dadurch nichts, ein
Katalog mit 56 Seiten etwa zwei Minuten.

### Lokal ausprobieren

```bash
npm ci --prefix scripts          # einmalig
node scripts/build-katalog-seiten.mjs
node scripts/build-katalog-manifest.mjs
```

Ohne diese beiden Schritte zeigt `katalog.html` den Hinweis, dass der Katalog
gerade aufbereitet wird. Mit `--force` wird alles neu gerendert, auch
Unverändertes.

## Hinweise

- Der Bereich ist **nicht indexiert** (taucht nicht bei Google auf) und ist
  nicht im Menü verlinkt – erreichbar nur über den direkten Link.
- `manifest.json` wird beim Veröffentlichen **automatisch** erzeugt und muss
  nicht von Hand gepflegt werden.
- Seitenzahl und Dateigröße sind für die Besucher inzwischen kaum noch
  spürbar – sie laden ja nur die Seiten, die sie ansehen. Lange Kataloge
  verlängern vor allem das Veröffentlichen. Über das Admin sind maximal
  30 MB pro Datei möglich.
