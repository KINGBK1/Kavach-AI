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
    location: str | None = None
    country: str | None = None



    status: str | None = None

    source_updated_at: datetime | None = None

    expected_end: datetime | None = None