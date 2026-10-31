#!/usr/bin/env bash
# Holt den neuesten Stand aus GitHub auf den Server.
# Aufruf auf dem Server:  sudo /var/www/enchanted-hawks-winterevent/deploy/update.sh
set -euo pipefail

DIR="${1:-/var/www/enchanted-hawks-winterevent}"
cd "$DIR"

echo "→ Hole neuesten Stand von GitHub …"
# GitHub ist die einzige Quelle. Der Server übernimmt den Stand exakt –
# auch wenn die Historie per Force Push umgeschrieben wurde.
# Hinweis: Dateien auf dem Server nicht von Hand ändern, sie werden hier überschrieben.
git fetch --quiet origin main
if ! git diff --quiet HEAD -- 2>/dev/null; then
  echo "  (lokale Änderungen auf dem Server werden verworfen: $(git diff --name-only HEAD | tr '\n' ' '))"
fi
git reset --hard --quiet origin/main

echo "→ Prüfe nginx-Konfiguration …"
nginx -t -q
systemctl reload nginx

echo "✔ Aktualisiert auf: $(git log -1 --format='%h – %s (%cr)')"
