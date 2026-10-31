# Deployment guide

Three supported targets. All serve the web app and the API from the **same origin**, so no CORS or API-URL configuration is needed.

| Target | Use it when | Effort |
|---|---|---|
| **A. Hostinger VPS** (recommended) | You want everything to work: OCR scanner, 10 MB uploads, no serverless limits, your own domain + HTTPS | one command |
| **B. Hostinger Node.js web hosting** (Business / Cloud plans) | You already have that plan and no VPS | upload a zip, fill in a form |
| **C. Vercel** | Quick hosted preview; accepts serverless limits | import the repo |

Everything below the line "Prepare" is needed by **A and B**.

---

## Prepare (once)

1. **MongoDB Atlas** (or any MongoDB the server can reach)
   - Create a database user with the **readWrite** role on this one database (not "Atlas admin").
   - *Network Access*: add the server's public IP. Remove the `0.0.0.0/0` entry once the server works (keep it only for Vercel).
   - Copy the `mongodb+srv://...` connection string and put the database name in it, e.g. `.../7heaven_crm`.
     If the password contains `@ : / ? # %`, URL-encode it (`@` becomes `%40`).
   - Already have data? It stays in Atlas; the new server just connects to the same database. To move data between databases use
     `npm run backup-db` + `npm run restore-db` (see *Backups*).
2. **Domain.** Create an **A record** for the name you will use (e.g. `crm.example.com`) pointing at the VPS IP
   (hPanel -> Domains -> DNS / DNS Zone). It can take a few minutes to spread; HTTPS cannot be issued before it does.
