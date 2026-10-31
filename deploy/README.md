# 🚀 Installation auf deinem Server (nginx + Subdomain)

Die Website besteht nur aus **statischen Dateien** im Ordner `docs/`. Auf dem Server läuft **kein Node.js**, keine Datenbank und kein Backend. nginx liefert die Dateien einfach aus.

**Ziel:** `https://winterevent.enchantedhawks.eu`

> Die Anleitung gilt für **Ubuntu 22.04/24.04 oder Debian 12**. Du brauchst SSH-Zugang mit `sudo`.

---

## Schritt 1: Subdomain auf den Server zeigen lassen (DNS)

Lege beim Anbieter, bei dem `enchantedhawks.eu` verwaltet wird, einen DNS-Eintrag an:

| Typ | Name | Wert |
|---|---|---|
| `A` | `winterevent` | IPv4-Adresse deines Servers (läuft es auf demselben Server wie enchantedhawks.eu, ist das `5.231.74.56`) |
| `AAAA` (optional) | `winterevent` | IPv6-Adresse deines Servers |

Die IP deines Servers findest du auf dem Server mit:

```bash
curl -4 ifconfig.me
```

Prüfen, ob der Eintrag schon greift (kann ein paar Minuten bis Stunden dauern):

```bash
dig +short winterevent.enchantedhawks.eu
```

Wenn hier die IP deines Servers erscheint, geht es weiter.

> **Cloudflare-Nutzer:** Stell die Wolke für den Eintrag zuerst auf **grau (DNS only)**, bis Schritt 6 erledigt ist.

---

## Schritt 2: Pakete installieren

> Läuft enchantedhawks.eu schon auf diesem Server mit nginx, ist das meiste bereits installiert. Der Befehl schadet trotzdem nicht. Die Winterevent-Seite bekommt eine **eigene** Konfigurationsdatei, eure Hauptseite bleibt unverändert.

```bash
sudo apt update
```

```bash
sudo apt install -y nginx git certbot python3-certbot-nginx
```

Falls eine Firewall (ufw) aktiv ist, Webverkehr erlauben:

```bash
sudo ufw allow 'Nginx Full'
```

---

## Schritt 3: Repo auf den Server holen

```bash
sudo git clone https://github.com/EinfachDevYT/enchanted-hawks-winterevent.git /var/www/enchanted-hawks-winterevent
```

Das Repo ist öffentlich, ein Login ist nicht nötig. nginx liefert später **nur** den Unterordner `docs/` aus. `config/`, `tools/` und `.git` sind von außen nicht erreichbar.

---

## Schritt 4: nginx einrichten

Konfiguration kopieren:

```bash
sudo cp /var/www/enchanted-hawks-winterevent/deploy/nginx/winterevent.conf /etc/nginx/sites-available/winterevent.conf
```

Seite aktivieren:

```bash
sudo ln -s /etc/nginx/sites-available/winterevent.conf /etc/nginx/sites-enabled/winterevent.conf
```

Konfiguration prüfen. Es muss `syntax is ok` und `test is successful` erscheinen:

```bash
sudo nginx -t
```

nginx neu laden:

```bash
sudo systemctl reload nginx
```

Kurzer Test (sollte `HTTP/1.1 200 OK` zeigen):

```bash
curl -sI http://winterevent.enchantedhawks.eu | head -1
```

---

## Schritt 5: HTTPS einschalten (Pflicht!)

Die Codes werden **im Browser** entschlüsselt, und Browser erlauben das nur über **https**. Ohne HTTPS zeigt die Seite nur einen Hinweis an.

```bash
sudo certbot --nginx -d winterevent.enchantedhawks.eu --redirect
```

certbot fragt beim ersten Mal nach einer E-Mail-Adresse und den Nutzungsbedingungen. Danach baut es das Zertifikat automatisch in die nginx-Konfiguration ein und leitet `http` auf `https` um. Das Zertifikat verlängert sich von selbst. Testen kannst du das mit:

