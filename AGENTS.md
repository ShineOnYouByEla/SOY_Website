# AGENTS.md — Hinweise für KI-Agenten, die an diesem Repository arbeiten

Diese Website ist statisch und wird über GitHub Pages ausgeliefert. Wer hier etwas
ändert, sollte vorher drei Dinge wissen.

## 1. `content/site.json` ist die einzige Quelle

Aus dieser Datei entstehen beim Build:

| Erzeugt | Wodurch |
| --- | --- |
| `index.html` | `shared/render.mjs` |
| `js/config.js` | `shared/render.mjs` |
| `about.html`, `contact.html`, `privacy.html` | `shared/infopages.mjs` |
| `index.md`, `llms.txt`, `pricing.md`, `sitemap.xml`, `auth.md` | `shared/agents.mjs` |
| `.well-known/ard.json`, `.well-known/agent-skills/**` | `shared/agents.mjs` |

**Diese Dateien nie von Hand bearbeiten.** Änderungen gehören in
`content/site.json` (Inhalte) oder in die Renderer unter `shared/` (Struktur und
Fließtexte). Danach:

```bash
node scripts/build-site.mjs
```

Die CI prüft, dass ein erneuter Build nichts verändert und keine unversionierte
Datei zurücklässt. Ein Handgriff an `index.html` fliegt dort sofort auf.

Hand gepflegt und **nicht** erzeugt sind: `impressum.html`, `datenschutz.html`,
`katalog.html`, `404.html`, `robots.txt`, alles unter `css/`, `js/` und `assets/`.

## 2. Vor dem Commit laufen lassen

```bash
node scripts/build-site.mjs        # erzeugte Dateien aktualisieren
node scripts/check-jsonld.mjs      # strukturierte Daten
node scripts/check-links.mjs       # interne Verweise und Anker
npx html-validate@9 "*.html"       # HTML-Validierung
cd backend && npm ci && npm test   # Renderer- und Backend-Tests
```

Lighthouse läuft in der CI mit Mindestwerten (Performance, Accessibility,
Best Practices ≥ 0.9, SEO ≥ 0.95). Große Bilder, blockierende Skripte und
fehlende `alt`-Texte reißen die Schwelle.

Das Backend unter `backend/` ist ein Cloudflare Worker (Admin-Oberfläche zum
Pflegen der Inhalte). Es teilt sich die Renderer unter `shared/` mit dem
Build-Script — deshalb dürfen die dort **keine Node-APIs** benutzen. Wer einen
Renderer ändert, ändert damit auch, was der Admin veröffentlicht: die Dateiliste
in `backend/src/content.js` und der Test in `backend/test/content.test.mjs`
müssen mitziehen.

## 3. Keine Fassade für Agenten bauen

Die Seite trägt einiges an agentenlesbaren Dateien: `llms.txt`, `pricing.md`,
`auth.md`, einen ARD-Katalog, einen Agent-Skill und In-Page-Werkzeuge nach
WebMCP (`js/webmcp.js`). Alle beschreiben, was es wirklich gibt.

Was es **nicht** gibt und was deshalb auch nicht behauptet werden darf:

- keine REST- oder GraphQL-API, kein öffentliches Entwicklerportal
- kein MCP-Server und keine A2A-Endpunkte
- kein OAuth und kein Autorisierungsserver — darum liegen unter `.well-known/`
  bewusst **keine** `oauth-protected-resource` (RFC 9728) und
  `oauth-authorization-server` (RFC 8414). Solche Dateien würden einen
  `identity_endpoint` versprechen, hinter dem nichts steht.
- keine Zahlungsabwicklung und keine agentischen Zahlungsprotokolle

Prüfwerkzeuge vergeben für solche Dateien Punkte. Das ist kein Grund, sie
anzulegen. `auth.md` erklärt stattdessen, warum sie fehlen.

Eine harte Grenze im Produktverhalten: **das Kontaktformular darf nicht
automatisiert abgeschickt werden.** Es verlangt eine Einwilligung nach DSGVO und
eine hCaptcha-Prüfung. Das WebMCP-Werkzeug `prefill_contact_form` füllt es aus
und hört dort auf — dabei bleibt es.

## Stil

- Kommentare und Commit-Nachrichten auf Deutsch, so wie der Bestand.
- Kommentare erklären das **Warum**, nicht das Was.
- Inhaltliche Angaben (Preise, Prämien, Produktaussagen) kommen von proWIN
  International. Diese Seite ist ein unabhängiges Angebot einer selbstständigen
  Vertriebspartnerin — nichts erfinden, im Zweifel die Betreiberin fragen.
