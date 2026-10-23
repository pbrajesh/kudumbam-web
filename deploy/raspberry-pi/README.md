# Running the family tree on a Raspberry Pi (headless)

Everything runs on the Pi: **PostgreSQL** (the data), the **API** (Node, a systemd service) and **Apache** (already
installed on the Pi), which serves the app and passes `/api` to the API — one address, so no CORS set-up is needed. Supabase still does
sign-in. Relatives reach the Pi from the internet through a **Cloudflare Tunnel** (recommended: nothing is opened on
your router) or through **port forwarding** on your router.

```
 relatives' browsers ──HTTPS──► Cloudflare ──tunnel──► cloudflared ─┐
                                                                     ▼            Raspberry Pi
                                  Apache :80 ── /api/* ──► API :3000 (Node) ──► PostgreSQL (local socket)
                                        └── everything else ──► /opt/family-tree/app (the built app)
```

What you need: a **Raspberry Pi 4 or 5 with 2 GB+**, ideally booting from a **USB SSD** (a database wears out SD
cards), and for internet access a **domain name** (Cloudflare Tunnel) — or a free dynamic-DNS name (port forwarding).

Commands in grey boxes run **on the Pi** over SSH unless the step says "on your PC".

---

## 1. Prepare the Pi

1. With **Raspberry Pi Imager**, write **Raspberry Pi OS Lite (64-bit)**. In its settings: hostname `familytree`,
   enable SSH (preferably with your public key), set a user and password, Wi-Fi if needed, your time zone.
2. Boot the Pi and connect from your PC: `ssh <user>@familytree.local`
3. Update and check it is 64-bit:
   ```sh
   sudo apt update && sudo apt full-upgrade -y
   uname -m            # must print aarch64
   ```
4. Automatic security updates:
   ```sh
   sudo apt install -y unattended-upgrades
   sudo dpkg-reconfigure -plow unattended-upgrades   # answer Yes
   ```

## 2. Install PostgreSQL and Node

Apache is already on the Pi; check it is 2.4 (`apache2 -v`).

```sh
sudo apt install -y postgresql curl unzip
psql --version        # 15 or newer

curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
node --version        # v24.x (anything from v22.18 works)
npm --version         # comes with nodejs from NodeSource
```

Install Node this way, for the whole system: the API service runs `/usr/bin/node`, and the install script runs
`npm` with sudo. A Node installed only for your user (nvm, or a download in your home folder) is not seen by either,
and Raspberry Pi OS's own `nodejs` package (without the NodeSource step) is too old and has no npm.
`install-update.sh` checks this before changing anything and stops with these instructions if Node or npm is missing.

## 3. Create the database

The API runs as its own system user, `familytree`, and logs in to PostgreSQL through the local socket — **no
password** exists, and PostgreSQL does not listen on the network.

```sh
sudo adduser --system --group --no-create-home familytree
sudo -u postgres createuser familytree
sudo -u postgres createdb --owner familytree familytree
```

## 4. Copy the app and the API to the Pi

The app and the API are separate repositories, so each one is packed on its own, into its own zip. Neither zip
contains `.env` files, the `data/` folder, the local database or backups. The scripts do not build anything: run the
app's build yourself first.

**On your PC** (bash, e.g. Git Bash on Windows), in the web app folder (kudumbam-web) and in the API folder
(kudumbam-app, cloned into `server/`). The scripts use `zip`, or Python when `zip` is not installed:

```bash
npm run build                          # in kudumbam-web: build the app (dist/family-tree/browser)
bash deploy/raspberry-pi/package.sh    # in kudumbam-web: zips the build and the Pi files
cd server
bash deploy/package.sh                 # in kudumbam-app: zips the API code (nothing to build)
cd ..
scp deploy/out/kudumbam-web-<date>.zip server/deploy/out/kudumbam-app-<date>.zip <user>@familytree.local:
```

- `kudumbam-web-<date>.zip`: `app/` (the built app) and `deploy/` (these Pi files: scripts, services, Apache site)
- `kudumbam-app-<date>.zip`: `server/` (the API code: `src`, `migrations`, `scripts`, `package.json`, lock file)

**On the Pi:**

```sh
mkdir -p ~/ft && unzip -o -q ~/kudumbam-web-<date>.zip 'deploy/*' -d ~/ft
sudo sh ~/ft/deploy/install-update.sh ~/kudumbam-web-<date>.zip ~/kudumbam-app-<date>.zip
```

This puts the API in `/opt/family-tree/server`, the app in `/opt/family-tree/app` and the Pi files in
`/opt/family-tree/deploy`.

## 5. Settings for the API

```sh
sudo nano /opt/family-tree/server/.env
```

```ini
DATABASE_URL=postgresql://familytree@/familytree?host=/var/run/postgresql
SUPABASE_URL=https://vyzygojjbhxqcpknasmm.supabase.co
PORT=3000
# Apache alone in front: 1.  Cloudflare Tunnel + Apache: 2.
TRUST_PROXY=2
CORS_ORIGINS=
MAX_TREES_PER_USER=5
MAX_MEMBERS_PER_TREE=200
MAX_PEOPLE_PER_TREE=20000
```

