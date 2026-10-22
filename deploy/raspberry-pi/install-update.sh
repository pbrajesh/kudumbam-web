#!/bin/sh
# Install or update the family tree on the Raspberry Pi from a package made by package.ps1.
#   sudo sh install-update.sh family-tree-YYYYMMDD-HHMM.tgz
# - Backs up the database first (when it exists).
# - Keeps server/.env, installs the API's production dependencies, swaps in the new API and app,
#   restarts the API and checks it answers. The previous version is kept as *.old for a quick rollback.
set -eu

tgz=${1:?"Usage: sudo sh install-update.sh family-tree-<date>.tgz"}
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
id familytree >/dev/null 2>&1 || { echo "Create the familytree user first (see the guide, step 4)."; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
tar -xzf "$tgz" -C "$tmp"
for d in app server deploy; do [ -d "$tmp/$d" ] || { echo "$tgz does not look like a family tree package."; exit 1; }; done

# 1. Back up the database before anything changes (new versions may update its structure on start).
if sudo -u postgres psql -lqt | cut -d'|' -f1 | grep -qw familytree; then
  install -d -o postgres -g postgres -m 750 /var/backups/family-tree
  sudo -u postgres sh "$tmp/deploy/backup-db.sh"
fi

# 2. The API: new code + existing settings, production dependencies only.
install -d -m 755 /opt/family-tree
if [ -f /opt/family-tree/server/.env ]; then cp -p /opt/family-tree/server/.env "$tmp/server/.env"; fi
rm -rf /opt/family-tree/server.new
mv "$tmp/server" /opt/family-tree/server.new
(cd /opt/family-tree/server.new && npm ci --omit=dev --no-fund --no-audit --loglevel=error)
rm -rf /opt/family-tree/server.old
if [ -d /opt/family-tree/server ]; then mv /opt/family-tree/server /opt/family-tree/server.old; fi
mv /opt/family-tree/server.new /opt/family-tree/server
rm -rf /opt/family-tree/deploy
mv "$tmp/deploy" /opt/family-tree/deploy
chown -R root:root /opt/family-tree
chmod -R u=rwX,go=rX /opt/family-tree
if [ -f /opt/family-tree/server/.env ]; then
  chown root:familytree /opt/family-tree/server/.env
  chmod 640 /opt/family-tree/server/.env
fi

# 3. The app (static files served by Caddy).
install -d -m 755 /srv/family-tree
rm -rf /srv/family-tree/app.new /srv/family-tree/app.old
mv "$tmp/app" /srv/family-tree/app.new
chmod -R u=rwX,go=rX /srv/family-tree/app.new
if [ -d /srv/family-tree/app ]; then mv /srv/family-tree/app /srv/family-tree/app.old; fi
mv /srv/family-tree/app.new /srv/family-tree/app

# 4. Restart and check (skipped on the very first install, before .env and the service exist).
if [ -f /opt/family-tree/server/.env ] && systemctl list-unit-files family-tree-api.service >/dev/null 2>&1 \
   && systemctl is-enabled --quiet family-tree-api; then
  systemctl restart family-tree-api
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
      echo "Updated. The API is running: $(curl -fsS http://127.0.0.1:3000/api/health)"
      exit 0
    fi
    sleep 2
  done
  echo "The API did not start. See: journalctl -u family-tree-api -n 50"
  echo "To roll back: sudo sh /opt/family-tree/deploy/rollback.sh"
  exit 1
fi
echo "Files installed. Next: create /opt/family-tree/server/.env and enable the services (guide, steps 6-7)."
