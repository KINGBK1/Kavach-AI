# app/services/chat.py
import json
from app.services.llm import ask_llm
from app.services.query_parser import parse_query
from app.services.retriever import retrieve_incidents

CHAT_SYSTEM_PROMPT = """/no_think
You are VARUNA AI, an emergency response analyst.

You will receive a set of disaster incidents and the user's question.
Answer ONLY using the provided incidents.
If no incidents match, explicitly say no matching incidents were found.
Do not hallucinate.
Provide concise, actionable summaries.

Return valid JSON only with this schema:
{
    "answer": "",
    "relevant_incidents": [],
    "confidence": 0.0
}
"""


def _render_incident(incident: dict) -> str:
    recommendations = incident.get("recommended_actions") or []
    if isinstance(recommendations, str):
        recommendations = json.loads(recommendations)
    return (
        f"{incident.get('title')}\n"
        f"   Type: {incident.get('incident_type')} | Category: {incident.get('category')}\n"
        f"   Source: {incident.get('source')}\n"
        f"   Location: {incident.get('location') or incident.get('country') or incident.get('latitude') or 'Unknown'}\n"
        f"   Severity: {incident.get('severity')} | Priority: {incident.get('priority_score')}\n"
        f"   Summary: {incident.get('summary')}\n"
        f"   Actions: {', '.join(recommendations)}"
    )


def _render_incidents(incidents: list[dict]) -> str:
    if not incidents:
        return "No matching incidents were found."

    entries = ["Relevant incidents:"]
    for index, incident in enumerate(incidents, start=1):
        entries.append(f"{index}. {_render_incident(incident)}")
    return "\n\n".join(entries)


def answer_question(question: str) -> dict:
    parsed = parse_query(question)
    incidents = retrieve_incidents(question)
    context = _render_incidents(incidents)

    user_prompt = f"""
Incident Data:
{context}

User Question:
{question}
"""

    try:
        result = ask_llm(CHAT_SYSTEM_PROMPT, user_prompt)

        raw = result["response"].strip()
        data = json.loads(raw)

        return {
            "answer": data.get("answer", ""),
            "relevant_incidents": data.get("relevant_incidents", incidents),
            "confidence": data.get("confidence", 0.0),
            "model": result["model"],
            "processing_time_ms": result["processing_time_ms"],
            "parsed_query": parsed,
        }

    except Exception as e:
        return {
            "answer": f"I encountered an error processing your question: {str(e)}",
            "relevant_incidents": incidents,
            "confidence": 0.0,
            "parsed_query": parsed,
        }