```sh
sudo chown root:familytree /opt/family-tree/server/.env
sudo chmod 640 /opt/family-tree/server/.env
```

## 6. Start the API and the nightly backup

```sh
sudo cp /opt/family-tree/deploy/family-tree-api.service /opt/family-tree/deploy/family-tree-backup.* /etc/systemd/system/
sudo install -d -o postgres -g postgres -m 750 /var/backups/family-tree
sudo systemctl daemon-reload
sudo systemctl enable --now family-tree-api family-tree-backup.timer
curl http://127.0.0.1:3000/api/health          # {"ok":true}
journalctl -u family-tree-api -n 20             # "Family tree API listening on …"
```

The first start creates the tables.

## 7. Apache

```sh
sudo a2enmod proxy proxy_http headers
sudo cp /opt/family-tree/deploy/family-tree.apache.conf /etc/apache2/sites-available/family-tree.conf
sudo nano /etc/apache2/sites-available/family-tree.conf     # ServerName: your address from step 8, e.g. family.example.com
sudo a2ensite family-tree
sudo apache2ctl configtest                                   # Syntax OK
sudo systemctl reload apache2
```

Apache chooses a site by the name in the address, so other sites it already serves keep working. If this Apache
serves nothing else, turn off its default page so any address reaches the family tree: `sudo a2dissite 000-default
&& sudo systemctl reload apache2`.

Open **http://familytree.local** from a computer on your home network: you should see the sign-in page, and
**http://familytree.local/privacy** the privacy page.

## 8. Make it reachable from the internet

### Option A — Cloudflare Tunnel (recommended)

No ports are opened on your router and your home IP address stays hidden. Needs a domain whose DNS is managed by
Cloudflare (free plan is enough).

1. In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel** (type *Cloudflared*), name it
   `familytree`. Choose **Debian / arm64**: it shows commands that install `cloudflared` and run it as a service with
   your tunnel's token — run them on the Pi.
2. In the tunnel's **Public hostnames**, add e.g. `family.example.com` → service **HTTP** `localhost:80`.
3. Keep `TRUST_PROXY=2` (step 5), and set `ServerName` in the Apache site (step 7) to that hostname.

### Option B — port forwarding

1. Get a name for your home connection (your own domain, or a free one from e.g. DuckDNS, kept up to date by its
   updater script).
2. On your router, forward TCP **80** and **443** to the Pi.
3. Set `ServerName` in the Apache site (step 7) to your name (e.g. `family.example.com`), then get an HTTPS
   certificate, renewed automatically: `sudo apt install -y certbot python3-certbot-apache && sudo certbot --apache
   -d family.example.com` (let it redirect HTTP to HTTPS).
4. Set `TRUST_PROXY=1` in `.env` and `sudo systemctl restart family-tree-api`.
5. Firewall: `sudo apt install -y ufw && sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable`

## 9. Supabase settings

In your Supabase project, **Authentication → URL Configuration**:

- **Site URL:** `https://family.example.com` (your address from step 8)
- **Redirect URLs:** add `https://family.example.com/**` (keep `http://localhost:4200/**` for development)

Before many relatives sign in, set up **custom SMTP** (Authentication → Emails → SMTP, e.g. Resend): Supabase's
built-in email only sends a few sign-in emails per hour.

## 10. Your own tree

Sign in at your new address. On the My trees page, **Start your family tree**, then use **Import a .ged file** with
`data/My-Family-16-Feb-2020-564.ged` (or an export of your local copy), choose **Settings → Father's given name**,
and invite relatives from **Members**. Read **/privacy** first and, if you like, set `privacyContact` in
`src/environments/environment.production.ts` (then repackage the app, step 11).

## 11. Updating

**On your PC:** pack what changed, as in step 4 (the app, the API, or both), and `scp` the zip(s). **On the Pi:**

```sh
sudo sh /opt/family-tree/deploy/install-update.sh ~/kudumbam-web-<date>.zip     # the app
sudo sh /opt/family-tree/deploy/install-update.sh ~/kudumbam-app-<date>.zip     # the API
sudo sh /opt/family-tree/deploy/install-update.sh ~/kudumbam-web-<date>.zip ~/kudumbam-app-<date>.zip   # both
```

For the API it backs up the database first, then installs the new version, restarts the API and checks it. If
something is wrong: `sudo sh /opt/family-tree/deploy/rollback.sh app`, `… rollback.sh server`, or `… rollback.sh`
for both (the database is not rolled back — see below). If an update changes `family-tree.apache.conf`, copy it
again as in step 7 (keeping your `ServerName`).

## Backups

