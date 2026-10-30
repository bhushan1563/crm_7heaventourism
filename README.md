# 7Heaven Luxury Travel CRM

Monorepo (npm workspaces) containing the Express/MongoDB API and the React/Vite web app.
In production **one Node process serves both** - the API under `/api` and the built web app on every other path.

```
.
├─ backend/              Express 4 + Mongoose API  (workspace "7heaven-server")
│  ├─ src/               server.js, routes, controllers, models, middleware, uploads/ (APK)
│  ├─ eng.traineddata    Tesseract OCR language data (read from the working directory)
│  └─ .env.example
├─ frontend/             React 18 + Vite web app    (workspace "client")
│  ├─ src/
│  ├─ .env.development   API URL for dev   (http://localhost:5000)
│  └─ .env.production    API URL for builds (empty = same origin)
├─ api/index.js          Vercel serverless entry (wraps backend/src/server.js)
├─ vercel.json           Vercel build + routing
├─ deploy/               Hostinger VPS: PM2 config, Nginx site, update script
├─ scripts/              create-admin.mjs, vercel-postbuild.mjs
├─ docs/DEPLOYMENT.md    Step-by-step: Hostinger VPS and Vercel
└─ package.json          workspaces + root scripts (single install, single lockfile)
```

## Requirements

- Node.js 20+ (22 LTS recommended - see `.nvmrc`)
- MongoDB (local `mongodb://127.0.0.1:27017` or Atlas)

## Run locally

```bash
npm install                                  # installs both apps (one lockfile)
cp backend/.env.example backend/.env         # then set MONGODB_URI / JWT_SECRET
npm run create-admin -- admin@7heaven.com 'ChangeMe123'   # only needed on an empty database
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
| `npm run build:vercel` | Vercel build: web app + copies the APK into `dist/static` |
| `npm run create-admin -- <email> <password> [first] [last]` | create an Admin user (idempotent) |

Workspace-specific commands work too, e.g. `npm run dev -w backend`, `npm install axios -w frontend`.

## Environment

`backend/.env` (never committed):

| Variable | Notes |
|---|---|
| `PORT` | default 5000 |
| `MONGODB_URI` | required |
| `JWT_SECRET` | use a long random value in production |
| `NODE_ENV` | `production` on servers |

Web app: `REACT_APP_APIURL` is read at **build time** from `frontend/.env.development` / `.env.production`
(or from the environment, which wins). Empty means "same origin", which is what the single-server and Vercel
setups use. Set it to a full URL only if the API is hosted somewhere else.

The API must be started from `backend/` (the npm scripts and PM2 config do this): `.env`, `eng.traineddata`
(OCR) and `./uploads` are resolved from the working directory.

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for Hostinger VPS (PM2 + Nginx + HTTPS) and Vercel.

## Known issues (existing behaviour, deliberately left unchanged)

- The first-run seed creates the default admin with role `SuperAdmin`, which the `User`/`Right` schemas reject, so on
  an empty database no admin is created. Use `npm run create-admin` (adds an `Admin`). Startup logs "Skipped SuperAdmin/..." - harmless.
- `backend/src/config/db.js` prints the full `MONGODB_URI` (including credentials) to the log.
- `JWT_SECRET` falls back to a hard-coded value in code if unset - always set it.
- API errors are returned as HTTP 200 with `success: false`.
- `backend/src/.env` is an unused duplicate (the API reads `backend/.env`).
