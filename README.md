# Kavach — AI-Powered Disaster Intelligence Platform

**Live demo:** https://kavach-ai-lemon.vercel.app

Kavach ingests live disaster data from multiple public sources, uses Google's Gemini model (via Vertex AI) to triage and prioritize every incident, and gives responders, NGOs, and citizens a natural-language interface to ask questions grounded in that real data — instead of manually cross-referencing feeds during a time-critical event.

---

## The problem

Disaster response agencies currently rely on multiple disconnected sources — government feeds, seismic/weather data, news, and citizen reports — each living in its own silo. Cross-referencing them manually costs time, and during an active disaster, minutes matter.

## What Kavach does

- **Ingests** live incident data from multiple external sources (seismic activity, disaster alerts, satellite fire detection, and news/social sources).
- **Deduplicates** incidents reported by more than one source, so the same real-world event doesn't appear multiple times.
- **Analyzes** every incident with Gemini (via Vertex AI): severity, priority score, a plain-language summary, and recommended actions.
- **Answers questions in natural language** — a Gemini-powered chat assistant that retrieves the relevant stored incidents and answers strictly from that data, rather than guessing.
- **Accepts citizen reports**, triages them with the same Gemini pipeline, and cross-checks them against the trusted incident feed (same location, category, and time window) before treating them as confirmed — anything unconfirmed goes to a human review queue instead of being trusted automatically.
- **Surfaces everything** through a dashboard, a live incident map, and a filtered "needs attention" alerts view.

---

## Architecture

```
React (Vite) client
        │
        ▼
Rust backend (Axum) — single API gateway, auth, JWT
        │
        ▼
Python service (FastAPI) — data ingestion, dedup, Gemini analysis, chat RAG
        │              │
        ▼              ▼
PostgreSQL (Neon)   Vertex AI (Gemini)
```

- **Client** — React + Vite. Dashboard, live map, alerts, incident log with citizen reporting, chat assistant, and a review queue for verified accounts (admin/NGO/DDMO roles).
- **Backend (Rust / Axum)** — the only service the frontend talks to. Handles auth (username/password + Google OAuth), issues JWTs, and proxies incident/chat/report requests to the Python service.
- **ML service (Python / FastAPI)** — pulls from external data sources on a schedule, deduplicates, calls Gemini for structured analysis, stores results, and serves the chat and citizen-report endpoints.
- **Database** — PostgreSQL, hosted on Neon.
- **AI** — Google Gemini via Vertex AI, used for incident triage and for the retrieval-augmented chat assistant.

Each service is independently deployable, which was deliberate — the ingestion/AI layer can scale or be redeployed without touching the API gateway or client.

---

## Key design decision: citizen reports are never blindly trusted

Anyone can submit a ground report, and it's triaged by Gemini immediately. But a citizen report only becomes a **verified, alert-triggering incident** if it's corroborated — a real, already-trusted incident exists nearby in location, category, and time. Otherwise, it's saved honestly as unverified and placed in a review queue for a human (an approved NGO/DDMO/admin account) to promote or reject. This was a deliberate tradeoff to prevent a single spam or mistaken report from triggering a false alarm, while still capturing every report for later human review.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite |
| API gateway | Rust, Axum |
| AI / data service | Python, FastAPI |
| Database | PostgreSQL (Neon) |
| AI model | Google Gemini via Vertex AI |
| Auth | JWT + Google OAuth |
| Deployment | Vercel (frontend), Cloud Run (backend services) |

---

## Status

This was built for a hackathon submission and is a working prototype, not a production system. Known limitations:
- Predictive/forecasting capability is not yet implemented — the platform currently classifies and triages real-time data rather than forecasting future events.
- The citizen-report review queue has a working API and a minimal UI; a fuller admin experience is a natural next step.
- Location-based alerting depends on users granting browser geolocation — this is requested automatically on login, with a manual retry if it fails.

---

## Running it locally

The project has three services: the Rust API gateway, the Python AI/data service, and the React client. All three need to be running for the app to work end to end.

### Prerequisites

- Rust (stable toolchain) + Cargo
- Python 3.12+ and pip
- Node.js 18+ and npm
- A PostgreSQL database (e.g. a free [Neon](https://neon.tech) project)
- A Google Cloud project with the Vertex AI API enabled, and credentials available to the Python service (e.g. `gcloud auth application-default login`, or a service account key)

### 1. Database

Create a Postgres database and note its connection string. The required tables (`users`, `incidents`, `analyses`, `citizen_reports`) are created via the migration files in `backend/migrations/`.

### 2. Backend (Rust)

```bash
cd backend
```

Set the following environment variables (e.g. in a `.env` file, or exported in your shell):

```bash
DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require
JWT_SECRET=some-long-random-secret
AI_SERVICE_URL=http://localhost:8000      # defaults to this if unset
MAIL_SERVICE_URL=http://localhost:8001    # defaults to this if unset
GOOGLE_CLIENT_ID=your-google-oauth-client-id   # optional, only needed for Google sign-in
PORT=8080                                  # optional, defaults to 8080
```

Run migrations and start the server:

```bash
cargo run
```

`sqlx::migrate!` runs automatically on startup and applies everything in `backend/migrations/`.

### 3. AI / data service (Python)

```bash
cd ml-services
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt --break-system-packages
```

Set the following in a `.env` file inside `ml-services/`:

```bash
DATABASE_URL=postgresql://<user>:<password>@<host>/<db>?sslmode=require
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1

# Used by the Bluesky data connector (one of the ingestion sources)
BLUESKY_HANDLE=your-bluesky-handle
BLUESKY_PASSWORD=your-bluesky-app-password

# NASA FIRMS (fire hotspot data) — free API key from https://firms.modaps.eosdis.nasa.gov/api/
FIRMS_API_KEY=your-firms-api-key

# See "Optional: mail/alert service" below — the app runs fine without this set
MAIL_SERVICE_URL=http://localhost:8001
```

Gemini access is via **Vertex AI** using `GOOGLE_CLOUD_PROJECT`/`GOOGLE_CLOUD_LOCATION` and your machine's Application Default Credentials (`gcloud auth application-default login`) — not a standalone API key, so no separate Gemini key is required for the code paths currently in use.

Start the service:

```bash
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` to confirm the API is up and see all available routes.

### 4. Frontend (React)

```bash
cd client
npm install
```

Copy `.env.example` to `.env` and adjust as needed:

```bash
VITE_BACKEND_URL=http://localhost:8080
VITE_VARUNA_API_URL=http://localhost:8000/api
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id   # optional
```

Start the dev server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173` (or whatever port Vite reports).

### 5. Sign up and use it

Sign up as a regular user to explore the dashboard, map, chat, and citizen reporting. To test the review queue, sign up with an NGO/DDMO role and approve the account manually in the `users` table (`is_approved = true`), or create an `admin` account directly in the database.

---

## Optional: mail/alert service

Alerts are sent by POSTing to `MAIL_SERVICE_URL/alerts` whenever a scraped incident is analyzed or a citizen report is corroborated. This service is **not included in this repository** — it's a separate service you build and point `MAIL_SERVICE_URL` at (Node.js/Express is a reasonable choice, but any framework works, since the contract is just a JSON POST to `/alerts`). If `MAIL_SERVICE_URL` is unset or unreachable, alert requests simply fail silently (logged as a warning) without affecting the rest of the app.
