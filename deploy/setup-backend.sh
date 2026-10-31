#!/usr/bin/env bash
# Richtet den Spiel-Server (PHP + SQLite) für das Winterevent ein. Einmalig auf dem Server ausführen:
#   sudo /var/www/enchanted-hawks-winterevent/deploy/setup-backend.sh
# Mehrfach ausführen ist ungefährlich: vorhandene Passwörter und Spielstände bleiben erhalten.
set -euo pipefail
DIR="${1:-/var/www/enchanted-hawks-winterevent}"
SITE=/etc/nginx/sites-available/winterevent.conf

echo "→ Installiere PHP-FPM und SQLite (falls noch nicht vorhanden) …"
apt-get install -y -qq php-fpm php-sqlite3 >/dev/null

SOCK=$(ls /run/php/php*-fpm.sock 2>/dev/null | grep -v '/php-fpm.sock$' | sort -V | tail -1 || true)
[ -z "$SOCK" ] && SOCK=/run/php/php-fpm.sock
echo "  PHP-FPM: $SOCK"

echo "→ Lege Ordner an …"
mkdir -p /etc/winterevent /var/lib/winterevent
chown www-data:www-data /var/lib/winterevent && chmod 750 /var/lib/winterevent

if [ ! -f /etc/winterevent/config.php ]; then
  echo "→ Erste Einrichtung"
  read -rsp "  Admin-Passwort für die Eventleitung: " PW; echo
  read -rsp "  Passwort wiederholen: " PW2; echo
  [ -n "$PW" ] && [ "$PW" = "$PW2" ] || { echo "✘ Passwörter leer oder unterschiedlich."; exit 1; }
  read -rp "  Die vier Zahlen für den ersten Tresor (aus dem Lösungsheft): " DIG
  [[ "$DIG" =~ ^[0-9]{4}$ ]] || { echo "✘ Bitte genau vier Ziffern."; exit 1; }
  HASH=$(PW="$PW" php -r 'echo password_hash(getenv("PW"), PASSWORD_DEFAULT);')
  SECRET=$(openssl rand -hex 32)
  cat > /etc/winterevent/config.php <<EOF
<?php return [
  'admin_password_hash' => '$HASH',
  'secret' => '$SECRET',
  'morland_digits' => '$DIG',
  'db' => '/var/lib/winterevent/event.sqlite',
  'test_tools' => true,   // NUR ZUM TESTEN: vor dem Event auf false setzen!
  'site_url' => 'https://winterevent.enchantedhawks.eu',
];
EOF
  chown root:www-data /etc/winterevent/config.php && chmod 640 /etc/winterevent/config.php
else
  echo "→ Konfiguration vorhanden, bleibt unverändert (/etc/winterevent/config.php)"
fi

echo "→ Binde den Spiel-Server in nginx ein …"
sed "s#unix:/run/php/php-fpm.sock#unix:$SOCK#" "$DIR/deploy/nginx/winterevent-api.conf" > /etc/nginx/snippets/winterevent-api.conf
if ! grep -q 'winterevent-api.conf' "$SITE"; then
  cp "$SITE" "$SITE.bak-$(date +%Y%m%d-%H%M%S)"
  # vor der ersten "location / {"-Zeile einfügen (die certbot-Einstellungen bleiben unangetastet)
  sed -i '0,/^\s*location \/ {/s##    include /etc/nginx/snippets/winterevent-api.conf;\n\n    location / {#' "$SITE"
fi
nginx -t -q && systemctl reload nginx

echo "→ Teste den Spiel-Server …"
# lokal auf diesem Server prüfen (unabhängig von DNS, /etc/hosts oder IPv6)
if curl -sk -X POST -H 'Content-Type: application/json' -d '{"a":"meta"}' --resolve winterevent.enchantedhawks.eu:443:127.0.0.1 https://winterevent.enchantedhawks.eu/api | grep -q '"ok":true' \
   || curl -s -X POST -H 'Content-Type: application/json' -d '{"a":"meta"}' -H 'Host: winterevent.enchantedhawks.eu' http://127.0.0.1/api | grep -q '"ok":true'; then
  echo "✔ Fertig. Admin-Bereich: https://winterevent.enchantedhawks.eu/admin/"
else
  echo "✘ Der Spiel-Server antwortet nicht. Log: sudo tail -n 30 /var/log/nginx/winterevent.error.log"; exit 1
fi
