# Running the family tree on a Raspberry Pi (headless)

Everything runs on the Pi: **PostgreSQL** (the data), the **API** (Node, a systemd service) and **Caddy**, which
serves the app and passes `/api` to the API — one address, so no CORS set-up is needed. Supabase still does
sign-in. Relatives reach the Pi from the internet through a **Cloudflare Tunnel** (recommended: nothing is opened on
your router) or through **port forwarding** on your router.

```
 relatives' browsers ──HTTPS──► Cloudflare ──tunnel──► cloudflared ─┐
                                                                     ▼            Raspberry Pi
                                   Caddy :80 ── /api/* ──► API :3000 (Node) ──► PostgreSQL (local socket)
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

## 2. Install PostgreSQL, Caddy and Node

```sh
sudo apt install -y postgresql caddy curl
psql --version        # 15 or newer
caddy version         # 2.6 or newer

curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
sudo bash nodesource_setup.sh
sudo apt install -y nodejs
node --version        # v24.x (anything from v22.18 works)
```

## 3. Create the database

The API runs as its own system user, `familytree`, and logs in to PostgreSQL through the local socket — **no
password** exists, and PostgreSQL does not listen on the network.

```sh
sudo adduser --system --group --no-create-home familytree
sudo -u postgres createuser familytree
sudo -u postgres createdb --owner familytree familytree
```

## 4. Copy the app to the Pi

**On your PC** (PowerShell, in the project folder):

```powershell
powershell -ExecutionPolicy Bypass -File deploy\raspberry-pi\package.ps1
scp deploy\out\family-tree-<date>.tgz <user>@familytree.local:
```

**On the Pi:**

```sh
mkdir -p ~/ft && tar -xzf ~/family-tree-<date>.tgz -C ~/ft
sudo sh ~/ft/deploy/install-update.sh ~/family-tree-<date>.tgz
```

This puts the API in `/opt/family-tree/server` and the app in `/opt/family-tree/app`.

## 5. Settings for the API

```sh
sudo nano /opt/family-tree/server/.env
```

```ini
DATABASE_URL=postgresql://familytree@/familytree?host=/var/run/postgresql
SUPABASE_URL=https://vyzygojjbhxqcpknasmm.supabase.co
PORT=3000
# Caddy alone in front: 1.  Cloudflare Tunnel + Caddy: 2.
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

## 7. Caddy

```sh
sudo cp /opt/family-tree/deploy/Caddyfile /etc/caddy/Caddyfile
sudo install -d -o caddy -g caddy /var/log/caddy
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

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
3. Keep `TRUST_PROXY=2` (step 5). Caddy's `:80` line stays as it is.

### Option B — port forwarding

1. Get a name for your home connection (your own domain, or a free one from e.g. DuckDNS, kept up to date by its
   updater script).
2. On your router, forward TCP **80** and **443** to the Pi.
3. In `/etc/caddy/Caddyfile`, replace `:80` with your name (e.g. `family.example.com`) and `sudo systemctl reload
   caddy` — Caddy gets and renews the HTTPS certificate itself.
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
`src/environments/environment.production.ts` (then repackage, step 11).

## 11. Updating

**On your PC:** `powershell -ExecutionPolicy Bypass -File deploy\raspberry-pi\package.ps1`, then `scp` the new
package. **On the Pi:**

```sh
sudo sh /opt/family-tree/deploy/install-update.sh ~/family-tree-<date>.tgz
```

It backs up the database, installs the new version, restarts the API and checks it. If something is wrong:
`sudo sh /opt/family-tree/deploy/rollback.sh` (the database is not rolled back — see below).

## Backups

- Every night at 03:30, `/var/backups/family-tree/familytree-<date>.dump` (14 days kept), and one before every update.
- **Copy them off the Pi** regularly — a backup on the same card or disk does not survive it failing. For example,
  from your PC: `scp <user>@familytree.local:/var/backups/family-tree/*.dump D:\family-tree-backups\`
  (first `sudo chmod o+rx /var/backups/family-tree && sudo chmod o+r /var/backups/family-tree/*.dump`, or copy them
  with `sudo` to your home folder).
- Check the timer: `systemctl list-timers family-tree-backup.timer`; run one now:
  `sudo systemctl start family-tree-backup`.

### Restore a backup

```sh
sudo systemctl stop family-tree-api
sudo -u postgres pg_restore --clean --if-exists --no-owner --role=familytree -d familytree /var/backups/family-tree/familytree-<date>.dump
sudo systemctl start family-tree-api
```

## Useful commands

| What | Command |
|---|---|
| API status / logs | `systemctl status family-tree-api` · `journalctl -u family-tree-api -f` |
| Restart the API | `sudo systemctl restart family-tree-api` |
| Web server logs | `sudo tail -f /var/log/caddy/family-tree.log` |
| Trees and members | `cd /opt/family-tree/server && sudo -u familytree node --env-file=.env scripts/member.ts trees` |
| Database shell | `sudo -u postgres psql familytree` |

## Security notes

- Only Caddy (port 80, or 80/443 with option B) and SSH are reachable; the API listens on `127.0.0.1:3000`,
  PostgreSQL on the local socket only.
- Use SSH keys and turn off password log-in (`PasswordAuthentication no` in `/etc/ssh/sshd_config`) once keys work.
- The API runs as an unprivileged user with a read-only view of the system (see `family-tree-api.service`).
- Caddy sends a strict Content Security Policy: only this site's code runs, and it may only talk to this site and to
  your Supabase project. If you change Supabase projects, update that address in the Caddyfile.
- Access logs leave out sign-in tokens and the email typed when deleting an account.
