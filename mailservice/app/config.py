import os

from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is not set")

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "KAVACH Alerts <alerts@kavach.local>")

ALERT_RADIUS_KM = float(os.getenv("ALERT_RADIUS_KM", "0"))

DISASTER_RADII = {
    "earthquake": 150,
    "tsunami": 80,
    "cyclone": 120,
    "volcano": 50,
    "wildfire": 25,
    "flood": 30,
    "storm": 60,
    "landslide": 10,
    "other": 25,
}

DISASTER_CONFIG = {
    "earthquake": {"radius": 150, "shape": "circle"},
    "tsunami": {"radius": 80, "shape": "coastal"},
    "cyclone": {"radius": 120, "shape": "forecast_cone"},
    "volcano": {"radius": 50, "shape": "circle"},
    "wildfire": {"radius": 25, "shape": "wind_dependent"},
    "flood": {"radius": 30, "shape": "river_basin"},
    "storm": {"radius": 60, "shape": "circle"},
    "landslide": {"radius": 10, "shape": "localized"},
    "other": {"radius": 25, "shape": "circle"},
}


def get_radius(incident_type: str, category: str) -> float:
    radii = DISASTER_RADII
    for key in (incident_type, category):
        key_lower = key.strip().lower()
        if key_lower in radii:
            return float(radii[key_lower])
    return float(radii["other"])
