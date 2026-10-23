#!/usr/bin/env bash
# Pack the built app and the Raspberry Pi files into deploy/out/kudumbam-web-<date>.zip
#   npm run build                          # first, yourself: this script does not build
#   bash deploy/raspberry-pi/package.sh
# Contains: app/ (the built Angular files from dist/family-tree/browser) and deploy/ (Pi scripts, services, Apache site).
# The API server is packed separately in its own repository (kudumbam-app: deploy/package.sh).
# Never includes .env files, the data/ folder or backups.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"

build=dist/family-tree/browser
[ -f "$build/index.html" ] || { echo "No build found in $build. Run npm run build first."; exit 1; }

stamp=$(date +%Y%m%d-%H%M)
stage="deploy/out/stage-web-$stamp"
out="$root/deploy/out/kudumbam-web-$stamp.zip"
rm -rf "$stage"
mkdir -p "$stage/deploy"
trap 'rm -rf "$root/$stage"' EXIT

cp -R "$build" "$stage/app"
for f in deploy/raspberry-pi/*; do
  case "$(basename "$f")" in package.sh) ;; *) cp "$f" "$stage/deploy/" ;; esac
done
# Shell scripts and config must have Unix line endings on the Pi.
for f in "$stage"/deploy/*; do sed -i.bak 's/\r$//' "$f" && rm -f "$f.bak"; done

# Never ship settings or family data, even if something was dropped into the build folder.
find "$stage" \( -name '.env' -o -name '.env.*' -o -name '*.ged' -o -name '*.dump' -o -name 'backup-*.json' \) -exec rm -rf {} +

# zip if installed, otherwise Python (Git Bash on Windows has neither zip nor a tar that writes zips).
(
  cd "$stage"
  if command -v zip >/dev/null 2>&1; then zip -qr "$out" app deploy
  elif command -v python3 >/dev/null 2>&1; then python3 -m zipfile -c "$out" app deploy
  elif command -v python >/dev/null 2>&1; then python -m zipfile -c "$out" app deploy
  else echo "Install zip (or Python) to make the package."; exit 1
  fi
)
echo "Package: $out"
echo "Copy it to the Pi, e.g.:  scp \"$out\" <user>@familytree.local:"
