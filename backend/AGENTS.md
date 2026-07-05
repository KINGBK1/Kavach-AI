# KAVACH Backend — Rust Axum

## Tech Stack

- **Rust** with **Axum 0.8** web framework, **Tokio 1** async runtime
- **SQLx 0.8** with compile-time query checking (Postgres)
- **jsonwebtoken 10** for JWT, **bcrypt 0.19** for password hashing
- **reqwest 0.12** HTTP client (calls Python ML service)
- **tower-http 0.7** (CORS, tracing), **tokio-tungstenite** (WebSocket)
- **Docker** multi-stage build (rust-musl → distroless/static-debian12)

## Structure

```
src/
├── main.rs                    Entrypoint (pool, CORS, router)
├── state.rs                   AppState struct (PgPool, AiClient, JWT secret)
├── models/
│   ├── mod.rs                 Module declarations
│   ├── user.rs                User, PublicUser, Claims, auth request structs
│   ├── incident.rs            Incident, CitizenReport structs
│   ├── analysis.rs            AnalysisResult, ChatRequest, ChatResponse
│   └── resource.rs            Resource struct
├── routes/
│   ├── mod.rs                 Router aggregation (auth, incidents, chat, dashboard, ws)
│   ├── auth.rs                POST /register, /login, /google-login, GET /status, PATCH /approve/{id}
│   ├── incidents.rs           GET /, GET /analyze, POST /report
│   ├── chat.rs                POST /
│   ├── dashboard.rs           GET /
│   └── websocket.rs           WebSocket handling (GET /)
├── repository/
│   ├── mod.rs
│   ├── users.rs               UserRepository (Postgres queries on `users` table)
│   ├── incidents.rs           IncidentRepository
│   └── reports.rs             ReportsRepository
└── services/
    ├── mod.rs
    ├── ai_client.rs           HTTP proxy to Python ML service (reqwest)
    ├── auth_extractor.rs      Axum FromRequestParts: JWT → AuthUser
    ├── jwt.rs                 JWT generation/verification (7-day TTL)
    ├── google_auth.rs         Google ID token verification (JWKS)
    ├── notifier.rs            broadcast::Sender for real-time events
    ├── scheduler.rs           Periodic incident analysis (5 min)
    └── postgres.rs            Migration runner
```

## Route Registration

All routes are created in `routes/mod.rs::create_router()`, nested under `/api` in `main.rs`. Each route module exposes `fn router(state: Arc<AppState>) -> Router`.

## API Endpoints

| Endpoint                     | Method | Auth     | Description                        |
|------------------------------|--------|----------|------------------------------------|
| `/api/auth/health`           | GET    | No       | Service health                     |
| `/api/auth/ping`             | GET    | No       | Ping                               |
| `/api/auth/register`         | POST   | No       | Local signup                       |
| `/api/auth/login`            | POST   | No       | Local login                        |
| `/api/auth/google-login`     | POST   | No       | Google OAuth                       |
| `/api/auth/status`           | GET    | Bearer   | Current user                       |
| `/api/auth/approve/{id}`     | PATCH  | Admin    | Approve pending account            |
| `/api/incidents`             | GET    | No       | Raw incidents from DB              |
| `/api/incidents/analyze`     | GET    | No       | AI-analyzed incidents              |
| `/api/incidents/report`      | POST   | No       | Submit citizen report (AI analysis)|
| `/api/chat`                  | POST   | No       | Q&A over incidents                 |
| `/api/dashboard`             | GET    | No       | Dashboard stats                    |
| `/api/ws`                    | GET    | No       | WebSocket real-time feed           |

## Proxy Pattern

The Rust backend does **not** directly access the `incidents`/`analyses` tables. It forwards all AI/data requests to the Python ML service via `AiClient` (`services/ai_client.rs`). The backend only directly touches the `users` table in Postgres.

## Auth Flow

1. `AuthUser` extractor in `services/auth_extractor.rs` validates `Bearer <jwt>`
2. JWT contains `id` (UUID), `role` (string), `iat`, `exp` (7 days)
3. `services/jwt.rs` handles encode/decode with HS256
4. Google login uses `services/google_auth.rs` (JWKS-based RSA256 verification)

## Error Handling

Handlers return `Result<Json<Value>, (StatusCode, Json<Value>)>`. Use the `err()` helper pattern for error responses: `err(StatusCode::BAD_REQUEST, "message")`.

## Code Conventions

- `//` comments only for module-level documentation, never inline
- `anyhow` for error propagation in services; `thiserror` for domain errors
- Use `serde::Deserialize` for query params, `Json<T>` for POST bodies
- SQLx queries are compiled at build time — keep queries in `.sql` files or use `sqlx::query_as!`
- Run `cargo check` after making changes
