import asyncio
import json
import re
import time

from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.runners import InMemoryRunner
from google.adk.tools.function_tool import FunctionTool

from app.connectors.web_search import web_search as exa_search
from app.connectors.weather import WeatherConnector
from app.services.citizen_reports import find_corroborating_incidents
from app.core.config import MODEL_NAME


def _search_web(query: str) -> str:
    """Search the web for RECENT news articles (published in the last few
    days) about this incident to verify if it's real.

    Call this tool to find real, current news coverage, official reports,
    or social media posts about the incident. Use the description and
    location as the query. Results are restricted to recent publications —
    an empty result means no recent coverage was found, not that the topic
    has never been covered (older, unrelated historical coverage is
    deliberately excluded so it can't be mistaken for evidence of a
    CURRENT event).

    Args:
        query: A detailed search query combining the incident description and location
    Returns:
        A JSON string with search results: each result has title, url,
        published (date), and snippet fields. Returns empty string if no
        recent results or if search is unavailable.
    """
    return exa_search(query)


def _get_weather(latitude: float, longitude: float) -> str:
    """Get current weather conditions at the incident location.

    Call this tool to check if weather conditions intensify or mitigate
    the reported incident. For example, high wind + low humidity worsens
    a wildfire; heavy ongoing rain validates a flood report.

    Args:
        latitude: Latitude of the incident
        longitude: Longitude of the incident
    Returns:
        A JSON string with temperature, humidity, precipitation, wind,
        and weather code, or empty string if unavailable.
    """
    try:
        connector = WeatherConnector()
        weather = connector.fetch(latitude, longitude)
        if weather is None:
            return json.dumps({"error": "Weather data unavailable"})
        return json.dumps({
            "temperature_c": weather.temperature,
            "humidity_pct": weather.humidity,
            "precipitation_mm": weather.precipitation,
            "rain_mm": weather.rain,
            "wind_speed_kmh": weather.wind_speed,
            "weather_code": weather.weather_code,
        })
    except Exception as e:
        print(f"  [agent] Weather fetch failed: {e}")
        return json.dumps({"error": str(e)})


def _check_db(latitude: float, longitude: float, category: str) -> str:
    """Check the database for trusted/confirmed incidents near these coordinates.
    
    Call this tool to see if any trusted sources (NASA, USGS, GDACS, etc.)
    have already confirmed an incident near this location with the same category.
    
    Args:
        latitude: Latitude of the reported incident
        longitude: Longitude of the reported incident
        category: Category of the incident (e.g. Flood, Earthquake, Fire, Cyclone, etc.)
    Returns:
        A JSON string with matching incidents, or empty list if none found.
    """
    try:
        results = find_corroborating_incidents(latitude, longitude, category)
        return json.dumps(results, default=str, indent=2)
    except Exception as e:
        print(f"  [agent] DB check failed: {e}")
        return json.dumps([])


