# 7Heaven Luxury Travel CRM

Monorepo (npm workspaces) containing the Express/MongoDB API and the React/Vite web app.
In production **one Node process serves both** - the API under `/api` and the built web app on every other path.
The web app is fully responsive: on phones and tablets the sidebar becomes a drawer, lists become cards, and dialogs become bottom sheets.

```
.
├─ backend/              Express 4 + Mongoose API  (workspace "7heaven-server")
│  ├─ src/               server.js, config, routes, controllers, models, middleware, uploads/ (APK)
│  ├─ test/              node:test suite (auth, permissions, config, HTTP layer) - no database needed
│  ├─ eng.traineddata    Tesseract OCR language data (read from the working directory)
│  └─ .env.example       every setting the API reads
├─ frontend/             React 18 + Vite web app    (workspace "client")
│  ├─ src/               pages (lazy-loaded), components, layout.css + responsive.css
│  ├─ .env.development   API URL for dev   (http://localhost:5000)
│  └─ .env.production    API URL for builds (empty = same origin)
├─ api/index.js          Vercel serverless entry (wraps backend/src/server.js)
├─ vercel.json           Vercel build, routing and security headers
├─ deploy/               Hostinger VPS: PM2 config, Nginx site, update script
├─ scripts/              create-admin.mjs, import-legacy-csv.mjs, vercel-postbuild.mjs
├─ docs/DEPLOYMENT.md    Step-by-step: Hostinger VPS and Vercel
└─ package.json          workspaces + root scripts (single install, single lockfile)
```

## Requirements

- Node.js 20+ (22 LTS recommended - see `.nvmrc`)
- MongoDB (local `mongodb://127.0.0.1:27017` or Atlas)

## Run locally

```bash
npm install                                  # installs both apps (one lockfile)
cp backend/.env.example backend/.env         # then set MONGODB_URI and JWT_SECRET
npm run create-admin -- you@example.com 'a-strong-password'   # only needed on an empty database
npm run dev                                  # API on :5000 + web app on :5173
```

Open http://localhost:5173.

### Run it the way production does (one server)

```bash
npm run build      # builds frontend/dist
npm start          # http://localhost:5000  -> web app + API from the same process
```

## Scripts (run from the repo root)

| Script | What it does |
|---|---|
| `npm run dev` | API (`node --watch`) and Vite dev server together |
| `npm run dev:backend` / `dev:frontend` | one side only |
| `npm run build` | build the web app into `frontend/dist` |
| `npm start` | start the API; it also serves `frontend/dist` if it exists |
| `npm test` | backend tests (config validation, auth, permissions, rate limiting, headers) |
| `npm run build:vercel` | Vercel build: web app + copies the APK into `dist/static` |
| `npm run create-admin -- <email> <password> [first] [last]` | create an Admin user (idempotent, password >= 8 chars) |
| `npm run import-csv -- "<folder>" [--dry-run]` | import the app's CSV exports into the database (see below) |

Workspace-specific commands work too, e.g. `npm run dev -w backend`, `npm install axios -w frontend`.

## Environment

`backend/.env` (never committed - it is git-ignored). Full list with comments in `backend/.env.example`.

| Variable | Notes |
|---|---|
| `MONGODB_URI` | **required** - Atlas (`mongodb+srv://...`) or local. URL-encode special characters in the password (`@` -> `%40`) |
| `JWT_SECRET` | **required in production** - the API refuses to start without it (no built-in fallback). `openssl rand -hex 48` |
| `NODE_ENV` | `production` on servers |
| `PORT` | default 5000 |
| `CORS_ORIGINS` | optional, comma-separated. Unset = any origin (Bearer-token API, no cookies) |
| `DNS_SERVERS` | optional, e.g. `8.8.8.8,8.8.4.4` - fixes Atlas `querySrv ECONNREFUSED` on restrictive networks (development already does this) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | optional first-run bootstrap of an Admin on an empty database; remove afterwards |

Web app: `REACT_APP_APIURL` is read at **build time** from `frontend/.env.development` / `.env.production`
(or from the environment, which wins). Empty means "same origin", which is what the single-server and Vercel
setups use. Set it to a full URL only if the API is hosted somewhere else.

The API must be started from `backend/` (the npm scripts and PM2 config do this): `.env`, `eng.traineddata`
(OCR) and `./uploads` are resolved from the working directory.

## Importing existing data (CSV)

The CSVs produced by each screen's **Export Data -> CSV** can be loaded into the database:

```bash
npm run import-csv -- "old data" --dry-run     # parse + validate every row, write nothing
npm run import-csv -- "old data"               # import
```

Expected file names: `7Heaven_Users.csv`, `7Heaven_Suppliers.csv`, `7Heaven_Guest_Inquiries.csv`, `7Heaven_Quotations.csv`
(any missing file is skipped). The import is **idempotent** - records that already exist (by email / Sr No / quotation number /
supplier name + phone) are never overwritten or duplicated - and guests / quotations are linked to the matching Sales / Ops users.

- CSVs contain no passwords, so each **new** user gets a unique random temporary password, written to
  `<folder>/IMPORTED_USER_LOGINS.csv` (local, git-ignored, never printed). Hand the logins out, delete the file,
  and let an Admin reset passwords in *User Management* if needed.
- A quotation CSV only holds the summary columns (client, destination, pricing...), so imported quotations have no itinerary or hotel details.

## Security & production notes

- **Secrets**: no secret lives in the source. The API validates its configuration at start-up and exits with a clear message when
  `MONGODB_URI` / `JWT_SECRET` are missing or are known placeholders. The database URI is never logged.
- **No default login**: create the first admin with `npm run create-admin` (or `ADMIN_EMAIL` / `ADMIN_PASSWORD` once).
- **Access control**: every route needs a valid session; rights are enforced on the server (the rights screens included), admins can only
  be managed by admins, nobody can lock themselves out, and deleting/deactivating a user ends their session immediately.
- **Hardening**: Helmet security headers + a strict Content-Security-Policy, login rate limiting (10 failed attempts / 15 min per IP + email),
  an API-wide rate limit, request size limits, input allow-lists on every update, regex/NoSQL-injection-safe search, bcrypt password hashing.
- **Sessions**: expired / invalid sessions return HTTP 401 and the web app signs the user out. Other API *business* errors still return HTTP 200
  with `success: false` (the web app and the Android app rely on that contract).
- **MongoDB Atlas**: allow only the IPs that need access under *Network Access* (the VPS address). `0.0.0.0/0` is needed only for Vercel, so keep the database
  password strong there. Use a database user limited to this one database (`readWrite`), not an Atlas admin.
- **Known accepted advisory**: `xlsx` (SheetJS 0.18.5, no fixed release on npm) is flagged by `npm audit`. The app only *writes* spreadsheets and never parses
  uploaded ones, which is where the advisories apply.
- `backend/src/.env` is an unused duplicate of `backend/.env` (the API reads `backend/.env`); delete it if you don't need it.

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Hostinger VPS (PM2 + Nginx + HTTPS) and Vercel.
