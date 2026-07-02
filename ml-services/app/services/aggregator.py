# services/aggregator.py

from app.connectors.nasa import NASAConnector
from app.connectors.usgs import USGSConnector
from app.connectors.gdacs import GDACSConnector
from app.connectors.bluesky import BlueskyConnector

from app.services.deduplicator import IncidentDeduplicator


class IncidentAggregator:

    def fetch_all(self):

        incidents = []

        connector_specs = [
            ("nasa", lambda: NASAConnector()),
            ("usgs", lambda: USGSConnector()),
            ("gdacs", lambda: GDACSConnector()),
            ("bluesky", lambda: (BlueskyConnector(), "flood")),
        ]

        for name, factory in connector_specs:
            try:
                built = factory()

                if isinstance(built, tuple):
                    obj, query = built
                    raw = obj.fetch(query)
                    incidents.extend(obj.normalize(raw)[:100])  # cap per source
                else:
                    raw = built.fetch()
                    incidents.extend(built.normalize(raw)[:100])  # cap per source

            except Exception as e:
                print(f"{name} failed:", e)

        # Filter out empty/useless incidents AFTER collecting
        incidents = [
            i for i in incidents
            if i.title and len(i.title.strip()) > 5
        ]

        deduplicator = IncidentDeduplicator()

        print(f"Before deduplication: {len(incidents)}")
        deduplicated = deduplicator.deduplicate(incidents)
        print(f"After deduplication : {len(deduplicated)}")

        return deduplicated