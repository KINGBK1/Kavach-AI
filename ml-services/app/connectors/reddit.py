import requests

from app.connectors.base import BaseConnector
from app.models.incident import Incident


class RedditConnector(BaseConnector):

    BASE_URL = "https://www.reddit.com/search.json"

    HEADERS = {
        "User-Agent": "VARUNA-Decision-Platform/1.0"
    }

    def fetch(self, query: str):

        response = requests.get(
            self.BASE_URL,
            headers=self.HEADERS,
            params={
                "q": query,
                "sort": "new",
                "limit": 25
            },
            timeout=10,
        )

        response.raise_for_status()

        return response.json()

    def normalize(self, raw):

        incidents = []

        posts = raw["data"]["children"]

        for post in posts:

            data = post["data"]

            incidents.append(
                Incident(
                    id=data["id"],
                    source="Reddit",
                    title=data["title"],
                    description=data.get("selftext", ""),
                    category="Citizen Report",
                    latitude=0.0,
                    longitude=0.0,
                    severity=None,
                    timestamp=None,
                    url="https://reddit.com" + data["permalink"],
                )
            )

        return incidents