3. **The code**, in one of two ways:
   - a Git repository the server can clone (a private repository needs a read-only deploy key or token on the server), or
   - the zip from `npm run package` on your computer (contains the built web app; no secrets, no customer data).
     `npm run package -- --no-apk` leaves out the 64 MB Android app download (the login page's "download app" button then has nothing to serve).

---

## A. Hostinger VPS (Ubuntu 22.04 / 24.04 / 26.04)

```
Browser --HTTPS--> Nginx (80/443) --> Node 127.0.0.1:5000 (PM2) --> serves the web app + /api + /static
                                                          └--> MongoDB Atlas
```

Order the VPS with the plain **Ubuntu 22.04 / 24.04 / 26.04** operating system (not a control-panel template). 1 vCPU / 2 GB RAM is comfortable;
the OCR scanner uses a few hundred MB while it reads an image.

### A1. One-command setup

Log in as root (`ssh root@YOUR_VPS_IP`), then get the code onto the server and run the script:

```bash
# Option 1 - from Git
apt-get update && apt-get install -y git
git clone https://github.com/YOUR-USER/YOUR-REPO.git /root/7heaven-src

# Option 2 - from the zip (run `scp release/7heaven-crm-*.zip root@YOUR_VPS_IP:/root/` on your computer first)
apt-get update && apt-get install -y unzip
unzip -q /root/7heaven-crm-*.zip -d /root/7heaven-src

cd /root/7heaven-src
MONGODB_URI='mongodb+srv://USER:PASSWORD@cluster.xxxxx.mongodb.net/7heaven_crm' \
  bash deploy/setup-vps.sh --domain crm.example.com --email you@example.com
```

Without `MONGODB_URI=...` the script asks for the connection string with hidden input. Add `--dry-run` first to see every command
it would run without changing anything. Other options: `--no-ssl` (skip HTTPS for now), `--yes` (no confirmation), `--repo <url>`,
`--branch <name>`, `--dir <path>`; `--help` lists them.

What it does, in order (it is safe to run again; it skips what is already done):

1. Installs Git, Nginx, Certbot, Node.js 22 (if Node < 20), PM2.
2. Turns on the firewall (`ufw`): SSH (every port `sshd` listens on) + HTTP/HTTPS only.
3. Creates the unprivileged user `crm`, puts the code in `/var/www/7heaven-crm`.
4. Writes `backend/.env` (mode 600, owned by `crm`) with a freshly generated `JWT_SECRET`, your `MONGODB_URI`, `NODE_ENV=production`,
   `HOST=127.0.0.1` (only Nginx can reach the app). An existing `backend/.env` is never overwritten.
5. `npm ci`, builds the web app, starts it under PM2 as `crm` (auto-restart on crash, start on reboot, log rotation), and schedules a
   daily database backup at 03:15 into `/var/backups/7heaven` (newest 14 kept).
6. Installs the Nginx site for your domain (with a sign-in rate limit) and removes the default site.
7. Gets a free Let's Encrypt certificate **if the domain already points at this server** (otherwise it tells you the one command to run later).

Then:

- **Hostinger firewall:** hPanel -> VPS -> Security / Firewall must allow TCP 22 (SSH), 80 and 443 as well, if you use that firewall.
- **Atlas:** add the server's public IP to *Network Access* (the script prints it) and remove `0.0.0.0/0`.
- **First admin** (only if the database is brand new and empty):
  `runuser -l crm -c "cd /var/www/7heaven-crm && npm run create-admin -- you@example.com 'a-strong-password'"`
- Open `https://crm.example.com`, sign in.

### A2. Updating later

```bash
runuser -l crm -c 'bash /var/www/7heaven-crm/deploy/deploy.sh'      # git pull, npm ci, tests, build, PM2 restart (a few seconds of downtime), health check
```

It stops and prints the app log if the new version does not become healthy. `SKIP_TESTS=1` skips the (database-free, ~15 s) test run.
Installed from a zip instead of Git? Upload the new zip, `unzip -o` it over `/var/www/7heaven-crm`
(keep `backend/.env`; the zip does not contain one), `chown -R crm:crm /var/www/7heaven-crm`, then run `deploy.sh` (it skips `git pull`
when there is no `.git` folder).

### A2b. Automatic deployment (CI/CD with GitHub Actions)

Pushing to GitHub does **not** change the live site by itself. This pipeline makes it do so:

```
git push to main --> GitHub runs the tests + build --> (pass) --> GitHub connects to the server --> deploy.sh --> live (~2 min)
```

Pull requests only run the tests. The workflow is `.github/workflows/deploy.yml`; it is skipped with a notice until the secrets below exist.
**One-time setup** (about 5 minutes):

1. On the server, as root: `cd /var/www/7heaven-crm && git pull` (as `crm`: `runuser -l crm -c 'cd /var/www/7heaven-crm && git pull --ff-only'`), then
   `bash /var/www/7heaven-crm/deploy/setup-cicd.sh`.
   It creates a key that is allowed to do **one thing only** - run `deploy.sh` - and prints three values. The private key is shown once and not kept on the server.
2. GitHub -> your repository -> **Settings -> Secrets and variables -> Actions -> New repository secret**: create `DEPLOY_HOST` and `DEPLOY_SSH_KEY`
   (and `DEPLOY_HOST_KEY`, `DEPLOY_PORT` if the script printed them) with the values the script printed. Before connecting, the pipeline fetches the
   server's SSH host key and requires it to match `DEPLOY_HOST_KEY` **or** the fingerprint stored as `DEFAULT_HOST_FINGERPRINT` in
   `.github/workflows/deploy.yml` (set it to your server's: `ssh-keygen -l -f /etc/ssh/ssh_host_ed25519_key.pub` on the server, second column; update both
   if the server is ever reinstalled). The key text is rebuilt tolerantly, so extra spaces, flattened lines or a missing BEGIN/END line do not matter.
   Optional, on the *Variables* tab: `SITE_URL` = `https://your-domain`, so every deploy ends with a check of the public site.
3. GitHub -> **Actions** tab -> *CI/CD* -> **Run workflow**. Green = live. From now on every push to `main` deploys.

Good to know:
- **Every push to `main` goes live**, mistakes included. Work on a branch and merge when ready (the merge is what deploys), or protect `main`
  (Settings -> Branches) so changes must pass the tests via a pull request first.
- A failed test stops the deploy. A failed deploy (the app does not come back healthy) turns the run red and prints the app log in the Actions log; the
  previous build files are replaced, so fix forward by pushing a fix, or `git revert` the bad commit and push.
- The deploy builds on the server, the tests run on GitHub (so the server skips them). Deploys run one at a time.
- **Rotate or revoke:** `bash deploy/setup-cicd.sh --rotate` issues a new key (the old stops working at once). To switch it off completely, delete the line ending in
  `7heaven-github-deploy` from `/root/.ssh/authorized_keys`. The server also needs to accept SSH from GitHub's runners (port 22 from anywhere; if you restrict
  SSH by IP in the Hostinger firewall, this will not connect).
- A database change is not part of a deploy: the pipeline only updates the code. Data stays in Atlas.

