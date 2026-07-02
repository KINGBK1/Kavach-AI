# app/services/chat.py
import json
from app.core.db import get_conn
from app.services.llm import ask_llm

CHAT_SYSTEM_PROMPT = """/no_think
You are VARUNA AI, an intelligent disaster response assistant.

You have access to real-time disaster incident data from NASA EONET, USGS, GDACS, and social media.

Answer the user's question based on the incident data provided.
Be concise, specific, and actionable.
If asked about specific locations, mention coordinates.
If asked for recommendations, be specific about emergency response actions.
Always prioritize life safety in your recommendations.

Return a JSON response with this schema:
{
    "answer": "your detailed answer here",
    "relevant_incidents": [],
    "confidence": 0.0
}
"""


def _get_incidents_context() -> str:
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT
                i.title,
                i.category,
                i.source,
                i.latitude,
                i.longitude,
                a.severity,
                a.priority_score,
                a.summary,
                a.incident_type,
                a.recommended_actions
            FROM analyses a
            JOIN incidents i ON a.incident_id = i.id
            ORDER BY a.priority_score DESC
            LIMIT 20
        """).fetchall()

    if not rows:
        return "No incidents have been analyzed yet."

    context = "Current disaster incidents (sorted by priority):\n\n"
    for i, row in enumerate(rows, 1):
        context += f"""
{i}. {row['title']}
   Type: {row['incident_type']} | Category: {row['category']}
   Source: {row['source']}
   Location: {row['latitude']}, {row['longitude']}
   Severity: {row['severity']} | Priority: {row['priority_score']}/100
   Summary: {row['summary']}
   Actions: {', '.join(json.loads(row['recommended_actions']))}
---"""

    return context


def answer_question(question: str) -> dict:
    context = _get_incidents_context()

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
            "relevant_incidents": data.get("relevant_incidents", []),
            "confidence": data.get("confidence", 0.0),
            "model": result["model"],
            "processing_time_ms": result["processing_time_ms"],
        }

    except Exception as e:
        return {
            "answer": f"I encountered an error processing your question: {str(e)}",
            "relevant_incidents": [],
            "confidence": 0.0,
        }