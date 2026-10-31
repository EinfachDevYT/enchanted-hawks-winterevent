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
- Website: statische Dateien in `docs/`. Spiel-Server: `server/api.php` (PHP 8 + SQLite, über nginx/PHP-FPM unter `/api`). **Kein Node.js** auf dem Server. Deployment: `deploy/README.md`, Einrichtung des Spiel-Servers: `deploy/setup-backend.sh`.
- Alle Lösungen und Codes liegen nur auf dem Server (DB `/var/lib/winterevent/event.sqlite`, Einstellungen `/etc/winterevent/config.php`). Der Browser darf keine Lösungen bekommen – jede Spielaktion prüft der Server.
- Clubs legt die Eventleitung live im Admin-Bereich `/admin/` an.
- Testwerkzeug „Test: Lösung“ (nur für angemeldete Admins, Schalter „Testmodus“ im Admin-Bereich, Startwert `test_tools` in der Server-Konfiguration) ist **vorübergehend** und soll vor dem Event wieder raus.
- Live: https://winterevent.enchantedhawks.eu (Server von enchantedhawks.eu, Update per `deploy/update.sh`).
