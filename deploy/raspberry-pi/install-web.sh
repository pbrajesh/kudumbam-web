#!/bin/sh
# Install or update the web app on the Raspberry Pi from kudumbam-web-<date>.zip
# (kudumbam-web: npm run build, then deploy/raspberry-pi/package.sh).
#   sudo sh install-web.sh ~/kudumbam-web-<date>.zip
# On a new Pi, install the API first (install-server.sh), then the app.
# - Copies the Pi files from the zip (scripts, services, Apache site) to /opt/family-tree/deploy.
# - Swaps in the new app in /opt/family-tree/app, served by Apache. Nothing to restart: the next page load uses it.
#   The previous version is kept as app.old for a quick rollback (rollback.sh app).
set -eu

[ $# -eq 1 ] || { echo "Usage: sudo sh install-web.sh kudumbam-web-<date>.zip"; exit 1; }
zip=$1
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
[ -f "$zip" ] || { echo "$zip: file not found."; exit 1; }
command -v unzip >/dev/null 2>&1 || { echo "Install unzip first: sudo apt install -y unzip"; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
unzip -q "$zip" -d "$tmp"
[ -f "$tmp/app/index.html" ] && [ -d "$tmp/deploy" ] || { echo "$zip is not a web app package (kudumbam-web-<date>.zip)."; exit 1; }

# 1. The Pi files.
install -d -m 755 /opt/family-tree/deploy
cp "$tmp"/deploy/* /opt/family-tree/deploy/
chown -R root:root /opt/family-tree/deploy
chmod -R u=rwX,go=rX /opt/family-tree/deploy

# 2. The app (static files served by Apache from /opt/family-tree/app).
rm -rf /opt/family-tree/app.new /opt/family-tree/app.old
mv "$tmp/app" /opt/family-tree/app.new
chown -R root:root /opt/family-tree/app.new
chmod -R u=rwX,go=rX /opt/family-tree/app.new
if [ -d /opt/family-tree/app ]; then mv /opt/family-tree/app /opt/family-tree/app.old; fi
mv /opt/family-tree/app.new /opt/family-tree/app
echo "App installed in /opt/family-tree/app."
if [ ! -f /etc/apache2/sites-available/family-tree.conf ]; then echo "Next: set up the Apache site (guide, step 7)."; fi