### A3. Doing it by hand (what the script automates)

```bash
apt update && apt install -y git nginx ufw certbot python3-certbot-nginx
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs && npm install -g pm2

useradd --system --create-home --shell /bin/bash crm
git clone <repo> /var/www/7heaven-crm && chown -R crm:crm /var/www/7heaven-crm
runuser -l crm -c 'cd /var/www/7heaven-crm && cp backend/.env.example backend/.env && chmod 600 backend/.env'
nano /var/www/7heaven-crm/backend/.env      # NODE_ENV=production  HOST=127.0.0.1  PORT=5000  MONGODB_URI=...  JWT_SECRET=$(openssl rand -hex 48)

runuser -l crm -c 'cd /var/www/7heaven-crm && npm ci --include=dev && npm run build \
  && pm2 startOrReload deploy/ecosystem.config.cjs && pm2 save'
pm2 startup systemd -u crm --hp /home/crm          # makes PM2 start at boot
curl -s http://127.0.0.1:5000/api/health           # {"status":"healthy",...}

install -d /etc/nginx/snippets
cp /var/www/7heaven-crm/deploy/nginx/7heaven-proxy.conf /etc/nginx/snippets/
sed 's/crm\.example\.com/YOUR.DOMAIN/' /var/www/7heaven-crm/deploy/nginx/7heaven-crm.conf > /etc/nginx/sites-available/7heaven-crm
ln -s /etc/nginx/sites-available/7heaven-crm /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d YOUR.DOMAIN -m you@example.com --agree-tos --redirect
```

`JWT_SECRET` is mandatory: in production the API exits at start-up if it is missing or a placeholder and logs what to fix. Changing it
signs everyone out once. Use `www.` as well? Add `-d www.YOUR.DOMAIN` to certbot and the name to `server_name`.

### A4. Everyday operations

| Task | Command (run as root; PM2 belongs to the `crm` user, hence `runuser -l crm -c '...'`) |
|---|---|
| Status | `runuser -l crm -c 'pm2 status'` |
| Live logs | `runuser -l crm -c 'pm2 logs 7heaven-crm'` (Ctrl+C to leave) |
| Restart | `runuser -l crm -c 'pm2 restart 7heaven-crm'` |
| Health | `curl -s http://127.0.0.1:5000/api/health` (503 while the database is unreachable - good for an uptime monitor on `https://YOUR.DOMAIN/api/health`) |
| Nginx errors | `tail -n 50 /var/log/nginx/error.log` |
| Back up now | `runuser -l crm -c 'cd /var/www/7heaven-crm && node scripts/backup-db.mjs --dir /var/backups/7heaven'` |

The app runs as a **single process** on purpose: the OCR scanner is memory-hungry and the login rate limiter keeps its counters in memory.
PM2 restarts it above 900 MB. On a reload it drains in-flight requests and closes the database cleanly. Logs never contain the database URI or any secret.

---

## B. Hostinger Node.js web hosting (Business / Cloud plans)

> Not verified against a live Hostinger account: hPanel's labels change over time, so match the *meaning* of each field.
> If a step does not fit your plan, the VPS route (A) is the dependable one.

1. On your computer: `npm run package` -> `release/7heaven-crm-v1.0.0-<date>.zip` (contains the **already built** web app).
2. hPanel -> **Websites -> Add website -> Node.js Apps** (wording varies) -> **Upload your website files** -> choose the zip.
   (Alternatively *Import Git repository*, but then the platform must build the web app itself - see the note below.)
3. Settings of the app:
   - **Node.js version:** 20 or 22.
   - **Entry file / start command:** `backend/src/server.js` (or `npm start`). Run from the project root.
   - **Build command:** leave empty, or `npm install`. The zip already contains `frontend/dist`.
   - **Install command:** `npm install --omit=dev` or `npm ci --omit=dev` is enough.
