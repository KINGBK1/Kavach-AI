# KAVACH-AI / VARUNA — Project Overview

Unified disaster intelligence platform. Fetches and analyzes incidents from 10+ external sources using AI (Gemini), visualised on a live map with severity scoring.

## Architecture

```
React 19 + Vite 7    ──HTTP/JWT──>   Rust Axum (port 8080)   ──HTTP──>   Python FastAPI (port 8000)
(Frontend / Vercel)                  (Backend / Cloud Run)               (ML Service / Cloud Run)
                                         │                                      │
                                         ▼                                      ▼
                                   PostgreSQL (Neon)                     PostgreSQL (same DB)
                                   tables: users                        tables: incidents, analyses
```

## Ports

| Service   | Default Port | Tech                |
|-----------|-------------|---------------------|
| Frontend  | 5173        | React 19 + Vite 7   |
| Backend   | 8080        | Rust + Axum 0.8     |
| ML        | 8000        | Python + FastAPI    |
| Auth-N    | 3001        | Node + Express      |

## Directory Map

- `client/` — React frontend (JSX, CSS, Recharts, Leaflet)
- `backend/` — Rust backend (Axum, SQLx, JWT, reqwest)
- `ml-services/` — Python ML service (FastAPI, Gemini, psycopg2, SQLAlchemy)
- `auth-server/` — Standalone Node.js auth server (Express, Google Sign-In)

## Key Conventions (project-wide)

- Zero comments in source code unless the comment explains *why*, not *what*
- Follow existing patterns in the respective subdirectory
- Run `npm run lint` (client) / `cargo check` (backend) after making changes
- Never commit secrets or `.env` files
- Service-level AGENTS.md files in `client/`, `backend/`, `ml-services/` for technology-specific conventions
