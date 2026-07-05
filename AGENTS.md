# KAVACH / VARUNA — Ocean Disaster Management System

## Architecture

```
                     ┌──────────────────────────┐
                     │   React Frontend (Vite)  │
                     │   client/   :5173        │
                     └──────────┬───────────────┘
                                │ HTTP / WebSocket
                                ▼
                ┌────────────────────────────────────┐
                │   Rust Backend (Axum)   :8080      │
                │   backend/                         │
                │   - Auth (local + Google)          │
                │   - Incident CRUD                  │
                │   - Chat proxy                     │
                │   - Dashboard stats                │
                │   - WebSocket                      │
                │   - Scheduler (every 5min)         │
                └──────────┬─────────────────────────┘
                           │ HTTP (reqwest)
                           ▼
                ┌────────────────────────────────────┐
                │ Python ML Service (FastAPI) :8001   │
                │ ml-services/                       │
                │   - Aggregates 10+ data sources    │
                │   - Gemini LLM analysis            │
                │   - Chat Q&A                       │
                │   - Background scheduler           │
                └──────────┬─────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────────┐ ┌──────────┐ ┌──────────────┐
    │  PostgreSQL  │ │ Mail     │ │ Auth Server  │
    │  (Neon)      │ │ Service  │ │ (Node.js)    │
    └──────────────┘ └──────────┘ └──────────────┘
```

## Services

| Service | Language | Location | AGENTS.md |
|---------|----------|----------|-----------|
| Backend (API gateway) | Rust / Axum | `backend/` | [backend/AGENTS.md](backend/AGENTS.md) |
| Frontend | React 19 / Vite | `client/` | [client/AGENTS.md](client/AGENTS.md) |
| ML / Data Engine | Python / FastAPI | `ml-services/` | [ml-services/AGENTS.md](ml-services/AGENTS.md) |
| Mail Notifications | Python / FastAPI | `mailservice/` | [mailservice/AGENTS.md](mailservice/AGENTS.md) |
| Google Auth Fallback | Node.js / Express | `auth-server/` | _(minimal — single endpoint)_ |

## Tech Stack

- **Backend:** Rust, Axum, sqlx (Postgres), JWT (jsonwebtoken), bcrypt, tokio-tungstenite
- **Frontend:** React 19, Vite, React Router 7, Leaflet, Recharts, Axios, Lucide React
- **ML Service:** Python 3.11+, FastAPI, Gemini 2.5 Flash Lite (Vertex AI), SQLAlchemy
- **Mail Service:** Python 3.12+, FastAPI, smtplib, psycopg2
- **Auth Server:** Node.js, Express, google-auth-library, pg
- **Database:** PostgreSQL (Neon/Supabase)
- **Containerization:** Docker / distroless images

## Code Conventions (all services)

- `print()` / `tracing!()` for logging (no heavy logger frameworks)
- No comments in source code
- One concern per module pattern
- snake_case for Python/Rust, camelCase for JS/TS
