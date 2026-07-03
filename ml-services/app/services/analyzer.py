# services/analyzer.py
import re
import json

from app.core.prompts import SYSTEM_PROMPT
from app.models.incident import Incident
from app.models.request import IncidentRequest
from app.services.llm import ask_llm
from app.services.parser import parse_response
from app.connectors.weather import WeatherConnector


def _get_weather_context(latitude, longitude) -> str:
    try:
        if latitude is None or longitude is None:
            return ""
        print(f"  [weather] fetching for {latitude}, {longitude}")
        connector = WeatherConnector()
        weather = connector.fetch(latitude, longitude)
        print(f"  [weather] done")
        if weather is None:
            return ""
        return f"""
Weather at incident location:
- Temperature: {weather.temperature}°C
- Humidity: {weather.humidity}%
- Precipitation: {weather.precipitation}mm
- Rain: {weather.rain}mm
- Wind Speed: {weather.wind_speed} km/h
- Weather Code: {weather.weather_code}
"""
    except Exception as e:
        print(f"  [weather] failed: {e}")
        return ""


def _build_prompt(description: str, latitude, longitude, extra: str = "") -> str:
    if description:
        description = re.sub(r"<[^>]+>", " ", description)
        description = " ".join(description.split())
        description = description[:400]
    else:
        description = "No description available"

    weather_context = _get_weather_context(latitude, longitude)

    return f"""
Description:
{description}

Latitude:
{latitude}

Longitude:
{longitude}
{weather_context}
{extra}
"""


def analyze_incident(incident: IncidentRequest):
    user_prompt = _build_prompt(
        incident.description,
        incident.latitude,
        incident.longitude,
    )
    llm_result = ask_llm(SYSTEM_PROMPT, user_prompt)
    analysis = parse_response(llm_result["response"])
    return {
        "analysis": analysis.model_dump(),
        "metadata": {
            "model": llm_result["model"],
            "processing_time_ms": llm_result["processing_time_ms"],
        },
    }


def analyze_fetched_incident(incident: Incident):
    print(f"[ANALYZE] start: {incident.id}")
    extra = (
        f"\nSource: {incident.source}"
        f"\nCategory: {incident.category}"
        f"\nTitle: {incident.title}"
    )
    print(f"[ANALYZE] building prompt")
    user_prompt = _build_prompt(
        incident.description,
        incident.latitude,
        incident.longitude,
        extra,
    )
    print(f"[ANALYZE] calling LLM")
    llm_result = ask_llm(SYSTEM_PROMPT, user_prompt)
    print(f"[ANALYZE] LLM done in {llm_result['processing_time_ms']}ms")
    analysis = parse_response(llm_result["response"])
    print(f"[ANALYZE] complete: {incident.id}")
    return {
        "incident_id": incident.id,
        "source": incident.source,
        "analysis": analysis.model_dump(),
        "metadata": {
            "model": llm_result["model"],
            "processing_time_ms": llm_result["processing_time_ms"],
        },
    }