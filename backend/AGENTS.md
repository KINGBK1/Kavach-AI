# KAVACH Backend — Rust / Axum API Gateway

## Tech Stack

- **Rust 1.95** with **Axum 0.8**, **Tokio**, **Tower**
- **sqlx 0.8** (Postgres, compile-time checked queries)
- **jsonwebtoken** (JWT) + **bcrypt** for auth
- **tokio-tungstenite** for WebSocket push
- **reqwest** to proxy chat to Python ML service
- Cross-compiled to **musl** → deployed on **distroless/static-debian12**

## Structure

```
backend/
├── Cargo.toml
├── Dockerfile
├── migrations/
└── src/
    ├── main.rs                 Entry point: Axum router, CORS, DB pool, migrations
    ├── state.rs                AppState (db pool, ML URL, JWT secret, HTTP client)
    ├── models/                 Serde data models
    │   ├── user.rs             User, PublicUser, AuthResponse, LoginRequest, RegisterRequest
    │   ├── incident.rs         Incident, ReportRequest
    │   ├── analysis.rs         Analysis models
    │   └── resource.rs         Resource models
    ├── repository/             Database access (sqlx queries)
    │   ├── users.rs            UserRepository
    │   ├── incidents.rs        IncidentRepository
    │   └── reports.rs          ReportRepository
    ├── routes/                 HTTP handlers
    │   ├── mod.rs              create_router() — nests all under /api
    │   ├── auth.rs             /api/auth/*  (register, login, google-login, profile, approve)
    │   ├── incidents.rs        /api/incidents/*  (list, analyze, report)
    │   ├── chat.rs             /api/chat  (POST question → AI answer via ML service)
    │   ├── dashboard.rs        /api/dashboard/*  (stats aggregation)
    │   └── websocket.rs        /api/ws  (real-time push)
    └── services/
        ├── postgres.rs         Migration runner
        ├── auth.rs             Auth helpers
        ├── auth_extractor.rs   Axum extractor for JWT
        ├── jwt.rs              Token generation / verification
        ├── google_auth.rs      Google ID token verification
        ├── ai_client.rs        HTTP client to Python ML service
        ├── notifier.rs         Alert / notification service
        └── scheduler.rs        Background task (polls ML every 5min)
```

## API Endpoints (all under `/api`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Register new user |
| POST | `/auth/login` | No | Login (returns JWT) |
| POST | `/auth/google-login` | No | Google OAuth login |
| GET | `/auth/profile` | Yes | Get current user profile |
| PUT | `/auth/approve` | Admin | Approve pending users |
| GET | `/incidents` | Yes | List incidents |
| POST | `/incidents/analyze` | Yes | Analyze incident via AI (sends to ML service) |
| POST | `/incidents/report` | Yes | Submit new report |
| GET | `/dashboard/*` | Yes | Dashboard statistics |
| POST | `/chat` | Yes | Ask AI question (proxied to ML service) |
| WS | `/ws` | Yes | WebSocket real-time updates |
| GET | `/health` | No | Health check |

## Auth Flow

1. **Local:** Register (bcrypt hash) → Login → JWT (access token)
2. **Google:** ID token from client → verify via google-auth-library → upsert user → JWT
3. **Protected routes:** `AuthExtractor` extractor reads `Authorization: Bearer <token>` header
4. **Admin users:** `role` field in JWT checked for admin-only endpoints

## Background Scheduler

- Runs every **5 minutes**
- Calls ML service's `/sources/all` to re-aggregate all data sources
- Updates incidents in the database

## DB Tables

- `users` — id, name, email, password_hash, role, lat, lng, email_alerts, approved
- `incidents` — id, title, description, category, severity, lat, lng, source, reported_at
- `analyses` — id, incident_id, analysis_text, severity, created_at
- `reports` — id, user_id, incident_id, description, status, created_at

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | required | Postgres connection string |
| `JWT_SECRET` | required | JWT signing secret |
| `AI_SERVICE_URL` | required | URL of Python ML service |
| `GOOGLE_CLIENT_ID` | required | Google OAuth client ID |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `PORT` | `8080` | Server port |

## Build & Run

```bash
cargo run              # development
cargo build --release  # production
docker build -t backend . && docker run -p 8080:8080 backend
```

## Code Conventions

- `tracing!` macros for logging
- No comments in source code
- One module per concern
- `thiserror` for error types
