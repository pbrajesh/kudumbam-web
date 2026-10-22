#!/bin/sh
# Go back to the version before the last install-update.sh.
#   sudo sh /opt/family-tree/deploy/rollback.sh
# The database is NOT rolled back. If the newer version changed its structure and the older one fails to start,
# restore the backup taken just before the update (see the guide, "Restore a backup").
set -eu
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
[ -d /opt/family-tree/server.old ] && [ -d /srv/family-tree/app.old ] || { echo "No previous version to go back to."; exit 1; }

cp -p /opt/family-tree/server/.env /opt/family-tree/server.old/.env 2>/dev/null || true
mv /opt/family-tree/server /opt/family-tree/server.broken
mv /opt/family-tree/server.old /opt/family-tree/server
mv /srv/family-tree/app /srv/family-tree/app.broken
mv /srv/family-tree/app.old /srv/family-tree/app
systemctl restart family-tree-api
echo "Rolled back. The newer version is kept in /opt/family-tree/server.broken and /srv/family-tree/app.broken."
