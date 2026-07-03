# services/aggregator.py
from app.connectors.nasa import NASAConnector
from app.connectors.usgs import USGSConnector
from app.connectors.gdacs import GDACSConnector
from app.connectors.gdelt_news import GDELTNewsConnector
from app.connectors.reliefweb import ReliefWebConnector
from app.connectors.bluesky import BlueskyConnector
from app.connectors.firms import FIRMSConnector

from app.services.deduplicator import IncidentDeduplicator


class IncidentAggregator:

    def fetch_all(self):

        incidents = []

        connector_specs = [
            ("nasa", lambda: NASAConnector()),
            ("usgs", lambda: USGSConnector()),
            ("gdacs", lambda: GDACSConnector()),
            ("gdelt_news", lambda: GDELTNewsConnector()),
            ("reliefweb", lambda: ReliefWebConnector()),
            ("firms", lambda: FIRMSConnector()),
            ("bluesky", lambda: (BlueskyConnector(), "flood")),
        ]

        for name, factory in connector_specs:
            print(f"[AGG] starting {name}...", flush=True)
            try:
                built = factory()
                print(f"[AGG] {name} instantiated", flush=True)

                if isinstance(built, tuple):
                    obj, query = built
                    print(f"[AGG] {name} fetching...", flush=True)
                    raw = obj.fetch(query)
                    print(f"[AGG] {name} normalizing...", flush=True)
                    incidents.extend(obj.normalize(raw)[:100])
                else:
                    print(f"[AGG] {name} fetching...", flush=True)
                    raw = built.fetch()
                    print(f"[AGG] {name} normalizing...", flush=True)
                    incidents.extend(built.normalize(raw)[:100])

                print(f"[AGG] {name} done — total so far: {len(incidents)}", flush=True)

            except Exception as e:
                print(f"[AGG] {name} failed: {e}", flush=True)

        incidents = [
            i for i in incidents
            if i.title and len(i.title.strip()) > 5
        ]

        print(f"Before deduplication: {len(incidents)}", flush=True)
        deduplicator = IncidentDeduplicator()
        incidents = deduplicator.deduplicate(incidents)
        print(f"After deduplication: {len(incidents)}", flush=True)

        return incidents