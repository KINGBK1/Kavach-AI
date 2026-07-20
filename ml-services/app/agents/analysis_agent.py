import json
import logging
import re
import uuid

from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai.types import Content, Part

from app.agents.tools import check_database, get_weather, web_search

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are VARUNA AI, an emergency response analyst.

You are analyzing a citizen-submitted disaster report.

You MUST follow this process in order:
1. Call web_search() to find news/articles about this incident
2. Call check_database() to find corroborating incidents nearby
3. Call get_weather() to check conditions at the location
4. Analyze everything and return your assessment

Rules for your final JSON output:
- severity: must be exactly one of: "Low", "Moderate", "High", "Critical"
- priority_score: integer 0-100
- confidence: float 0.0-1.0
- recommended_actions: list of 3-5 specific actionable steps

Return ONLY valid JSON with this exact schema.
No markdown. No backticks. No explanation outside the JSON.

{
    "incident_type": "",
    "severity": "",
    "priority_score": 0,
    "confidence": 0.0,
    "summary": "",
    "recommended_actions": []
}"""

_agent: Agent | None = None
_runner: Runner | None = None
_session_service = InMemorySessionService()


def _get_or_create_agent() -> tuple[Runner, str]:
    global _agent, _runner

    if _agent is None:
        _agent = Agent(
            name="incident_analyzer",
            model="gemini-2.5-flash-lite",
            instruction=SYSTEM_INSTRUCTION,
            tools=[web_search, check_database, get_weather],
        )
        _runner = Runner(
            agent=_agent,
            app_name="varuna",
            session_service=_session_service,
        )
    return _runner, "varuna"


async def run_adk_analysis(
    description: str,
    latitude: float,
    longitude: float,
    category: str,
) -> dict:
    runner, app_name = _get_or_create_agent()
    session_id = str(uuid.uuid4())

    await _session_service.create_session(
        app_name=app_name,
        session_id=session_id,
        user_id="system",
    )

    user_prompt = (
        f"CITIZEN REPORT TO ANALYZE:\n"
        f"Description: {description}\n"
        f"Latitude: {latitude}\n"
        f"Longitude: {longitude}\n"
        f"Category: {category}\n\n"
        f"Please call web_search, check_database, and get_weather, "
        f"then return your structured analysis."
    )

    content = Content(parts=[Part(text=user_prompt)], role="user")

    final_text = ""

    async for event in runner.run_async(
        session_id=session_id,
        user_id="system",
        new_message=content,
    ):
        if event.is_final_response() and event.output is not None:
            output = event.output
            parts = getattr(output, "parts", None)
            if parts:
                text_parts = [p.text for p in parts if getattr(p, "text", None)]
                final_text = "".join(text_parts)
            elif isinstance(output, str):
                final_text = output
            else:
                final_text = str(output)

    if not final_text:
        raise ValueError("ADK agent returned empty response")

    cleaned = final_text.strip()
    cleaned = re.sub(r"^```json\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()

    analysis = json.loads(cleaned)

    return {
        "analysis": analysis,
        "metadata": {
            "model": "gemini-2.5-flash-lite",
            "agent_framework": "google-adk",
        },
    }
