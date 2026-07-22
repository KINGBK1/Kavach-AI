"""Indian news connector.

Pulls directly from major Indian newspapers' own public RSS feeds — Times of
India, NDTV, and The Hindu — rather than only relying on Google News'
India-region results. These are each outlet's own top-stories feed (general
news, not disaster-specific), so like GoogleNewsConnector we rely on
CATEGORY_KEYWORDS to identify the disaster-relevant subset after fetching;
most items will be filtered out downstream by the aggregator/analyzer
pipeline the same way non-disaster Google News items are.

Pulling from three independent, well-established outlets (rather than one)
means a single feed going down or rate-limiting doesn't remove Indian
coverage entirely — each feed is fetched and parsed independently, and a
failure in one doesn't block the others.
"""
import hashlib 
from datetime import datetime
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

import requests

from app.connectors.base import BaseConnector
from app.models.incident import Incident

# Each outlet's own top-stories RSS feed — no API key required, all public.
FEEDS = {
    "Times of India": "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    "NDTV": "https://feeds.feedburner.com/ndtvnews-top-stories",
    "The Hindu": "https://www.thehindu.com/feeder/default.rss",
}

CATEGORY_KEYWORDS = [
    ("earthquake", "Earthquake"),
    ("flood", "Flood"),
    ("wildfire", "Wildfire"),
    ("fire", "Wildfire"),
    ("cyclone", "Cyclone"),
    ("typhoon", "Cyclone"),
    ("hurricane", "Cyclone"),
    ("volcano", "Volcano"),
    ("landslide", "Landslide"),
    ("tsunami", "Tsunami"),
    ("drought", "Drought"),
    ("heatwave", "Heatwave"),
    ("heat wave", "Heatwave"),
    ("monsoon", "Flood"),
    ("cloudburst", "Flood"),
]


class IndianNewsConnector(BaseConnector):
    """Fetches top-story headlines from major Indian outlets' own RSS feeds."""

    def __init__(self, feeds: dict[str, str] | None = None):
        self.feeds = feeds or FEEDS

    def fetch(self):
        """Returns {outlet_name: raw_xml_text_or_None}. A failed feed maps
        to None rather than raising, so one bad outlet doesn't take down
        the others — normalize() skips None entries."""
        results = {}
        for outlet, url in self.feeds.items():
            try:
                response = requests.get(
                    url,
                    timeout=10,
                    headers={"User-Agent": "VARUNA ML Services/1.0"},
                )
                response.raise_for_status()
                results[outlet] = response.text
            except Exception as e:
                print(f"[INDIAN_NEWS] {outlet} fetch failed: {e}", flush=True)
                results[outlet] = None
        return results

    def normalize(self, raw_data):
        incidents = []

        if not raw_data:
            return incidents

        for outlet, xml_text in raw_data.items():
            if not xml_text:
                continue
            try:
                root = ElementTree.fromstring(xml_text)
            except ElementTree.ParseError as e:
                print(f"[INDIAN_NEWS] {outlet} parse failed: {e}", flush=True)
                continue

            items = root.findall("./channel/item")

            for item in items:
                title = self._text(item, "title")
                link = self._text(item, "link")

                if not title or not link:
                    continue

                description = self._text(item, "description") or title
                pub_date = self._text(item, "pubDate")

                category = self._infer_category(title, description)
                # Skip non-disaster stories rather than pass every headline
                # (politics, sport, entertainment) through to the LLM —
                # keeps this connector's LLM-quota footprint comparable to
                # the keyword-filtered Google News connector, not the full
                # firehose of a general-news top-stories feed.
                if category is None:
                    continue

                timestamp = self._parse_timestamp(pub_date)

                incidents.append(
                    Incident(
                        id=self._build_id(link),
                        source=f"Indian News ({outlet})",
                        title=title,
                        description=description,
                        category=category,
                        latitude=None,
                        longitude=None,
                        timestamp=timestamp,
                        url=link,
                    )
                )

        return incidents

    def _text(self, item, tag):
        el = item.find(tag)
        if el is None or el.text is None:
            return None
        return el.text.strip()

    def _infer_category(self, title, description):
        combined = f"{title} {description}".lower()
        for keyword, category in CATEGORY_KEYWORDS:
            if keyword in combined:
                return category
        return None

    def _build_id(self, url):
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
        return f"INDIANNEWS_{digest}"

    def _parse_timestamp(self, pub_date):
        if not pub_date:
            return None
        try:
            return parsedate_to_datetime(pub_date)
        except Exception:
            return None