#!/bin/sh
# Install or update the API server on the Raspberry Pi from kudumbam-app-<date>.zip (kudumbam-app: deploy/package.sh).
#   sudo sh install-server.sh ~/kudumbam-app-<date>.zip
# On a new Pi, install the API first, then the app (install-web.sh): run this from the Pi files unpacked from the
# web zip (the guide, step 4); later updates can run it from /opt/family-tree/deploy.
# - Checks for Node.js 22.18+ and npm first (the service runs /usr/bin/node), before anything changes.
# - Copies the Pi files next to this script (services, backup scripts) to /opt/family-tree/deploy.
# - Backs up the database (new versions may update its structure on start), keeps server/.env, installs the API's
#   production dependencies, swaps in the new API, restarts it and checks it answers.
#   The previous version is kept as server.old for a quick rollback (rollback.sh server).
set -eu

[ $# -eq 1 ] || { echo "Usage: sudo sh install-server.sh kudumbam-app-<date>.zip"; exit 1; }
zip=$1
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
[ -f "$zip" ] || { echo "$zip: file not found."; exit 1; }
id familytree >/dev/null 2>&1 || { echo "Create the familytree user first (see the guide, step 3)."; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "Install unzip first: sudo apt install -y unzip"; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
[ -f "$here/backup-db.sh" ] || { echo "Run this script from the Pi files unpacked from the web zip (the guide, step 4)."; exit 1; }

# The API needs Node 22.18+ with npm, at /usr/bin/node where the service (family-tree-api.service) runs it.
node_help="Install Node.js as in the guide, step 2 (NodeSource):
  curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
  sudo bash nodesource_setup.sh
  sudo apt install -y nodejs
A Node installed only for your user (nvm, a download in your home folder) is not seen by sudo or by the service."
if [ ! -x /usr/bin/node ] || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are not installed for the system (/usr/bin/node, npm)."
  echo "$node_help"
  exit 1
fi
if ! /usr/bin/node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 18) ? 0 : 1)'; then
  echo "Node.js $(/usr/bin/node --version) is too old: the API needs 22.18 or newer."
  echo "$node_help"
  exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
unzip -q "$zip" -d "$tmp"
[ -f "$tmp/server/package.json" ] || { echo "$zip is not an API package (kudumbam-app-<date>.zip)."; exit 1; }

# 1. The Pi files, when this script runs from a freshly unpacked web zip.
install -d -m 755 /opt/family-tree/deploy
if [ "$here" != /opt/family-tree/deploy ]; then
  cp "$here"/* /opt/family-tree/deploy/
  chown -R root:root /opt/family-tree/deploy
  chmod -R u=rwX,go=rX /opt/family-tree/deploy
fi

# 2. Back up the database before anything changes. Only these two commands run as postgres (sudo -u runs one
# command and comes back); they start in / because postgres cannot enter your home folder, and a backup that
# fails there would stop the install.
if (cd / && sudo -u postgres psql -lqt) | cut -d'|' -f1 | grep -qw familytree; then
  install -d -o postgres -g postgres -m 750 /var/backups/family-tree
  (cd / && sudo -u postgres sh /opt/family-tree/deploy/backup-db.sh)
fi
echo "Installing the API's production packages (npm ci): the zip has only its code, not node_modules."

# 3. New code + existing settings, production dependencies only.
if [ -f /opt/family-tree/server/.env ]; then cp -p /opt/family-tree/server/.env "$tmp/server/.env"; fi
rm -rf /opt/family-tree/server.new
mv "$tmp/server" /opt/family-tree/server.new
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

# 4. Restart and check (skipped on the very first install, before .env and the service exist).
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
echo "API installed in /opt/family-tree/server. Next: create /opt/family-tree/server/.env and enable the services (guide, steps 5-6)."
