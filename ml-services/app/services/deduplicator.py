# services/deduplicator.py
from datetime import timedelta
from rapidfuzz import fuzz
from app.models.incident import Incident


class IncidentDeduplicator:

    def deduplicate(self, incidents: list[Incident]) -> list[Incident]:

        # Fast pass: deduplicate by exact ID first
        seen_ids = {}
        deduped_by_id = []
        for incident in incidents:
            if incident.id not in seen_ids:
                seen_ids[incident.id] = True
                deduped_by_id.append(incident)

        print(f"After ID dedup: {len(deduped_by_id)}", flush=True)

        # Fast pass: deduplicate by exact URL
        seen_urls = {}
        deduped_by_url = []
        for incident in deduped_by_id:
            if incident.url and incident.url in seen_urls:
                continue
            if incident.url:
                seen_urls[incident.url] = True
            deduped_by_url.append(incident)

        print(f"After URL dedup: {len(deduped_by_url)}", flush=True)

        # Slow pass: fuzzy match only across different sources
        # Skip fuzzy matching for same-source incidents (they have unique IDs already)
        unique = []
        for incident in deduped_by_url:
            duplicate = False

            for existing in unique:
                # Only fuzzy match cross-source incidents
                if incident.source == existing.source:
                    continue

                if incident.category != existing.category:
                    continue

                # Location check first (cheapest)
                if (
                    incident.latitude is not None
                    and existing.latitude is not None
                    and incident.longitude is not None
                    and existing.longitude is not None
                ):
                    lat_diff = abs(incident.latitude - existing.latitude)
                    lon_diff = abs(incident.longitude - existing.longitude)
                    if lat_diff >= 0.2 or lon_diff >= 0.2:
                        continue  # far apart, skip fuzzy

                # Timestamp check
                if incident.timestamp and existing.timestamp:
                    diff = abs(incident.timestamp - existing.timestamp)
                    if diff > timedelta(days=1):
                        continue

                # Only do fuzzy if location+time are close
                score = fuzz.token_sort_ratio(
                    incident.title.lower(),
                    existing.title.lower()
                )

                if score >= 95:
                    duplicate = True
                    break

            if not duplicate:
                unique.append(incident)

        print(f"After fuzzy dedup: {len(unique)}", flush=True)
        return unique