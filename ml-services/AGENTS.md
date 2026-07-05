# KAVACH ML Services — Python FastAPI

## Tech Stack

- **Python 3.11** with **FastAPI 0.115**, **Uvicorn 0.30**
- **Pydantic 2.8** for data validation, **Google Gemini** (`gemini-2.5-flash-lite` via Vertex AI)
- **psycopg2-binary** (raw Postgres access), **SQLAlchemy 2.0** (ORM for analytics queries)
- **rapidfuzz** for fuzzy deduplication, **atproto** for Bluesky social feed
- **Docker** (python:3.11-slim), port 8080

## Structure

```
app/
├── main.py                    FastAPI app with CORS, startup scheduler
├── api/
│   ├── __init__.py
│   ├── health.py              GET /health
│   ├── analyze.py             POST /analyze, GET /analyze/all, GET /analyze/dashboard
│   ├── sources.py             GET /sources/{nasa,usgs,gdacs,firms,reddit,bluesky,google-news,weather,all}
│   ├── analytics.py           GET /analytics/{history,trends,categories,timeline,countries}
│   └── chat.py                POST /chat
├── core/
│   ├── config.py              Gemini client init (Vertex AI, project, location)
│   ├── db.py                  psycopg2 connection pool + SQLAlchemy engine/session
│   ├── models.py              SQLAlchemy ORM models: IncidentModel, AnalysisModel, AnalysisHistoryModel
│   ├── prompts.py             LLM system prompts (JSON output, severity scoring)
│   └── logger.py              Placeholder
├── models/
│   ├── incident.py            Pydantic Incident model
│   ├── request.py             Pydantic IncidentRequest (description, lat, lng)
│   ├── response.py            Pydantic IncidentResponse (analysis output)
│   └── weather.py             Pydantic Weather model
├── connectors/                                           ← 11 data source connectors
│   ├── base.py                Abstract BaseConnector (fetch + normalize)
│   ├── nasa.py                NASA EONET (natural events)
│   ├── usgs.py                USGS Earthquakes
│   ├── gdacs.py               GDACS (global disaster alerts)
│   ├── weather.py             Open-Meteo (free weather)
│   ├── firms.py               NASA FIRMS (wildfire hotspots)
│   ├── reddit.py              Reddit search
│   ├── bluesky.py             Bluesky AT Protocol
│   ├── google_news.py         Google News RSS (free, no API key)
│   ├── gdelt_news.py          GDELT global news monitoring
│   └── reliefweb.py           ReliefWeb humanitarian reports
├── services/
│   ├── llm.py                 Gemini API wrapper (generate_content, fallback)
│   ├── analyzer.py            Incident analysis pipeline (build prompt, call LLM, parse)
│   ├── aggregator.py          Multi-source fetch (8 connectors, dedup, filter)
│   ├── scheduler.py           Background loop: fetch all → dedup → save → analyze (30 min interval)
│   ├── store.py               Postgres read/write for incidents & analyses (raw psycopg2)
│   ├── retriever.py           Incident retrieval with filters (SQLAlchemy ORM)
│   ├── chat.py                Q&A pipeline: parse → retrieve → LLM → parse response
│   ├── query_parser.py        NL query intent/location/category/time extraction
│   ├── deduplicator.py        Fuzzy dedup: exact ID → exact URL → fuzzy title (rapidfuzz)
│   └── parser.py              LLM JSON response parser (extract valid JSON, retry)
├── agents/
│   └── __init__.py            Placeholder
└── utils/
    └── helpers.py             Placeholder
```

## Database Schema

| Table              | Key                          | Used By                          |
|--------------------|------------------------------|----------------------------------|
| `incidents`        | `id` TEXT PK                 | store.py (raw), retriever (ORM)  |
| `analyses`         | `incident_id` TEXT PK (FK)   | store.py (raw), retriever (ORM)  |
| `analysis_history` | `id` SERIAL PK               | store.py (raw)                   |
| `users`            | (managed by Rust backend)    | not accessed by Python           |

## Gemini AI Pipeline

- Model: `gemini-2.5-flash-lite` via Vertex AI (`google-genai` SDK)
- Temperature: 0.2 (deterministic), JSON response format requested
- System prompt enforces: severity (Low/Moderate/High/Critical), priority_score (0-100), confidence (0-1), recommended_actions array
- Weather context (Open-Meteo) fetched before each analysis for improved severity estimates
- Rate limiting: exponential backoff on 429/RESOURCE_EXHAUSTED, 4s minimum gap between calls

## Background Scheduler

`services/scheduler.py` runs every 30 minutes:
1. Fetch incidents from all 8 connectors via `IncidentAggregator`
2. Save to Postgres (`store.save_incidents`)
3. Identify pending (unanalyzed) incidents
4. Analyze each with Gemini (`analyze_fetched_incident`), 4s throttle between calls
5. Save analysis results (`store.save_analysis`)

## Data Connector Pattern

All connectors extend `BaseConnector` (abstract): `fetch()` returns raw data, `normalize(raw)` returns `list[Incident]`. Each connector caps at 100 items per cycle.

## Code Conventions

- Module imports: stdlib → third-party → app modules, one group per section
- `print(...)` for logging (no structured logger configured yet)
- `flush=True` on all print calls in long-running tasks
- Pydantic models for API contracts; raw dicts for internal DB reads
- No comments in source code
- `camelCase` for JSON field names; `snake_case` for Python code
