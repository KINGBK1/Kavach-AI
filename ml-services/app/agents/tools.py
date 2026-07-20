from typing import Any

from duckduckgo_search import DDGS

from app.connectors.weather import WeatherConnector
from app.services.citizen_reports import find_corroborating_incidents


def web_search(query: str, max_results: int = 5) -> list[dict[str, Any]]:
    """Search the web for news/articles related to this incident.

    Args:
        query: Search query string describing the incident
        max_results: Maximum number of search results to return

    Returns:
        List of search results with title, url, and snippet
    """
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        return results
    except Exception as e:
        return [{"error": f"Web search failed: {e}"}]


def check_database(
    latitude: float,
    longitude: float,
    category: str | None = None,
) -> list[dict[str, Any]]:
    """Check the database for confirmed incidents near this location.

    Searches the trusted incidents table for corroborating events
    within ~25km radius, same category, and within the last 24 hours.

    Args:
        latitude: Latitude of the incident location
        longitude: Longitude of the incident location
        category: Incident category (Flood, Earthquake, Wildfire, etc.)

    Returns:
        List of nearby confirmed incidents, empty if none found
    """
    return find_corroborating_incidents(latitude, longitude, category)


def get_weather(latitude: float, longitude: float) -> dict[str, Any]:
    """Get current weather conditions at the incident location.

    Fetches live weather data including temperature, humidity,
    precipitation, wind speed, and weather code.

    Args:
        latitude: Latitude of the location
        longitude: Longitude of the location

    Returns:
        Weather data dict or empty dict if unavailable
    """
    try:
        connector = WeatherConnector()
        weather = connector.fetch(latitude, longitude)
        if weather is None:
            return {}
        return {
            "temperature": weather.temperature,
            "humidity": weather.humidity,
            "precipitation": weather.precipitation,
            "rain": weather.rain,
            "wind_speed": weather.wind_speed,
            "weather_code": weather.weather_code,
        }
    except Exception as e:
        return {"error": f"Weather fetch failed: {e}"}
