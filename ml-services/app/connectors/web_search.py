import json
from datetime import datetime, timedelta, timezone

import requests
from app.core.config import EXA_API_KEY

EXA_SEARCH_URL = "https://api.exa.ai/search"

# How far back a result can be published and still count as evidence for a
# citizen report. Citizen reports are about something happening right now —
# a five-year-old article about flooding in the same city is not evidence
# the CURRENT report is real. Without this, Exa's relevance ranking can
# easily surface well-established older coverage over anything breaking.
DEFAULT_RECENCY_DAYS = 5


def web_search(query: str, num_results: int = 5, recency_days: int = DEFAULT_RECENCY_DAYS) -> str:
    if not EXA_API_KEY:
        print("  [web_search] No EXA_API_KEY configured, skipping")
        return ""

    start_published = (
        datetime.now(timezone.utc) - timedelta(days=recency_days)
    ).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    print(f"  [web_search] Searching Exa for: {query[:80]}... (since {start_published})")
    try:
        resp = requests.post(
            EXA_SEARCH_URL,
            headers={
                "x-api-key": EXA_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "query": query,
                "numResults": num_results,
                # "auto" lets Exa pick the best retrieval strategy per query
                # rather than forcing plain keyword matching, which was the
                # actual cause of stale/irrelevant results — keyword search
                # has no concept of recency, it just matches text.
                "type": "auto",
                "category": "news",
                "startPublishedDate": start_published,
                "contents": {
                    "highlights": True,
                },
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        results = data.get("results", [])
        if not results:
            print("  [web_search] No results found in recency window")
            return ""

        formatted = []
        for r in results[:num_results]:
            title = r.get("title", "Untitled")
            url = r.get("url", "")
            published = r.get("publishedDate", "")
            highlights = r.get("highlights") or []
            snippet = " ".join(highlights)[:300] if highlights else (r.get("text") or "")[:300]
            formatted.append({
                "title": title,
                "url": url,
                "published": published,
                "snippet": snippet,
            })

        print(f"  [web_search] Found {len(formatted)} results within {recency_days} days")
        return json.dumps(formatted, indent=2)

    except requests.exceptions.Timeout:
        print("  [web_search] Request timed out")
        return ""
    except requests.exceptions.HTTPError as e:
        # Surface the actual response body — Exa's 400s (e.g. an
        # unsupported param for a given category) are otherwise silently
        # swallowed by the generic except below, which made this class of
        # bug hard to see in logs.
        body = e.response.text if e.response is not None else str(e)
        print(f"  [web_search] Exa API error: {body[:300]}")
        return ""
    except Exception as e:
        print(f"  [web_search] Failed: {e}")
        return ""