4. **Environment variables** (the control panel's form; there is no `.env` file in the zip):

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | your Atlas connection string |
   | `JWT_SECRET` | a random string, 64+ characters (`openssl rand -hex 48`, or any password generator) |

   Do **not** set `PORT`: the platform assigns it and the app reads it. Leave `HOST` unset.
5. In Atlas -> *Network Access*, allow the hosting's outbound IP. Shared hosting usually has no fixed IP, which means `0.0.0.0/0`
   with a strong database password - another reason to prefer a VPS.
6. Start/restart the app, open the site, and check `https://YOUR.DOMAIN/api/health`.
7. Brand-new empty database? Create the first admin from your own computer (not on the host):
   `MONGODB_URI='<atlas uri>' npm run create-admin -- you@example.com 'a-strong-password'`

Notes: if the platform builds the project itself and fails with `vite: not found`, it installed production dependencies only - use the zip with the
build command empty. Shared plans limit memory and processes; if the OCR scanner is killed or times out there, that is the plan, not the app.

---

## C. Vercel (web app + API as one serverless project)

`vercel.json` builds the web app (`frontend/dist`), publishes the APK as a static file at `/static/7heaven.apk`,
and routes `/api/*` to `api/index.js`, which wraps the same Express app.

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel: **Add New -> Project**, import the repo, leave **Root Directory** as the repo root.
   Framework preset: *Other* (`vercel.json` supplies build and output settings).
3. **Settings -> General -> Node.js Version:** 22.x.
4. **Settings -> Environment Variables** (Production, and Preview if you use it):
   - `MONGODB_URI` - an **Atlas** string (a database on your own machine/VPS localhost is not reachable); URL-encode special characters in the password
   - `JWT_SECRET` - **required**, long random string (`openssl rand -hex 48`). Without it every `/api` call answers 500 "not configured correctly"
   - Do **not** copy `backend/.env` anywhere in the repository; Vercel reads these settings, not the file
5. In Atlas -> *Network Access*, allow Vercel's outbound traffic (Vercel has no fixed IPs on most plans, so this usually means `0.0.0.0/0`; keep a strong DB password).
6. Deploy. On an **empty** database create the first admin from your machine:
   `MONGODB_URI="<atlas uri>" npm run create-admin -- admin@yourdomain.com 'A-strong-password'`

Vercel limits: request bodies are capped at about 4.5 MB (large phone photos for the scanner can fail; the API itself allows 10 MB),
OCR on a cold start can take several seconds (raise *Max Duration* if scans time out), and the 67 MB APK is served from the CDN, not the function.

---

## Backups and restore

Atlas' free tier has **no backups**, and a server snapshot does not contain an external database. The VPS setup schedules one daily;
you can also run it by hand anywhere that has the repo and a `backend/.env` (or `MONGODB_URI` in the environment):

```bash
npm run backup-db                                   # -> backups/2026-10-31_031500/   (one compressed file per collection + manifest.json)
npm run backup-db -- --dir /var/backups/7heaven --keep 14
```

- Backups hold **customer data and password hashes**. The folder is created private (mode 700); never commit or e-mail it.
  Copy it off the server now and then (`scp -r root@IP:/var/backups/7heaven ./7heaven-backups`), ideally encrypted (`gpg -c file`).
- **Test a restore once**, into a scratch database, before you need it:
  ```bash
  MONGODB_URI='mongodb+srv://USER:PASS@cluster.xxxxx.mongodb.net/7heaven_restore_test' \
    node scripts/restore-db.mjs /var/backups/7heaven/2026-10-31_031500 --yes
  ```
- **Real restore** (replaces what is there): stop the app, restore, start it again so indexes are rebuilt:
  ```bash
  runuser -l crm -c 'pm2 stop 7heaven-crm'
  runuser -l crm -c 'cd /var/www/7heaven-crm && node scripts/restore-db.mjs /var/backups/7heaven/<stamp> --yes --drop'
  runuser -l crm -c 'pm2 start 7heaven-crm'
  ```
  Without `--drop` the restore refuses to touch a collection that already contains data; without `--yes` it only shows what it would do.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Browser shows **502 Bad Gateway** | The app is not running: `runuser -l crm -c 'pm2 status'` / `runuser -l crm -c 'pm2 logs 7heaven-crm --lines 50 --nostream'`. Usually a missing/placeholder `JWT_SECRET` or an unreachable database. |
| App keeps restarting; log says `Failed to start server: ...` | Run `runuser -l crm -c 'cd /var/www/7heaven-crm && node scripts/check-db.mjs'` (`npm run check-db`). It tests the connection like the app does and says in plain words what is wrong (repeated option in the connection string, wrong password, Atlas blocking this IP ...). Fix `backend/.env`, then `runuser -l crm -c 'pm2 restart 7heaven-crm --update-env'`. |
| **"Invalid email or password"** for an imported account | The CSV import gave every user a random temporary password (in `old data/IMPORTED_USER_LOGINS.csv` on your computer); the old app's passwords were never exported. Use that file, or set a new password on the server: `read -r -s -p "New password: " PW; echo; printf '%s' "$PW" \| runuser -l crm -c 'cd /var/www/7heaven-crm && node scripts/reset-password.mjs someone@example.com'; unset PW` (hidden input; the password never appears in history). |
| Page says **`Cannot GET /`**, or `/api/health` has no `"database"` field | Another program (e.g. an older API on the same server) already uses the port, so you are talking to it, not the CRM. Check with `ss -tlnp \| grep :5000`. Give the CRM a free port: set `PORT=5100` in `backend/.env`, change the port in `/etc/nginx/snippets/7heaven-proxy.conf`, `nginx -t && systemctl reload nginx`, restart with `runuser -l crm -c 'pm2 restart 7heaven-crm --update-env'`. (`setup-vps.sh` now picks a free port itself.) |
| An old site/app on the same server stopped working after setup | The script leaves existing nginx sites alone, and leaves the firewall off when it finds other public ports. If you enabled `ufw` yourself, allow the old app's port: `ufw allow <port>/tcp`. |
| `/api/health` says **503, database disconnected** | Atlas *Network Access* does not include this server's IP, wrong user/password in `MONGODB_URI` (`bad auth`), or the password has unencoded special characters. |
| Log: `querySrv ECONNREFUSED` | The server's DNS cannot resolve Atlas SRV records. Add `DNS_SERVERS=8.8.8.8,8.8.4.4` to `backend/.env`, `pm2 restart 7heaven-crm --update-env`. |
| App exits at start: `JWT_SECRET` ... | Production refuses to start without a real secret. Set it in `backend/.env` (VPS) or the panel's environment variables (B / Vercel). |
| **certbot fails** / site is http only | The domain's A record does not point at this server yet. Fix DNS, wait, then `certbot --nginx -d YOUR.DOMAIN -m you@example.com --agree-tos --redirect`. |
| Cannot reach the site at all | The Hostinger firewall (hPanel -> VPS -> Security) or `ufw status` blocks 80/443. |
| Login says too many attempts (**429**) | Rate limiting working as intended: 10 failed attempts per 15 min per IP + email. Wait, or restart the app to clear the in-memory counters. |
| Page loads but is blank after an update | Hard-refresh (Ctrl+F5). Old tabs still hold the previous build's file names. |
| Scanner is slow or the app restarts during a scan | Not enough RAM. Give the VPS 2 GB, or check `pm2 logs` for `max_memory_restart`. |
| Files edited on Windows break the server scripts (`bash\r: No such file`) | Line endings. `.gitattributes` forces LF for scripts when using Git; the zip from `npm run package` is already converted. |

---

## Production checklist

- [ ] `NODE_ENV=production`, a random `JWT_SECRET`, `MONGODB_URI` set (`backend/.env` on a VPS, panel variables on hosting/Vercel)
- [ ] HTTPS works (`https://YOUR.DOMAIN`, padlock) and `http://` redirects to it
- [ ] First admin created with a strong password; no `ADMIN_*` variables left in the environment
- [ ] Atlas *Network Access* limited to the server IP (no `0.0.0.0/0` on a VPS); database user limited to `readWrite` on this database
- [ ] Any password or connection string that was ever pasted into a chat, e-mail or screenshot has been **rotated**
- [ ] `https://YOUR.DOMAIN/api/health` returns `healthy`; an uptime monitor watches it
- [ ] A backup exists, has been copied off the server, and a restore was tested once
- [ ] Imported temporary passwords handed out and `IMPORTED_USER_LOGINS.csv` deleted

---

## Reference

- API port: `PORT` in `backend/.env` (default 5000). `setup-vps.sh` and `deploy.sh` read it; if you change it later, update `proxy_pass` in `/etc/nginx/snippets/7heaven-proxy.conf` and reload Nginx.
- `HOST` (default `0.0.0.0`; `127.0.0.1` behind Nginx) and `ENV_FILE` (path of the env file, default `backend/.env`) are optional.
- The API serves `frontend/dist` automatically when it exists; without a build it is API-only (dev mode uses Vite on :5173).
- To host the web app and API on different domains, build with `REACT_APP_APIURL=https://api.example.com` set in the environment.
