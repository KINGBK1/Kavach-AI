# AGENTS.md — Kavach-AI

## Architecture

4 independent services. Client talks only to the Rust backend, which proxies to the Python ML service.

```
React (Vite) → Rust/Axum (port 8080) → Python/FastAPI (port 8000) → PostgreSQL (Neon) + Vertex AI (Gemini)
                                    ↗ Node/Express (auth-server, port 8080) — separate Google OAuth quickfix
```

- **client/** — React + Vite, dashboard, map, alerts, citizen reporting, chat
- **backend/** — Rust/Axum, single API gateway, auth, JWT, proxies to ML service
- **ml-services/** — Python/FastAPI, data ingestion, dedup, Gemini analysis, chat RAG
- **auth-server/** — Standalone Node.js Google OAuth endpoint (shares same DB schema as Rust backend)

## Run locally

All three main services must run for end-to-end functionality.

**Backend (Rust):**
```bash
cd backend
# Set DATABASE_URL, JWT_SECRET in .env (see README for full list)
cargo run   # auto-runs migrations on startup
```

**ML service (Python):**
```bash
cd ml-services
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt --break-system-packages
uvicorn app.main:app --reload --port 8000
```

**Client (React):**
```bash
cd client
npm install
cp .env.example .env   # adjust VITE_BACKEND_URL, VITE_VARUNA_API_URL
npm run dev             # http://localhost:5173
```

## Lint / typecheck / test

Only the client has a linter. No typecheck or test suites exist.

```bash
cd client && npm run lint
```

There are no Rust clippy checks, no Python linter, no test frameworks configured.

## Environment variables

**Client (.env):**
- `VITE_BACKEND_URL` — Rust backend URL (default: `http://localhost:5000` in .env.example, but README says 8080)
- `VITE_VARUNA_API_URL` — ML service URL (default: `http://localhost:8000/api`)
- `VITE_GOOGLE_CLIENT_ID` — optional, enables Google sign-in

**Backend (.env):**
- `DATABASE_URL` — Postgres connection string (required)
- `JWT_SECRET` — signing secret (required)
- `AI_SERVICE_URL` — ML service URL (default: `http://localhost:8000`)
- `MAIL_SERVICE_URL` — alerts endpoint (default: `http://localhost:8001`, optional)
- `GOOGLE_CLIENT_ID` — optional, Google OAuth
- `PORT` — default 8080

**ML services (.env):**
- `DATABASE_URL`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` — required
- `BLUESKY_HANDLE`, `BLUESKY_PASSWORD` — Bluesky data connector
- `FIRMS_API_KEY` — NASA fire hotspot data
- `GEMINI_API_KEY` — present in .env.example but code uses Vertex AI (Application Default Credentials)

## Key gotchas

- **Migrations run automatically** on backend startup via `sqlx::migrate!("./migrations")`. Do not run them manually.
- **CORS is hardcoded** to `localhost:5173` and `kavach-ai-lemon.vercel.app` in `backend/src/main.rs`. If the client dev server uses a different port, you must update the CORS list.
- **Python `--break-system-packages`** is required for pip install on some systems (used in README).
- **auth-server is separate** — it's a quickfix Google OAuth endpoint, not the main auth flow. The Rust backend handles most auth.
- **Gemini access is via Vertex AI**, not a standalone API key. Use `gcloud auth application-default login` for local dev.
- **Citizen reports are never blindly trusted** — they require corroboration from an existing trusted incident nearby before being promoted. Unconfirmed reports go to a review queue.
- **No test infrastructure** — you cannot run tests. Focus on lint and manual verification.
- **Database tables** are created by migrations in `backend/migrations/`. Key tables: `users`, `incidents`, `analyses`, `citizen_reports`.
- **The `VITE_BACKEND_URL` in .env.example defaults to port 5000**, but the actual Rust backend runs on 8080. README shows 8080 as the correct default.

## Deployment

- Client: Vercel (with SPA rewrite in `client/vercel.json`)
- Backend + ML service: Cloud Run (Dockerfiles in each)
- Database: Neon (PostgreSQL)
