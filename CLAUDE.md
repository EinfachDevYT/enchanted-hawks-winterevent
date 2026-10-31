# Hinweise für Claude

## Kommunikation
- Immer auf **Deutsch** antworten.

## Git
- **Push immer als Force Push, ohne Rückfrage:** `git push --force-with-lease origin main`.
  Vorher `git fetch origin main` und Uploads des Nutzers übernehmen (er lädt z. B. `docs/data.js` über die GitHub-Weboberfläche hoch), damit nichts davon überschrieben wird.
- Commits laufen unter **EinfachDev** `<67544608+EinfachDevYT@users.noreply.github.com>`, unsigniert.
  Claude erscheint **nicht** als Autor oder Contributor: keine `Co-Authored-By: Claude`- und keine `Claude-Session`-Zeilen in Commit-Nachrichten.
- Commit-Nachrichten im Conventional-Commits-Format.

## Geheimnisse (öffentliches Repo!)
- Niemals committen: `config/event.json`, `CODES.md`, Generator-Sicherungen (`winterevent-sicherung-*.json`), `code-uebersicht*.html`.
- Keine Orte, Rätsellösungen oder Codes in Commit-Nachrichten oder im README.

## Projekt
- Statische Website in `docs/`. Auf dem Server läuft nur nginx, **kein Node.js**. Deployment: `deploy/README.md`.
- Live: https://winterevent.enchantedhawks.eu (Server von enchantedhawks.eu, Update per `deploy/update.sh`).
- Codes erzeugt die Eventleitung selbst mit `tools/code-generator.html` (Format v2: Ortsinfos nur verschlüsselt).
