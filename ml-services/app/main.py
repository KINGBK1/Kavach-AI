import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.sources import router as sources_router
from app.api.analyze import router as analyze_router
from app.api.health import router as health_router
from app.api.analytics import router as analytics_router
from app.core.db import init_db
from app.api.chat import router as chat_router
from app.services.scheduler import run_scheduler

app = FastAPI(
    title="VARUNA AI Service",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(run_scheduler())

app.include_router(health_router)
app.include_router(analyze_router)
app.include_router(sources_router)
app.include_router(chat_router)
app.include_router(analytics_router)