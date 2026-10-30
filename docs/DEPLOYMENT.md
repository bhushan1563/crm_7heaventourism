# Deployment guide

Two supported targets. **Hostinger VPS is the recommended one** (full feature set, no serverless limits).
Both serve the web app and the API from the **same origin**, so no CORS or API-URL configuration is needed.

---

## A. Hostinger VPS (Ubuntu 22.04 / 24.04) - one Node process + Nginx

```
Browser ──HTTPS──> Nginx (80/443) ──> Node :5000 (PM2)  ──> serves frontend/dist  +  /api  +  /static
                                                     └──> MongoDB (Atlas or local)
```

### 1. Server basics

```bash
ssh root@YOUR_VPS_IP
apt update && apt upgrade -y
apt install -y git nginx ufw
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable

# Node 22 + PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
```

Point your domain's **A record** (e.g. `crm.example.com`) at the VPS IP.

### 2. MongoDB

- **Atlas (simplest):** create a cluster, a database user, and add the VPS IP under *Network Access*
  (remove the `0.0.0.0/0` "allow from anywhere" entry that Atlas' auto-setup adds).
  Use the `mongodb+srv://...` string as `MONGODB_URI`. If the password contains `@ : / ?` etc., URL-encode it (`@` -> `%40`).
  Give the database user the **readWrite** role on this one database only, not "Atlas admin".
- **On the VPS:** install MongoDB Community (follow MongoDB's Ubuntu instructions), keep it bound to `127.0.0.1`,
  enable authentication, and use `mongodb://USER:PASS@127.0.0.1:27017/7heaven_crm?authSource=admin`.
- **Moving existing data:** `mongodump --uri="<old uri>" --out dump` then `mongorestore --uri="<new uri>" dump`.

### 3. Get the code and configure

```bash
mkdir -p /var/www && cd /var/www
git clone <YOUR_REPO_URL> 7heaven-crm && cd 7heaven-crm

cp backend/.env.example backend/.env
nano backend/.env       # PORT=5000, MONGODB_URI=..., JWT_SECRET=<openssl rand -hex 48>, NODE_ENV=production
```

> `JWT_SECRET` is mandatory: in production the API exits at start-up if it is missing or a placeholder, and logs what to fix
> (`pm2 logs 7heaven-crm`). Changing it signs everyone out once; that is expected.
> Move existing data in with `npm run import-csv -- "<folder>"` (see the README) or `mongodump` / `mongorestore` (below).

### 4. Build and start

```bash
npm ci
npm run build                                   # creates frontend/dist
npm run create-admin -- admin@yourdomain.com 'A-strong-password'   # only on an EMPTY database
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup            # run the command it prints, so PM2 restarts on reboot

curl -s http://127.0.0.1:5000/api/health        # -> {"status":"healthy",...}
```

### 5. Nginx + HTTPS

```bash
cp deploy/nginx/7heaven-crm.conf /etc/nginx/sites-available/7heaven-crm
nano /etc/nginx/sites-available/7heaven-crm     # set server_name (and the port if you changed PORT)
ln -s /etc/nginx/sites-available/7heaven-crm /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

apt install -y certbot python3-certbot-nginx
certbot --nginx -d crm.example.com
```

Open `https://crm.example.com` and sign in.

### 6. Updating later

```bash
cd /var/www/7heaven-crm && bash deploy/deploy.sh   # git pull, npm ci, build, pm2 reload
```

### Operations

| Task | Command |
|---|---|
| Logs | `pm2 logs 7heaven-crm` |
| Restart | `pm2 restart 7heaven-crm` |
| Status | `pm2 status` |
| Backup DB | `mongodump --uri="<uri>" --out backup-$(date +%F)` |

Notes: logs no longer contain the MongoDB URI or any secret. Run a single instance (the PM2 file does): the OCR scanner is
memory-hungry and the login rate limiter keeps its counters in memory. PM2 sends SIGTERM on reload; the API drains in-flight requests and
closes the database cleanly. `curl /api/health` returns 503 while the database is unreachable (use it for uptime monitoring).

### Production checklist

- [ ] `NODE_ENV=production`, a random `JWT_SECRET`, `MONGODB_URI` set in `backend/.env` (or Vercel env vars)
- [ ] First admin created with `npm run create-admin`, strong password; no `ADMIN_*` variables left in the environment
- [ ] Atlas *Network Access* limited to the server IP; database user limited to `readWrite` on this database
- [ ] HTTPS enabled (certbot) and, afterwards, the HSTS line from `deploy/nginx/7heaven-crm.conf`
- [ ] `npm test` passes; `npm run build` succeeds
- [ ] Backups: `mongodump` on a schedule (Atlas M0 has none), copy it off the server
- [ ] Imported temporary passwords handed out and `IMPORTED_USER_LOGINS.csv` deleted

---

## B. Vercel (web app + API as one serverless project)

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

### Vercel limits to know about

- **Request bodies are capped at about 4.5 MB** by Vercel Functions. Phone photos for the business-card scanner and very large
  quotation payloads can exceed that and fail; the API itself allows 10 MB / 20 MB. The VPS has no such cap.
- **Function time limit.** OCR on a cold start can take several seconds. If scans time out, raise *Max Duration* under
  *Settings -> Functions* (the allowed maximum depends on your plan).
- **Cold starts / bundle size.** The function bundle includes `tesseract.js` and `eng.traineddata`; the 67 MB APK is deliberately
  excluded from it and served from the CDN instead.
- The app keeps no files on disk (uploads are processed in memory), so a read-only serverless filesystem is fine.

---

## Reference

- API port: `PORT` in `backend/.env` (default 5000). Keep Nginx's `proxy_pass` in sync.
- The API serves `frontend/dist` automatically when it exists; without a build it is API-only (dev mode uses Vite on :5173).
- To host the web app and API on different domains, build with `REACT_APP_APIURL=https://api.example.com` set in the environment.
