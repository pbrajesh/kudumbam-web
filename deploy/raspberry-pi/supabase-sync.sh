#!/bin/sh
# Copy the whole family tree database to a Supabase PostgreSQL database, as an off-Pi backup.
# Run daily at 16:00 IST by family-tree-supabase.timer as the postgres user; see "Off-site copy in Supabase" in the guide.
#   sudo systemctl start family-tree-supabase        # run once now
#
# Each run replaces the copy: the local tables go into the schema familytree_backup in Supabase (never public,
# which Supabase's Data API exposes). Everything happens in one transaction, so a failed run leaves the previous
# copy as it was. The connection string is SUPABASE_DB_URL in /etc/family-tree/supabase.env (not in any package).
set -eu

: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL in /etc/family-tree/supabase.env (see the guide)}"
local_db=${LOCAL_DB:-familytree}
schema=${SUPABASE_SCHEMA:-familytree_backup}
case "$schema" in public|auth|storage|extensions|realtime|graphql*|pg_*|supabase*|*[!a-z0-9_]*)
  echo "SUPABASE_SCHEMA=$schema is not allowed: use a schema of its own, e.g. familytree_backup."; exit 1 ;;
esac

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# A plain SQL dump of the app's tables (one consistent snapshot), without owners or grants (Supabase has other roles).
pg_dump --schema=public --no-owner --no-privileges --no-comments "$local_db" > "$tmp/dump.sql"

# Move every object from public to the backup schema. Rows inside COPY blocks are left exactly as they are.
{
  printf '%s\n' "set client_min_messages = warning;" "drop schema if exists $schema cascade;" "create schema $schema;"
  awk -v schema="$schema" '
    function move(s,   out, i, c) {
      out = ""
      while ((i = index(s, "public.")) > 0) {
        c = (i > 1) ? substr(s, i - 1, 1) : ""
        out = out substr(s, 1, i - 1) ((c ~ /^[A-Za-z0-9_$"]$/) ? "public." : schema ".")
        s = substr(s, i + 7)
      }
      return out s
    }
    in_copy { print; if ($0 == "\\.") in_copy = 0; next }
    /^(CREATE|ALTER|COMMENT ON) SCHEMA public[ ;]/ { next }
    /^SET transaction_timeout/ { next }    # pg_dump 17+; older servers do not know it
    { line = move($0); print line; if (line ~ /^COPY .* FROM stdin;$/) in_copy = 1 }
  ' "$tmp/dump.sql"
  # Only the connecting role may read the copy (Supabase grants nothing on a new schema; this keeps it that way).
  printf '%s\n' "revoke all on schema $schema from public;"
} > "$tmp/restore.sql"

psql "$SUPABASE_DB_URL" --quiet --no-psqlrc --single-transaction -v ON_ERROR_STOP=1 --file="$tmp/restore.sql" > /dev/null

counts=$(psql "$SUPABASE_DB_URL" --no-psqlrc -At -c "select
  (select count(*) from $schema.trees) || ' trees, ' ||
  (select count(*) from $schema.people) || ' people, ' ||
  (select count(*) from $schema.families) || ' families, ' ||
  (select count(*) from $schema.tree_members) || ' members'")
echo "Copied to Supabase ($schema): $counts"
