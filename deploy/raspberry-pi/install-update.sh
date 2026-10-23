#!/bin/sh
# Install or update the family tree on the Raspberry Pi from the packages made on your PC:
#   kudumbam-web-<date>.zip   the app + these Pi files   (kudumbam-web:  deploy\raspberry-pi\package.ps1)
#   kudumbam-app-<date>.zip   the API server             (kudumbam-app:  deploy\package.ps1)
#   sudo sh install-update.sh kudumbam-web-<date>.zip kudumbam-app-<date>.zip      (both, or either one)
# - Backs up the database first when the API is updated (new versions may update its structure on start).
# - Keeps server/.env, installs the API's production dependencies, swaps in the new API and/or app,
#   restarts the API and checks it answers. The previous version is kept as *.old for a quick rollback.
set -eu

[ $# -ge 1 ] || { echo "Usage: sudo sh install-update.sh kudumbam-web-<date>.zip kudumbam-app-<date>.zip  (both, or either one)"; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
id familytree >/dev/null 2>&1 || { echo "Create the familytree user first (see the guide, step 3)."; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "Install unzip first: sudo apt install -y unzip"; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
web=''
api=''
n=0
for zip in "$@"; do
  [ -f "$zip" ] || { echo "$zip: file not found."; exit 1; }
  n=$((n + 1))
  unzip -q "$zip" -d "$tmp/$n"
  if [ -f "$tmp/$n/app/index.html" ] && [ -d "$tmp/$n/deploy" ]; then web="$tmp/$n"
  elif [ -f "$tmp/$n/server/package.json" ]; then api="$tmp/$n"
  else echo "$zip does not look like a family tree package."; exit 1
  fi
done
install -d -m 755 /opt/family-tree

# 1. The Pi files (scripts, services, Apache site) come with the app package.
if [ -n "$web" ]; then
  rm -rf /opt/family-tree/deploy
  mv "$web/deploy" /opt/family-tree/deploy
  chown -R root:root /opt/family-tree/deploy
  chmod -R u=rwX,go=rX /opt/family-tree/deploy
fi

# 2. The API: back up the database, then new code + existing settings, production dependencies only.
if [ -n "$api" ]; then
  [ -f /opt/family-tree/deploy/backup-db.sh ] || { echo "Install the app package first, or both packages together."; exit 1; }
  if sudo -u postgres psql -lqt | cut -d'|' -f1 | grep -qw familytree; then
    install -d -o postgres -g postgres -m 750 /var/backups/family-tree
    sudo -u postgres sh /opt/family-tree/deploy/backup-db.sh
  fi
  if [ -f /opt/family-tree/server/.env ]; then cp -p /opt/family-tree/server/.env "$api/server/.env"; fi
  rm -rf /opt/family-tree/server.new
  mv "$api/server" /opt/family-tree/server.new
  (cd /opt/family-tree/server.new && npm ci --omit=dev --no-fund --no-audit --loglevel=error)
  chown -R root:root /opt/family-tree/server.new
  chmod -R u=rwX,go=rX /opt/family-tree/server.new
  if [ -f /opt/family-tree/server.new/.env ]; then
    chown root:familytree /opt/family-tree/server.new/.env
    chmod 640 /opt/family-tree/server.new/.env
  fi
  rm -rf /opt/family-tree/server.old
  if [ -d /opt/family-tree/server ]; then mv /opt/family-tree/server /opt/family-tree/server.old; fi
  mv /opt/family-tree/server.new /opt/family-tree/server
fi

# 3. The app (static files served by Apache from /opt/family-tree/app).
if [ -n "$web" ]; then
  rm -rf /opt/family-tree/app.new /opt/family-tree/app.old
  mv "$web/app" /opt/family-tree/app.new
  chown -R root:root /opt/family-tree/app.new
  chmod -R u=rwX,go=rX /opt/family-tree/app.new
  if [ -d /opt/family-tree/app ]; then mv /opt/family-tree/app /opt/family-tree/app.old; fi
  mv /opt/family-tree/app.new /opt/family-tree/app
  echo "App installed in /opt/family-tree/app."
fi

# 4. Restart and check the API (skipped on the very first install, before .env and the service exist).
if [ -n "$api" ]; then
  if [ -f /opt/family-tree/server/.env ] && systemctl list-unit-files family-tree-api.service >/dev/null 2>&1 \
     && systemctl is-enabled --quiet family-tree-api; then
    systemctl restart family-tree-api
    for i in 1 2 3 4 5 6 7 8 9 10; do
      if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
        echo "API updated and running: $(curl -fsS http://127.0.0.1:3000/api/health)"
        exit 0
      fi
      sleep 2
    done
    echo "The API did not start. See: journalctl -u family-tree-api -n 50"
    echo "To roll back: sudo sh /opt/family-tree/deploy/rollback.sh server"
    exit 1
  fi
  echo "API installed. Next: create /opt/family-tree/server/.env and enable the services (guide, steps 5-6)."
fi
