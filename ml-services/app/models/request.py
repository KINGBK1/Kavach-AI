from pydantic import BaseModel


class IncidentRequest(BaseModel):
    description: str
    latitude: float
    longitude: float