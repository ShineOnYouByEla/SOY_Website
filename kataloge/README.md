# Kataloge

In diesem Ordner liegen die PDF-Kataloge, durch die auf der Seite
`katalog.html` geblättert werden kann.

## Neuen Katalog hinzufügen

1. **PDF hierher legen** – z. B. `fruehjahr-2026.pdf` in diesen Ordner `kataloge/`.
2. **Eintrag ergänzen** in der Datei `js/katalog.js` ganz oben im Array `KATALOGE`:

   ```js
   const KATALOGE = [
     { id: "fruehjahr-2026", titel: "Frühjahr 2026", datei: "kataloge/fruehjahr-2026.pdf" },
     { id: "wellness",       titel: "Wellness",      datei: "kataloge/wellness.pdf" },
   ];
   ```

   - `id`   = kurzer Name ohne Leer-/Sonderzeichen (wird auch im Link `?katalog=…` verwendet)
   - `titel` = Anzeigename in der Auswahl auf der Seite
   - `datei` = Pfad zur PDF-Datei

3. **Speichern & hochladen** (committen/pushen). Fertig.

Sind mehrere Kataloge eingetragen, erscheint oben automatisch eine Auswahl.
Ein einzelner Katalog wird direkt angezeigt.

## Katalog austauschen

Einfach die PDF-Datei mit gleichem Namen ersetzen – oder eine neue Datei
ablegen und den Pfad im Eintrag anpassen.

## Direkt zu einem Katalog verlinken

`katalog.html?katalog=wellness` öffnet direkt den Katalog mit der `id` „wellness".

## Hinweise

- Der Bereich ist **nicht indexiert** (taucht nicht bei Google auf) und ist
  nicht im Menü verlinkt – erreichbar nur über den direkten Link.
- Die Datei `beispiel-katalog.pdf` ist nur ein Platzhalter zum Ausprobieren
  und kann gelöscht werden (dann den `beispiel`-Eintrag in `js/katalog.js`
  ebenfalls entfernen).
- Für flüssiges Blättern sind PDFs bis ~30–40 Seiten ideal. Sehr große
  Dateien brauchen beim ersten Laden etwas länger.