AGENT_INSTRUCTION = """You are VARUNA AI's incident verification agent. Your ONLY job is to analyze citizen reports and determine if they are real using web search, weather context, and database evidence.

YOUR WORKFLOW — follow EXACTLY:
1. Call web_search() with a query combining the description and location — search for recent news
2. Call get_weather() to get current weather conditions at the location
3. Call check_db() with the latitude, longitude, and category
4. Analyze ALL evidence and decide the verdict
5. Output ONLY valid JSON — NO other text

ABSOLUTE RULES — you MUST obey:
- You MUST call web_search() at least once
- You MUST call get_weather() at least once
- You MUST call check_db() at least once
- Your final output MUST be ONLY the JSON object below — nothing else
- NO introductory text, NO explanation, NO markdown, NO ```json markers
- The JSON MUST be valid and complete
- If you output anything other than pure JSON, the system will break

EVIDENCE WEIGHTING FOR CONFIDENCE:
- Web search with 2+ recent relevant articles: strong evidence (+0.3 to confidence)
- Web search with 1 relevant article: moderate evidence (+0.15)
- DB corroboration (trusted source nearby): strong evidence (+0.25 each)
- Weather context that matches the incident type (e.g. heavy rain for flood, high wind for cyclone): supporting evidence (+0.1)
- Weather context that contradicts the incident type (e.g. clear skies for flood): reduces confidence (-0.15)
- Multiple sources agreeing: confidence multiplier

CONFIDENCE CALIBRATION — be honest, not inflated:
- 0.8-1.0: Multiple independent confirmations (web articles AND DB records AND weather matches)
- 0.6-0.79: One strong source confirmed + weather matches or partial web coverage
- 0.4-0.59: One source found but limited; or weather strongly matches but no source
- 0.2-0.39: Weak or indirect evidence; single source of limited relevance
- 0.0-0.19: No evidence found; both web and DB returned nothing

DECISION LOGIC:
- status = 'verified' if web search finds real news articles OR DB has corroborating incidents nearby
- status = 'rejected' if BOTH web search AND DB return nothing
- The confidence score should reflect HOW MUCH evidence was found, not just a binary yes/no
- Set verification.is_verified based on the same logic

SEVERITY CALIBRATION:
- Incorporate weather data: flood + heavy rain = Critical; fire + high wind + low humidity = Critical
- Consider the description's own urgency signals
- A cyclone by itself is at least High; with corroboration and matching weather = Critical

PRIORITY SCORE (0-100):
- Combine severity + confidence + weather severity_multiplier
- Critical severity should be 75-100
- High severity should be 50-74
- Moderate severity should be 25-49
- Low severity should be 0-24

OUTPUT ONLY THIS JSON — NOTHING ELSE:
{
    "status": "verified" or "rejected",
    "corroborating_incidents": [],
    "analysis": {
        "incident_type": "",
        "severity": "Low" or "Moderate" or "High" or "Critical",
        "priority_score": 0-100,
        "confidence": 0.0-1.0,
        "summary": "",
        "recommended_actions": [],
        "verification": {
            "web_search_summary": "",
            "sources_checked": [],
            "is_verified": true or false,
            "weather_at_location": ""
        }
    }
}"""


root_agent = Agent(
    name="incident_verifier",
    model=MODEL_NAME,
    instruction=AGENT_INSTRUCTION,
    tools=[
        FunctionTool(_search_web),
        FunctionTool(_get_weather),
        FunctionTool(_check_db),
    ],
)

app = App(name="varuna_incident_verifier", root_agent=root_agent)
runner = InMemoryRunner(app=app)


def extract_json(raw: str) -> str:
    if not raw:
        return ""
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        return match.group()
    return raw


async def run_agent(description: str, latitude: float, longitude: float,
                    category: str, reported_by: str) -> dict:
    start = time.perf_counter()

    user_message = f"""Incident Report:
Description: {description}
Latitude: {latitude}
Longitude: {longitude}
Category: {category}
Reported By: {reported_by or 'anonymous'}"""

    try:
        events = await runner.run_debug(
            user_message,
            user_id=reported_by or "anonymous",
            verbose=False,
            quiet=True,
        )
    except Exception as e:
        print(f"  [agent] ADK run failed: {e}")
        raise

    elapsed = round((time.perf_counter() - start) * 1000)

    raw = ""
    for event in events:
        if event.is_final_response():
            parts = event.content.parts
            if parts and parts[0].text:
                raw += parts[0].text

    extracted = extract_json(raw)
    print(f"  [agent] Raw ({elapsed}ms): {raw[:300]}...")
    print(f"  [agent] Extracted JSON: {extracted[:200]}...")

    try:
        result = json.loads(extracted)
    except (json.JSONDecodeError, TypeError):
        result = {
            "status": "unverified",
            "corroborating_incidents": [],
            "analysis": {
                "incident_type": "Unknown",
                "severity": "Moderate",
                "priority_score": 50,
                "confidence": 0.5,
                "summary": description[:200],
                "recommended_actions": [],
                "verification": {
                    "web_search_summary": "",
                    "sources_checked": [],
                    "is_verified": False,
                    "weather_at_location": "",
                },
            },
        }

    result.setdefault("analysis", {})
    result["analysis"].setdefault("verification", {})
    result.setdefault("corroborating_incidents", [])

    return result
