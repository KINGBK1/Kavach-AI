import re
from datetime import datetime, timedelta
from typing import Any

TIME_MAP = {
    "today": "today",
    "yesterday": "yesterday",
    "last week": "last_week",
    "this week": "this_week",
    "last month": "last_month",
    "this month": "this_month",
    "this year": "this_year",
    "last year": "last_year",
}

CATEGORY_KEYWORDS = {
    "earthquake": "Earthquake",
    "wildfire": "Wildfires",
    "storm": "Storm",
    "cyclone": "Cyclone",
    "volcano": "Volcano",
    "flood": "Flood",
    "landslide": "Landslide",
    "tsunami": "Tsunami",
}

INTENT_PATTERNS = {
    "count": "count",
    "how many": "count",
    "statistics": "statistics",
    "summary": "summary",
    "list": "list",
    "critical incidents": "critical",
    "recent incidents": "recent",
    "top": "top",
    "biggest": "top",
}

LIMIT_PATTERNS = [
    (r"top\s+(\d+)", 0),
    (r"highest\s+(\d+)", 0),
    (r"limit\s+(\d+)", 0),
    (r"(\d+)\s+largest", 0),
]

COMMON_LOCATIONS = [
    "India", "Japan", "California", "United States", "USA", "China",
    "Australia", "Philippines", "Indonesia", "Mexico", "Brazil",
    "Pakistan", "Nepal", "Chile", "Turkey", "Italy", "Greece",
    "Canada", "Spain", "France", "Thailand", "Vietnam",
]

DEFAULT_LIMIT = 10


def _normalize_text(text: str) -> str:
    return text.lower().strip()


def _find_time_range(text: str) -> str | None:
    for phrase, normalized in TIME_MAP.items():
        if phrase in text:
            return normalized
    return None


def _find_category(text: str) -> str | None:
    for keyword, normalized in CATEGORY_KEYWORDS.items():
        if keyword in text:
            return normalized
    return None


def _find_location(text: str) -> str | None:
    for location in COMMON_LOCATIONS:
        if location.lower() in text:
            return location
    return None


def _find_limit(text: str) -> int | None:
    for pattern, _ in LIMIT_PATTERNS:
        match = re.search(pattern, text)
        if match:
            try:
                return int(match.group(1))
            except ValueError:
                continue
    if "top" in text or "highest" in text or "biggest" in text:
        return 10
    return None


def _find_intent(text: str) -> str:
    for phrase, intent in INTENT_PATTERNS.items():
        if phrase in text:
            return intent
    if text.startswith("how many") or text.startswith("what is the"):
        return "count"
    if "show" in text or "list" in text:
        return "list"
    return "summary"


def parse_query(question: str) -> dict[str, Any]:
    normalized = _normalize_text(question)

    time_range = _find_time_range(normalized)
    category = _find_category(normalized)
    location = _find_location(normalized)
    limit = _find_limit(normalized) or DEFAULT_LIMIT
    intent = _find_intent(normalized)

    return {
        "time_range": time_range,
        "category": category,
        "location": location,
        "limit": limit,
        "intent": intent,
        "original_question": question,
    }


def time_range_bounds(time_range: str | None) -> tuple[datetime | None, datetime | None]:
    now = datetime.utcnow()
    if time_range == "today":
        start = datetime(now.year, now.month, now.day)
        return start, now
    if time_range == "yesterday":
        yesterday = now.date() - timedelta(days=1)
        start = datetime(yesterday.year, yesterday.month, yesterday.day)
        end = datetime(now.year, now.month, now.day)
        return start, end
    if time_range == "last_week":
        start = now - timedelta(days=7)
        return start, now
    if time_range == "this_week":
        start = now - timedelta(days=now.weekday())
        return start, now
    if time_range == "last_month":
        start = now.replace(day=1) - timedelta(days=1)
        start = start.replace(day=1)
        return start, now
    if time_range == "this_month":
        start = now.replace(day=1)
        return start, now
    if time_range == "last_year":
        start = now.replace(month=1, day=1, year=now.year - 1)
        end = now.replace(month=1, day=1)
        return start, end
    if time_range == "this_year":
        start = now.replace(month=1, day=1)
        return start, now
    return None, None
