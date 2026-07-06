# app/services/chat.py
import json
from app.services.llm import ask_llm
from app.services.query_parser import parse_query
from app.services.retriever import retrieve_incidents

CHAT_SYSTEM_PROMPT = """/no_think
You are VARUNA AI, an emergency response analyst.

You will receive a set of disaster incidents and the user's question, along
with the parsed filters (location, category, time range) that were already
used to select those incidents from the database.

Rules:
- Answer ONLY using the provided incidents.
- If the user asked about a specific location, treat the "Location" filter
  below as authoritative. Do NOT include an incident whose location/country
  is a different place that merely looks similar in text (e.g. "India" is
  NOT "Indiana", "Georgia" the country is NOT "Georgia" the US state).
  If you are not confident an incident actually matches the requested
  location, exclude it rather than guessing.
- If no incidents match, explicitly say no matching incidents were found,
  and return an empty relevant_incidents list. Do not pad the answer with
  unrelated incidents just because some were retrieved.
- Do not hallucinate facts not present in the incident data.
- Provide concise, actionable summaries.
- Be consistent: given the same incidents and question, your answer should
  not contradict itself or vary in which incidents it calls "relevant".

Return valid JSON only with this schema:
{
    "answer": "",
    "relevant_incidents": ["incident_id_1", "incident_id_2"],
    "confidence": 0.0
}

relevant_incidents MUST be a list of incident_id strings taken exactly from
the incidents you were given below — never invent an id, never put a
description or title there, and never return an empty object. If nothing
is relevant, return an empty list.
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


def _extract_json(raw: str) -> str:
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        return raw[start:end + 1]
    return raw


def answer_question(question: str) -> dict:
    parsed = parse_query(question)
    incidents = retrieve_incidents(question, parsed=parsed)
    context = _render_incidents(incidents)

    user_prompt = f"""
Parsed Filters (already applied to retrieve the incidents below):
- Location: {parsed.get("location") or "Not specified"}
- Category: {parsed.get("category") or "Not specified"}
- Time range: {parsed.get("time_range") or "Not specified"}

Incident Data:
{context}

User Question:
{question}
"""

    try:
        result = ask_llm(CHAT_SYSTEM_PROMPT, user_prompt)

        raw = result["response"].strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            cleaned = _extract_json(raw)
            try:
                data = json.loads(cleaned)
            except json.JSONDecodeError:
                # Never hand the user raw model output here — if both parse
                # attempts failed, `raw` is unstructured and, worse, may be
                # a wall of scraped source text (headlines, RSS fragments)
                # that leaked in through a bad retrieval match rather than
                # anything Gemini actually said. Fail safely instead.
                print(f"[CHAT] JSON parse failed twice, raw (truncated): {raw[:200]}", flush=True)
                return {
                    "answer": (
                        "I couldn't form a clean answer from the matching incidents. "
                        "Try rephrasing your question, or ask about a specific "
                        "country/state and category (e.g. \"floods in Assam\")."
                    ),
                    "relevant_incidents": [],
                    "confidence": 0.0,
                    "model": result.get("model", "unknown"),
                    "processing_time_ms": result.get("processing_time_ms", 0),
                    "parsed_query": parsed,
                }

        incidents_by_id = {inc.get("incident_id"): inc for inc in incidents}

        def _resolve_relevant(raw_ids) -> list[dict]:
            if not isinstance(raw_ids, list):
                return []
            resolved = []
            for entry in raw_ids:
                # Expect plain incident_id strings per the prompt schema, but
                # tolerate a model that still returns {"incident_id": "..."}
                # style objects rather than dropping the row entirely.
                entry_id = entry if isinstance(entry, str) else (
                    entry.get("incident_id") if isinstance(entry, dict) else None
                )
                if entry_id and entry_id in incidents_by_id:
                    resolved.append(incidents_by_id[entry_id])
            return resolved

        return {
            "answer": data.get("answer", raw),
            "relevant_incidents": _resolve_relevant(data.get("relevant_incidents")),
            "confidence": data.get("confidence", 0.0),
            "model": result.get("model", "unknown"),
            "processing_time_ms": result.get("processing_time_ms", 0),
            "parsed_query": parsed,
        }

    except Exception as e:
        print(f"[CHAT] answer_question failed: {e}", flush=True)
        return {
            "answer": "I encountered an error processing your question. Please try again.",
            "relevant_incidents": [],
            "confidence": 0.0,
            "model": "unknown",
            "processing_time_ms": 0,
            "parsed_query": parsed,
        }