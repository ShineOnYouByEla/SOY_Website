# Kataloge

In diesem Ordner liegen die PDF-Kataloge, durch die auf der Seite
`katalog.html` geblättert werden kann.

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

## Schöneren Anzeigenamen vergeben (optional)

Wenn der automatische Name nicht passt (z. B. wegen Umlauten oder
Sonderzeichen), kann er in der Datei `titel.json` festgelegt werden.
Schlüssel ist der Dateiname **ohne** `.pdf`:

```json
{
  "fruehjahr-2026": "Frühjahr 2026",
  "wellness": "Wellness & Wohlbefinden"
}
```

## Katalog austauschen oder entfernen

- **Austauschen:** PDF mit gleichem Namen ersetzen.
- **Entfernen:** PDF-Datei löschen (und – falls vorhanden – den Eintrag in
  `titel.json`). Der Katalog verschwindet beim nächsten Veröffentlichen.

## Direkt zu einem Katalog verlinken

Jeder Katalog bekommt automatisch eine `id` (aus dem Dateinamen).
`katalog.html?katalog=<id>` öffnet ihn direkt. Die `id`-Werte stehen in der
automatisch erzeugten Datei `manifest.json`.

## Hinweise

- Der Bereich ist **nicht indexiert** (taucht nicht bei Google auf) und ist
  nicht im Menü verlinkt – erreichbar nur über den direkten Link.
- `manifest.json` wird **automatisch** erzeugt und muss nicht von Hand
  gepflegt werden.
- Die Datei `beispiel-katalog.pdf` ist nur ein Platzhalter zum Ausprobieren
  und kann gelöscht werden.
- Für flüssiges Blättern sind PDFs bis ~30–40 Seiten ideal. Sehr große
  Dateien brauchen beim ersten Laden etwas länger.
