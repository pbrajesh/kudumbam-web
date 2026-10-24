#!/bin/sh
# Nightly database backup, run by family-tree-backup.timer as the postgres user.
# Keeps 14 daily copies in /var/backups/family-tree. Copy them OFF the Pi too (USB drive, another computer, cloud):
# a backup on the same SD card does not survive the card failing.
set -eu

dir=/var/backups/family-tree
keep_days=14
stamp=$(date +%Y-%m-%d)

mkdir -p "$dir"
# Work in the backup folder: when run with sudo from a home folder, postgres cannot go back there (find fails).
cd "$dir"
# Custom format: compressed, and restorable with pg_restore (see the guide).
pg_dump --format=custom --file="$dir/familytree-$stamp.dump.tmp" familytree
mv "$dir/familytree-$stamp.dump.tmp" "$dir/familytree-$stamp.dump"
find "$dir" -name 'familytree-*.dump' -mtime +"$keep_days" -delete
echo "Backed up to $dir/familytree-$stamp.dump"
