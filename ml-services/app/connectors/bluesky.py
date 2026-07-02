import os
from dotenv import load_dotenv
from atproto import Client

from app.connectors.base import BaseConnector
from app.models.incident import Incident

load_dotenv()


class BlueskyConnector(BaseConnector):

    def __init__(self):
        self.client = Client()

        self.client.login(
            os.getenv("BLUESKY_HANDLE"),
            os.getenv("BLUESKY_PASSWORD"),
        )

    def fetch(self, query: str, limit: int = 20):

        response = self.client.app.bsky.feed.search_posts(
            {
                "q": query,
                "limit": limit,
            }
        )

        # print(response)

        return response.posts

    def normalize(self, posts):

        incidents = []

        for post in posts:

            incidents.append(
                Incident(
                    id=post.uri,
                    source="Bluesky",
                    title=post.record.text[:120],
                    description=post.record.text,
                    category="Social Media",
                    latitude=None,
                    longitude=None,
                    severity=None,
                    timestamp=post.indexed_at,
                    url=f"https://bsky.app/profile/{post.author.handle}/post/{post.uri.split('/')[-1]}",
                )
            )

        return incidents