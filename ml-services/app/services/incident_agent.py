import asyncio
import json
import re
import time

from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.runners import InMemoryRunner
from google.adk.tools.function_tool import FunctionTool

from app.connectors.web_search import web_search as exa_search
from app.services.citizen_reports import find_corroborating_incidents
from app.core.config import MODEL_NAME


def _search_web(query: str) -> str:
    """Search the web for news articles about this incident to verify if it's real.
    
    Call this tool to find real news coverage, official reports, or social media
    posts about the incident. Use the description and location as the query.
    
    Args:
        query: A detailed search query combining the incident description and location
    Returns:
        A JSON string with search results: each result has title, url, and snippet fields.
        Returns empty string if no results or if search is unavailable.
    """
    return exa_search(query)


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


AGENT_INSTRUCTION = """You are VARUNA AI's incident verification agent. Your ONLY job is to analyze citizen reports and determine if they are real using web search and database evidence.

YOUR WORKFLOW — follow EXACTLY:
1. Call web_search() with a query combining the description and location
2. Call check_db() with the latitude, longitude, and category
3. Analyze ALL evidence and decide the verdict
4. Output ONLY valid JSON — NO other text

ABSOLUTE RULES — you MUST obey:
- You MUST call web_search() at least once
- You MUST call check_db() at least once
- Your final output MUST be ONLY the JSON object below — nothing else
- NO introductory text, NO explanation, NO markdown, NO ```json markers
- The JSON MUST be valid and complete
- If you output anything other than pure JSON, the system will break

DECISION LOGIC:
- status = 'verified' if web search finds real news articles OR DB has corroborating incidents nearby
- status = 'rejected' if BOTH web search AND DB return nothing
- Set verification.is_verified based on the same logic

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
            "is_verified": true or false
        }
    }
}"""


root_agent = Agent(
    name="incident_verifier",
    model=MODEL_NAME,
    instruction=AGENT_INSTRUCTION,
    tools=[
        FunctionTool(_search_web),
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
                },
            },
        }

    result.setdefault("analysis", {})
    result["analysis"].setdefault("verification", {})
    result.setdefault("corroborating_incidents", [])

    return result
