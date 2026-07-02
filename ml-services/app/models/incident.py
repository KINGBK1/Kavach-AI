from pydantic import BaseModel
from datetime import datetime


class Incident(BaseModel):
    id: str
    source: str

    title: str
    description: str

    category: str

    latitude: float | None = None
    longitude: float | None = None

    severity: str | None = None

    timestamp: datetime | None = None

    url: str | None = None