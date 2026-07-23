import json
import requests
from app.core.config import EXA_API_KEY

EXA_SEARCH_URL = "https://api.exa.ai/search"


def web_search(query: str, num_results: int = 5) -> str:
    if not EXA_API_KEY:
        print("  [web_search] No EXA_API_KEY configured, skipping")
        return ""

    print(f"  [web_search] Searching Exa for: {query[:80]}...")
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
                "type": "keyword",
                "contents": {
                    "text": {
                        "max_characters": 500,
                    }
                },
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        results = data.get("results", [])
        if not results:
            print("  [web_search] No results found")
            return ""

        formatted = []
        for r in results[:num_results]:
            title = r.get("title", "Untitled")
            url = r.get("url", "")
            snippet = (r.get("text") or r.get("snippet") or "")[:300]
            formatted.append({
                "title": title,
                "url": url,
                "snippet": snippet,
            })

        print(f"  [web_search] Found {len(formatted)} results")
        return json.dumps(formatted, indent=2)

    except requests.exceptions.Timeout:
        print("  [web_search] Request timed out")
        return ""
    except Exception as e:
        print(f"  [web_search] Failed: {e}")
        return ""
