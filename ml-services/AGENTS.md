# KAVACH ML Services — Python / FastAPI Data Engine

## Tech Stack

- **Python 3.11+** with **FastAPI**, **Uvicorn**
- **Gemini 2.5 Flash Lite** via **google-genai** (Vertex AI)
- **SQLAlchemy 2.0** + **psycopg2-binary** (Postgres)
- **RapidFuzz** for fuzzy deduplication
- **atproto** (Bluesky API), **requests** for data connectors
- External data: NASA EONET, USGS, GDACS, FIRMS, GDELT, Google News, ReliefWeb, Bluesky, Reddit, Open-Meteo

## Structure

```
ml-services/
├── Dockerfile
├── requirements.txt
├── .env
└── app/
    ├── __init__.py
    ├── main.py                    FastAPI app, router includes, init_db, startup scheduler
    ├── api/                       REST endpoints
    │   ├── health.py              GET /health
    │   ├── analyze.py             POST /analyze, GET /analyze/all, /analyze/dashboard
    │   ├── sources.py             GET /sources — per-source & /sources/all (DB)
    │   ├── chat.py                POST /chat — natural language Q&A
    │   └── analytics.py           Analytics endpoints
    ├── core/
    │   ├── config.py              Gemini config (gemini-2.5-flash-lite via Vertex AI)
    │   ├── db.py                  DB init + session management
    │   ├── logger.py              Logging setup
    │   ├── models.py              SQLAlchemy ORM models
    │   └── prompts.py             LLM system prompts
    ├── models/                    Pydantic schemas
    │   ├── incident.py            Incident data model
    │   ├── request.py             IncidentRequest
    │   ├── response.py            API response schemas
    │   └── weather.py             Weather data model
    ├── connectors/                External data source fetchers
    │   ├── base.py                Abstract BaseConnector (fetch + normalize)
    │   ├── nasa.py                NASA EONET events
    │   ├── usgs.py                USGS earthquakes
    │   ├── gdacs.py               GDACS disaster alerts
    │   ├── gdelt_news.py          GDELT global news
    │   ├── google_news.py         Google News RSS (free)
    │   ├── reliefweb.py           ReliefWeb humanitarian data
    │   ├── bluesky.py             Bluesky social media
    │   ├── firms.py               NASA FIRMS fire/hotspots
    │   ├── reddit.py              Reddit disaster keywords
    │   └── weather.py             Open-Meteo weather (free)
    ├── services/
    │   ├── aggregator.py          IncidentAggregator (fetches all connectors, deduplicates)
    │   ├── analyzer.py            Gemini analysis of incidents (severity, type, actions)
    │   ├── chat.py                Chat Q&A pipeline
    │   ├── deduplicator.py        Fuzzy deduplication via RapidFuzz
    │   ├── llm.py                 Gemini LLM wrapper (ask_llm)
    │   ├── parser.py              Parse LLM responses to structured data
    │   ├── query_parser.py        Parse NL queries → DB filters
    │   ├── retriever.py           Retrieve relevant incidents for chat
    │   ├── scheduler.py           Background fetch + analyze loop
    │   └── store.py               CRUD for incidents + analyses in DB
    ├── agents/                    AI agent definitions
    └── utils/
        └── helpers.py             Utility functions
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + model name |
| POST | `/analyze` | Analyze a submitted incident report |
| GET | `/analyze/all` | Get all analyses |
| GET | `/analyze/dashboard` | Dashboard summary from analyses |
| GET | `/sources` | List all data source connectors |
| GET | `/sources/all` | Fetch + deduplicate from all sources |
| POST | `/chat` | Natural language Q&A over incidents |
| GET | `/sources/{name}` | Fetch from specific source |

## Data Pipeline (Scheduler)

1. **Fetch:** Every connector implements `BaseConnector.fetch()` → list of raw incidents
2. **Normalize:** Each connector maps raw data to a common `Incident` schema
3. **Deduplicate:** `RapidFuzz` fuzzy matching on title + location to merge duplicates
4. **Analyze:** Each deduplicated incident → Gemini LLM → severity, type, recommended actions
5. **Store:** Incidents + analyses written to Postgres via SQLAlchemy

## Chat Flow

1. User sends natural language question (e.g. "latest earthquakes in Indonesia")
2. `query_parser.py` converts to structured filters (type, location, time range)
3. `retriever.py` queries DB for matching incidents
4. Prompt + incidents → Gemini LLM → natural language answer

## Data Connectors

| Connector | Source | Free/API Key |
|-----------|--------|-------------|
| NASA | EONET API | Free |
| USGS | Earthquake Hazards | Free |
| GDACS | Disaster Alerts | Free |
| FIRMS | Fire/Hotspots | Free |
| GDELT News | Global News DB | Free |
| Google News | RSS Feed | Free (no key) |
| ReliefWeb | OCHA | Free |
| Bluesky | AT Protocol | Free |
| Reddit | Pushshift/API | Free |
| Weather | Open-Meteo | Free (no key) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string |
| `GOOGLE_CLOUD_PROJECT` | GCP project for Vertex AI |
| `GOOGLE_CLOUD_LOCATION` | Vertex AI location |
| `GEMINI_MODEL` | Gemini model name (default: gemini-2.5-flash-lite) |
| `FIRMS_API_KEY` | NASA FIRMS API key |

## Code Conventions

- `print()` for logging with `flush=True`
- No comments in source code
- One service per module
- Abstract `BaseConnector` for all data sources
- Pydantic v2 for all schemas
