#!/usr/bin/env bash
# Holt den neuesten Stand aus GitHub auf den Server.
# Aufruf auf dem Server:  sudo /var/www/enchanted-hawks-winterevent/deploy/update.sh
set -euo pipefail

DIR="${1:-/var/www/enchanted-hawks-winterevent}"
cd "$DIR"

echo "→ Hole neuesten Stand von GitHub …"
git pull --ff-only --quiet origin main

echo "→ Prüfe nginx-Konfiguration …"
nginx -t -q
systemctl reload nginx

echo "✔ Aktualisiert auf: $(git log -1 --format='%h – %s (%cr)')"
