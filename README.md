# ❄️ Schnitzeljagd durch Jorvik – Enchanted Hawks Winterevent

Interaktive Vollbild-Website für die Winter-Schnitzeljagd der Enchanted Hawks.
Jeder Club spielt mit **eigenen Codes** in seinem eigenen Tempo. Gelöste Rätsel öffnen einen **3D-Tresor**, der den Ortscode für die nächste Station verrät.

Sechs Stationen mit Rätseln und Minispielen (Memory, Suchbild, Buchstabensalat, Schiebepuzzle). Die Route bleibt geheim: Jeder Ort wird erst sichtbar, wenn der Tresor davor geöffnet ist.

## So läuft es für die Teams

1. Der Club bekommt per DM seinen **Startcode** (`HAWK-…`) und gibt ihn auf der Website ein.
2. An jeder Station gibt es ein Rätsel oder Minispiel. Die Lösung ist der **Tresorcode**.
3. Der Tresor öffnet sich und verrät das **nächste Ziel**.
4. Das Team reitet im Spiel dorthin. Ein **Eventleiter oder Helfer vor Ort** bestätigt die Ankunft im Admin-Bereich, dann geht es auf der Website automatisch weiter.
5. Am Ziel gibt es einen **Zielcode** und die **Platzierung**. Die ersten drei Clubs gewinnen.

Der Spielstand liegt auf dem Server. Auf einem anderen Gerät einfach den Startcode nochmal eingeben.

## Eventleitung & Helfer: Admin-Bereich

Unter **`/admin/`** gibt es zwei Rollen:

| | Eventleitung | Helfer |
|---|---|---|
| Anmeldung | Name + gemeinsames Admin-Passwort | persönlicher Helfer-Code (`HELFER-…`) |
| Ankünfte bestätigen, Live-Übersicht | ✅ | ✅ |
| Clubs anlegen, löschen, zurücksetzen, Codes einsehen | ✅ | – |
| Helfer anlegen und entfernen, Testmodus | ✅ | – |

- **Ankünfte bestätigen:** Oben „Ich stehe an: …“ den eigenen Ort wählen. Kommt ein Club im Spiel an, bei ihm auf **„Angekommen ✓“** drücken.
- **Helfer hinzufügen:** Name eintragen → *Helfer hinzufügen*. Die fertige Einladung mit Code und Anleitung wird kopiert und kann per DM verschickt werden. Entfernte Helfer verlieren sofort den Zugang.
- **Club anlegen:** Clubname eingeben → *Erstellen*. Der Startcode ist **sofort** aktiv, mit fertigem DM-Text.
- **Live-Übersicht:** wird alle 4 Sekunden aktualisiert. Zeigt Station, Fortschritt, letzte Aktivität, Zielzeit und Platz, dazu einen Verlauf mit allen Bestätigungen samt Namen.
- **Testmodus** per Schalter ein- und ausschalten.

## 🔒 Schutz vor Schummeln

- **Alle Lösungen liegen nur auf dem Server.** Der Browser bekommt nur, was das Team schon erreicht hat. Im Quelltext stehen keine Orte, Codes oder Lösungen.
- **Der Server prüft jeden Schritt:** Tresorcodes, Memory-Züge, Treffer im Suchbild, Wörter im Buchstabensalat. Beim Schiebepuzzle werden die Züge nachgespielt. Stationen lassen sich nicht überspringen.
- **Keine Ortscodes zum Weitergeben:** Weiter geht es nur, wenn ein Eventleiter oder Helfer vor Ort im Spiel die Ankunft bestätigt.
- **Zeiten und Platzierung misst der Server.** Sie lassen sich im Browser nicht fälschen.
- **Gegen Durchprobieren:** Anmeldungen, Tresorversuche und Klicks sind pro Minute begrenzt.
- Tresorcodes sind **je Club verschieden**. Abschreiben bei anderen Clubs bringt nichts.
- Das Admin-Passwort liegt nur als Hash in `/etc/winterevent/config.php` auf dem Server, nie im Repo.

> 🧪 **Testmodus:** Im Admin-Bereich ein- und ausschaltbar. Solange er an ist, zeigt die Spielseite angemeldeten Admins (nur in deren Browser) einen Knopf „Test: Lösung“. Vor dem Event ausschalten.

## Installation auf dem Server (nginx + PHP)

- Die Website (`docs/`) besteht aus statischen Dateien.
- Der Spiel-Server (`server/api.php`) ist ein PHP-Skript mit SQLite-Datenbank. **Kein Node.js, keine Datenbank-Installation nötig.**

Anleitung (DNS, nginx, HTTPS, Spiel-Server): **[deploy/README.md](deploy/README.md)**

## Technik

- [Three.js](https://threejs.org) r169: 3D-Tresor und GPU-Schneefall. [GSAP](https://gsap.com) 3.12: Animationen. Beides liegt lokal unter `docs/vendor/`.
- PHP 8 + SQLite (PDO): Spielzustand, Codes und Live-Daten.
- Lite-Modus für Browser ohne Hardwarebeschleunigung. Berücksichtigt `prefers-reduced-motion`.

---
Inoffizielles Fan-Event. Nicht mit Star Stable Entertainment verbunden. Die Karten-Screenshots stammen aus dem Spiel.
