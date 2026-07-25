import json
import math

import psycopg2
import psycopg2.extras

from app.config import DATABASE_URL


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def find_nearby_users(lat: float, lng: float, radius_km: float) -> list[dict]:
    if lat is None or lng is None:
        return []

    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT email, latitude, longitude, preferences
            FROM users
            WHERE latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND email IS NOT NULL
            """
        )
        rows = cur.fetchall()
    finally:
        conn.close()

    nearby = []
    for row in rows:
        prefs = row["preferences"]
        if isinstance(prefs, str):
            try:
                prefs = json.loads(prefs)
            except (json.JSONDecodeError, TypeError):
                prefs = {}
        if not prefs.get("emailAlerts", True):
            continue

        user_lat = float(row["latitude"])
        user_lng = float(row["longitude"])
        dist = haversine(lat, lng, user_lat, user_lng)
        if dist <= radius_km:
            nearby.append({
                "email": row["email"],
                "distance_km": round(dist, 1),
            })

    return nearby