- Every night at 03:30, `/var/backups/family-tree/familytree-<date>.dump` (14 days kept), and one before every update.
- **Copy them off the Pi** regularly — a backup on the same card or disk does not survive it failing. For example,
  from your PC: `scp <user>@familytree.local:/var/backups/family-tree/*.dump D:\family-tree-backups\`
  (first `sudo chmod o+rx /var/backups/family-tree && sudo chmod o+r /var/backups/family-tree/*.dump`, or copy them
  with `sudo` to your home folder). The nightly copy to Supabase (below) does this automatically for the latest state.
- Check the timer: `systemctl list-timers family-tree-backup.timer`; run one now:
  `sudo systemctl start family-tree-backup`.

### Restore a backup

```sh
sudo systemctl stop family-tree-api
sudo -u postgres pg_restore --clean --if-exists --no-owner --role=familytree -d familytree /var/backups/family-tree/familytree-<date>.dump
sudo systemctl start family-tree-api
```

### Off-site copy in Supabase

Every night at 04:00 (after the local backup), `supabase-sync.sh` copies the whole database to your Supabase
project's PostgreSQL database, so a copy survives the Pi failing. Each run **replaces** the previous copy; the
dated `.dump` files on the Pi stay the history. The copy goes into its own schema, `familytree_backup`, never
`public` (which Supabase's Data API exposes to browsers), and the run is one transaction: if it fails half way, the
previous copy is kept.

1. In Supabase: **Connect** (top of the project page) → **Session pooler** → copy the URI. It looks like
   `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Use the session pooler, not "Direct connection": that one needs IPv6, which most home connections lack. If you
   do not know the database password, reset it under **Project Settings → Database**.
2. On the Pi, keep it in a file only root and the postgres user can read (add `?sslmode=require` to the end):
   ```sh
   sudo install -d -m 755 /etc/family-tree
   sudo nano /etc/family-tree/supabase.env
   ```
   ```ini
   SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   ```
   A password with `@ : / ? # %` in it must be percent-encoded there (`@` → `%40`), or choose one without them.
   ```sh
   sudo chown root:postgres /etc/family-tree/supabase.env
   sudo chmod 640 /etc/family-tree/supabase.env
   ```
3. Turn it on and run it once:
   ```sh
   sudo cp /opt/family-tree/deploy/family-tree-supabase.* /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now family-tree-supabase.timer
   sudo systemctl start family-tree-supabase
   journalctl -u family-tree-supabase -n 20       # "Copied to Supabase (familytree_backup): 1 trees, 312 people, …"
   ```

In the Supabase **Table Editor** the copy appears under the schema `familytree_backup`. Do not add that schema to
**Exposed schemas** (Project Settings → Data API): that would let the website's public key read it. Check the
timer with `systemctl list-timers family-tree-supabase.timer`; a failed night shows in
`systemctl status family-tree-supabase` and the journal. Supabase's free plan pauses projects that sit idle for a week;
the nightly copy should keep it active, but if the dashboard ever shows it paused, restore it there.

**Restore from Supabase** (only if the Pi's own `.dump` files are lost too). `pg_dump` must be at least as new as
Supabase's PostgreSQL (see **Project Settings → Infrastructure**); if the Pi's is older, install a newer
`postgresql-client` from the PostgreSQL apt repository (apt.postgresql.org) first. Into an empty database:

```sh
sudo systemctl stop family-tree-api
. /etc/family-tree/supabase.env    # as root: sudo -s first
pg_dump "$SUPABASE_DB_URL" --schema=familytree_backup --no-owner --no-privileges --no-comments \
  | sed -e '/^CREATE SCHEMA familytree_backup;$/d' -e '/^REVOKE .* ON SCHEMA familytree_backup /d' \
        -e 's/\bfamilytree_backup\./public./g' > /tmp/from-supabase.sql
sudo -u postgres dropdb familytree && sudo -u postgres createdb --owner familytree familytree
sudo -u familytree psql -v ON_ERROR_STOP=1 --single-transaction -d familytree -f /tmp/from-supabase.sql
rm /tmp/from-supabase.sql
sudo systemctl start family-tree-api
```

## Useful commands

| What | Command |
|---|---|
| API status / logs | `systemctl status family-tree-api` · `journalctl -u family-tree-api -f` |
| Restart the API | `sudo systemctl restart family-tree-api` |
| Web server logs | `sudo tail -f /var/log/apache2/family-tree.log` (errors: `family-tree-error.log`) |
| Trees and members | `cd /opt/family-tree/server && sudo -u familytree node --env-file=.env scripts/member.ts trees` |
| Database shell | `sudo -u postgres psql familytree` |

## Security notes

- Only Apache (port 80, or 80/443 with option B) and SSH are reachable; the API listens on `127.0.0.1:3000`,
  PostgreSQL on the local socket only.
- Use SSH keys and turn off password log-in (`PasswordAuthentication no` in `/etc/ssh/sshd_config`) once keys work.
- The API runs as an unprivileged user with a read-only view of the system (see `family-tree-api.service`).
- Apache sends a strict Content Security Policy: only this site's code runs, and it may only talk to this site and
  to your Supabase project. If you change Supabase projects, update that address in the Apache site.
- Access logs leave out sign-in tokens and the email typed when deleting an account.
