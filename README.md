# ❄️ Schnitzeljagd durch Jorvik – Enchanted Hawks Winterevent

Interaktive Vollbild-Website für die Winter-Schnitzeljagd der Enchanted Hawks.
Jedes Team spielt mit **eigenen Codes** in seinem eigenen Tempo. Gelöste Rätsel öffnen einen **3D-Tresor**, der den Ortscode für die nächste Station verrät.

Sechs Stationen mit Rätseln und Minispielen (Memory, Suchbild, Buchstabensalat, Schiebepuzzle). Die Route bleibt geheim: Jeder Ort wird erst sichtbar, wenn der Tresor davor geöffnet ist.

## So läuft es für die Teams

1. Das Team bekommt per DM seinen **Startcode** (`HAWK-…`) und gibt ihn auf der Website ein.
2. An jeder Station gibt es ein Rätsel oder Minispiel. Die Lösung ist der **Tresorcode**.
3. Der Tresor öffnet sich und zeigt den **Ortscode** für den nächsten Ort.
4. Das Team reitet im Spiel dorthin und schaltet den Ort mit dem Ortscode frei.
5. Am Ziel gibt es einen **Zielcode**. Den schickt das Team per DM an die Eventleitung. Die ersten 3 gewinnen.

Der Fortschritt wird im Browser gespeichert. Auf einem anderen Gerät genügt der **zuletzt erhaltene Ortscode**, um weiterzuspielen.

## 🔒 Sicherheit (öffentliches Repo!)

- `config/event.json` (alle Codes und Lösungen) und `CODES.md` (Übersicht für die Eventleitung) stehen in `.gitignore` und dürfen **niemals** committet werden.
- Die Website (`docs/data.js`) enthält nur **verschlüsselte** Daten, auch Namen, Texte und Kartenpositionen der Orte. Öffentlich ist nur die Anzahl der Stationen (AES-GCM, Schlüssel per PBKDF2 aus dem jeweiligen Code). Ohne den passenden Code lässt sich nichts auslesen, auch nicht im Quelltext.
- Die Tresorcodes der Minispiele sind **pro Team unterschiedlich**. Abschreiben bei anderen Teams bringt also nichts.

## Codes erzeugen (Eventleitung)

Codes werden mit dem **Code-Generator** erstellt. Das ist eine einzelne HTML-Datei, die lokal im Browser läuft, ohne Node.js und ohne Kommandozeile. So könnt ihr Clubs auch erst kurz vor dem Event eintragen.

1. [`tools/code-generator.html`](tools/code-generator.html) herunterladen (auf GitHub: Datei öffnen → *Download raw file*) und per Doppelklick in Chrome, Edge oder Opera öffnen.
2. Einmalig die vier Zahlen für die erste Station eintragen.
3. **Clubname eingeben → Erstellen.** Der Startcode erscheint sofort, mit Buttons zum Kopieren des Codes oder eines fertigen DM-Texts.
4. **Website-Datei erzeugen.** Das lädt eine neue `data.js` herunter, die vorher automatisch geprüft wird.
5. Die `data.js` auf GitHub in den Ordner `docs/` hochladen (*Add file → Upload files → Commit*). Danach auf dem Server `sudo /var/www/enchanted-hawks-winterevent/deploy/update.sh` ausführen.
6. Erst **jetzt** die Startcodes per DM verschicken.

Später dazukommende Clubs einfach ergänzen und Schritt 4–5 wiederholen. Bestehende Codes und laufende Spiele bleiben gültig.
Der Generator merkt sich alles im Browser. Zusätzlich gibt es **Sicherung speichern**. Diese Datei enthält alle Lösungen und darf nie ins Repo.

> Alternative für die Kommandozeile: `node tools/build.mjs` liest `config/event.json` (Format wie die Sicherung des Generators).

### Modus der ersten Station

`morland.mode` in `config/event.json`:
- `ingame` (Standard): Die Teams bekommen die vier Zahlen im Spiel, z. B. von Eventleitern an den Orten.
- `web`: Die Teams tippen den erratenen Ort ein, und die Website verrät die Zahl.

### Karte anpassen

Die Position jeder Station steht in `stations[].map` (Pixel auf `docs/img/jorvik-karte.webp`, 1209 × 1180).
Die Position des Ziels auf der Detailkarte steht in `winterMap.tree`.

## Installation auf dem eigenen Server (nginx)

Die Website besteht nur aus statischen Dateien in `docs/`. Auf dem Server läuft **kein Node.js**, nginx liefert die Dateien direkt aus.
Fertige Konfiguration, Update-Skript und Schritt-für-Schritt-Anleitung (DNS, nginx, HTTPS mit Let's Encrypt): **[deploy/README.md](deploy/README.md)**

Lokal testen: `cd docs && python3 -m http.server 8000` → http://localhost:8000

## Technik

- Reines HTML/CSS/JS ohne Build-Schritt und ohne Server
- [Three.js](https://threejs.org) r169: 3D-Tresor und GPU-Schneefall
- [GSAP](https://gsap.com) 3.12: Animationen und Übergänge
- Beide Bibliotheken liegen lokal unter `docs/vendor/`.
- Berücksichtigt `prefers-reduced-motion`. Ohne WebGL greift ein einfacher Ersatz-Tresor.

---
Inoffizielles Fan-Event. Nicht mit Star Stable Entertainment verbunden. Die Karten-Screenshots stammen aus dem Spiel.
