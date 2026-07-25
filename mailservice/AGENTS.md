# KAVACH Mail Service — FastAPI

## Tech Stack

- **Python 3.12** with **FastAPI**, **Uvicorn**
- **Pydantic v2** for request/response schemas
- **psycopg2-binary** for Postgres (reads `users` table for nearby users)
- **smtplib** (stdlib) for Gmail SMTP — no extra email deps
- **`uv`** package manager

## Structure

```
mailservice/
├── main.py                    (unused — entry is uvicorn app.main:app)
├── pyproject.toml
├── Dockerfile
├── .env.example
└── app/
    ├── __init__.py
    ├── main.py                FastAPI app + CORS
    ├── config.py              Env vars + DISASTER_RADII + DISASTER_CONFIG
    ├── schemas.py             AlertTrigger, AlertResponse
    ├── geolocation.py         Haversine distance + find_nearby_users()
    ├── emailer.py             Gmail SMTP send_alerts()
    ├── router.py              POST /alerts, GET /health
    └── templates/
        └── alert_email_html.py  HTML template renderer
```

## API Endpoints

| Method | Path       | Description                                |
|--------|------------|--------------------------------------------|
| GET    | `/health`  | Service health check                       |
| POST   | `/alerts`  | Trigger email alerts for an incident       |

## POST /alerts Flow

1. Receive `AlertTrigger` (incident details from ML scheduler)
2. Lookup radius by `incident_type` then `category` from `DISASTER_RADII`
3. Query `users` table for all users with lat/lng + email + emailAlerts=true
4. Filter by Haversine distance < radius
5. Send HTML email via Gmail SMTP to each matching user
6. Return `AlertResponse` with sent/failed counts

## Disaster Radii

Defined in `config.py`. Radius is selected by matching `incident_type` first, then `category`, falling back to `"other": 25`.

## Environment Variables

| Variable         | Default              | Description                     |
|------------------|----------------------|---------------------------------|
| `DATABASE_URL`   | required             | Postgres connection (users DB)  |
| `SMTP_HOST`      | smtp.gmail.com       | SMTP server                     |
| `SMTP_PORT`      | 587                  | SMTP port (STARTTLS)            |
| `SMTP_USER`      | ""                   | Gmail address                   |
| `SMTP_PASSWORD`  | ""                   | Gmail App Password              |
| `FROM_EMAIL`     | KAVACH Alerts <...>  | Sender address                  |

## Code Conventions

- `print()` for logging with `flush=True`
- No comments in source code
- One service per module pattern