```bash
sudo certbot renew --dry-run
```

---

## Schritt 6: Testen

1. Öffne `https://winterevent.enchantedhawks.eu`
2. Gib einen Startcode aus deiner geheimen `CODES.md` ein.
3. Öffne den Moorland-Tresor mit den vier Zahlen. Der 3D-Tresor sollte sich öffnen.

Danach kannst du bei Cloudflare die Wolke wieder auf **orange** stellen. Wähle dann unter SSL/TLS den Modus **Full (strict)**.

---

## Updates einspielen

Wenn es neue Änderungen im Repo gibt, reicht auf dem Server:

```bash
sudo /var/www/enchanted-hawks-winterevent/deploy/update.sh
```

Das Skript holt den neuesten Stand, prüft nginx und lädt neu. Die Spieler bekommen die neue Version beim nächsten Neuladen (eigene Dateien werden nie lange gecacht).

### Neue Codes erzeugen

Codes werden **nicht auf dem Server** erzeugt, sondern einmalig auf deinem eigenen PC. Danach lädst du nur die verschlüsselte Datei `docs/data.js` hoch:

1. Auf deinem PC: `config/event.json` bearbeiten (Teams, Texte) und `node tools/build.mjs` ausführen. Node.js brauchst du dafür **nur auf dem PC**, nie auf dem Server.
2. `docs/data.js` committen und pushen. **Nie** `config/event.json` oder `CODES.md` committen!
3. Auf dem Server: `sudo /var/www/enchanted-hawks-winterevent/deploy/update.sh`

---

## Was die nginx-Konfiguration macht

- **Nur `docs/` ist öffentlich.** Versteckte Dateien wie `.git` liefern immer `404`.
- **gzip:** three.js schrumpft von ~690 KB auf ~170 KB.
- **Caching:** Bibliotheken unter `vendor/` werden 30 Tage gecacht, Bilder 7 Tage. HTML, JS und CSS werden bei jedem Aufruf frisch geprüft, damit neue Codes sofort ankommen.
- **Sicherheits-Header:** Eine strenge Content-Security-Policy erlaubt nur Dateien vom eigenen Server und Google Fonts. Dazu kommen Schutz vor Einbettung in fremde Seiten, `nosniff` und `noindex` (Suchmaschinen sollen die Seite nicht listen).

> **Hinweis zur Content-Security-Policy:** Der `sha256-…`-Wert in der Konfiguration erlaubt genau die Import-Map in `docs/index.html`. Änderst du diese Zeile in der HTML, berechne den Hash neu:
>
> ```bash
> python3 -c "import re,hashlib,base64;s=open('docs/index.html').read();m=re.search(r'<script type=\"importmap\">(.*?)</script>',s,re.S);print('sha256-'+base64.b64encode(hashlib.sha256(m.group(1).encode()).digest()).decode())"
> ```

---

## Fehlersuche

| Problem | Lösung |
|---|---|
| `certbot` meldet „DNS problem“ | Der DNS-Eintrag aus Schritt 1 greift noch nicht. Mit `dig` prüfen und warten. Bei Cloudflare die Wolke auf grau stellen. |
| Seite zeigt „Bitte öffnet die Seite über https“ | HTTPS ist noch nicht eingerichtet (Schritt 5). |
| Die Standard-Seite „Welcome to nginx“ erscheint | `server_name` stimmt nicht mit der Subdomain überein. `/etc/nginx/sites-available/winterevent.conf` prüfen. |
| `403 Forbidden` | Rechte prüfen: `sudo chmod -R a+rX /var/www/enchanted-hawks-winterevent` |
| Tresor bleibt flach / kein 3D | Der Browser hat WebGL abgeschaltet. Die Seite funktioniert trotzdem mit einem einfachen Ersatz-Tresor. |
| Logs ansehen | `sudo tail -f /var/log/nginx/winterevent.error.log` |
