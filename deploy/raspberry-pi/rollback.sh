#!/bin/sh
# Go back to the version before the last install-web.sh (app) or install-server.sh (server).
#   sudo sh /opt/family-tree/deploy/rollback.sh            both the app and the API (whichever has a previous version)
#   sudo sh /opt/family-tree/deploy/rollback.sh app        only the app
#   sudo sh /opt/family-tree/deploy/rollback.sh server     only the API
# The database is NOT rolled back. If the newer API changed its structure and the older one fails to start,
# restore the backup taken just before the update (see the guide, "Restore a backup").
set -eu
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
parts=${1:-"app server"}
case "$parts" in app|server|"app server") ;; *) echo "Usage: sudo sh rollback.sh [app|server]"; exit 1 ;; esac

rolled=''
for part in $parts; do
  if [ ! -d "/opt/family-tree/$part.old" ]; then
    echo "No previous version of the $part to go back to."
    continue
  fi
  if [ "$part" = server ]; then cp -p /opt/family-tree/server/.env /opt/family-tree/server.old/.env 2>/dev/null || true; fi
  rm -rf "/opt/family-tree/$part.broken"
  mv "/opt/family-tree/$part" "/opt/family-tree/$part.broken"
  mv "/opt/family-tree/$part.old" "/opt/family-tree/$part"
  if [ "$part" = server ]; then systemctl restart family-tree-api; fi
  echo "Rolled back the $part. The newer version is kept in /opt/family-tree/$part.broken."
  rolled=yes
done
[ -n "$rolled" ] || exit 1
