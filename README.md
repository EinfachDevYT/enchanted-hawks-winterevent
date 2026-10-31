# ❄️ Schnitzeljagd durch Jorvik – Enchanted Hawks Winterevent

Interaktive Vollbild-Website für die Winter-Schnitzeljagd der Enchanted Hawks.
Jedes Team spielt mit **eigenen Codes** in seinem eigenen Tempo. Gelöste Rätsel öffnen einen **3D-Tresor**, der den Ortscode für die nächste Station verrät.

**Route:** Moorland (Code-Suche) → Doyles Abbey (Karten-Klick) → Silverglade Village (Screen-Detektiv) → Nilmers Hochland (Buchstabensalat) → Silverglade-Schloss (Schiebepuzzle) → Winterdorf (Ziel am Weihnachtsbaum)

## So läuft es für die Teams

1. Das Team bekommt per DM seinen **Startcode** (`HAWK-…`) und gibt ihn auf der Website ein.
2. An jeder Station gibt es ein Rätsel oder Minispiel. Die Lösung ist der **Tresorcode**.
3. Der Tresor öffnet sich und zeigt den **Ortscode** für den nächsten Ort.
4. Das Team reitet im Spiel dorthin und schaltet den Ort mit dem Ortscode frei.
5. Am Weihnachtsbaum im Winterdorf gibt es einen **Zielcode**. Den schickt das Team per DM an die Eventleitung. Die ersten 3 gewinnen.

Der Fortschritt wird im Browser gespeichert. Auf einem anderen Gerät genügt der **zuletzt erhaltene Ortscode**, um weiterzuspielen.

## 🔒 Sicherheit (öffentliches Repo!)

- `config/event.json` (alle Codes und Lösungen) und `CODES.md` (Übersicht für die Eventleitung) stehen in `.gitignore` und dürfen **niemals** committet werden.
- Die Website (`docs/data.js`) enthält nur **verschlüsselte** Daten (AES-GCM, Schlüssel per PBKDF2 aus dem jeweiligen Code). Ohne den passenden Code lässt sich nichts auslesen, auch nicht im Quelltext.
- Die Tresorcodes der Minispiele sind **pro Team unterschiedlich**. Abschreiben bei anderen Teams bringt also nichts.

## Codes erzeugen / ändern (Eventleitung)

Voraussetzung: Node.js 18+

```bash
cp config/event.example.json config/event.json   # nur beim allerersten Mal
# in config/event.json: Teamnamen, Texte und die vier Moorland-Zahlen eintragen
node tools/build.mjs                              # erzeugt docs/data.js + CODES.md
```

- Fehlende Codes werden automatisch ergänzt, vorhandene bleiben erhalten.
- `node tools/build.mjs --neu` würfelt **alle** Codes neu. Danach sind bereits verschickte DMs ungültig!
- Danach `docs/data.js` committen und pushen (nur diese Datei, nicht `config/event.json`).
- **Wichtig:** `config/event.json` sicher aufbewahren (z. B. privat in der Cloud). Ohne diese Datei lassen sich die bestehenden Codes nicht wiederherstellen.

### Moorland-Modus

`morland.mode` in `config/event.json`:
- `ingame` (Standard): Die Teams bekommen die vier Zahlen im Spiel, z. B. von Eventleitern an den Orten.
- `web`: Die Teams tippen den erratenen Ort ein, und die Website verrät die Zahl.

### Karte anpassen

Die Position jeder Station steht in `stations[].map` (Pixel auf `docs/img/jorvik-karte.webp`, 1209 × 1180).
**Nilmers Hochland ist geschätzt.** Bitte bei Bedarf anpassen. Die Position des Weihnachtsbaums steht in `winterMap.tree`.

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
