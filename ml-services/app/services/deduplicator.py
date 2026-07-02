from datetime import timedelta

from rapidfuzz import fuzz

from app.models.incident import Incident


class IncidentDeduplicator:

    def deduplicate(self, incidents: list[Incident]) -> list[Incident]:

        unique = []

        for incident in incidents:

            duplicate = False

            for existing in unique:

                # ---------------------------------------------------
                # 1. Exact ID match
                # ---------------------------------------------------
                if incident.id == existing.id:
                    duplicate = True
                    break

                # ---------------------------------------------------
                # 2. Exact URL match (if available)
                # ---------------------------------------------------
                if (
                    incident.url
                    and existing.url
                    and incident.url == existing.url
                ):
                    duplicate = True
                    break

                # ---------------------------------------------------
                # 3. Must belong to same category
                # ---------------------------------------------------
                if incident.category != existing.category:
                    continue

                # ---------------------------------------------------
                # 4. Compare titles
                # ---------------------------------------------------
                score = fuzz.token_sort_ratio(
                    incident.title.lower(),
                    existing.title.lower()
                )

                # ---------------------------------------------------
                # 5. Compare timestamps if both exist
                # ---------------------------------------------------
                time_close = True

                if incident.timestamp and existing.timestamp:
                    difference = abs(
                        incident.timestamp - existing.timestamp
                    )

                    time_close = difference <= timedelta(days=1)

                # ---------------------------------------------------
                # 6. Compare locations if available
                # ---------------------------------------------------
                location_close = True

                if (
                    incident.latitude is not None
                    and existing.latitude is not None
                    and incident.longitude is not None
                    and existing.longitude is not None
                ):

                    lat_diff = abs(
                        incident.latitude - existing.latitude
                    )

                    lon_diff = abs(
                        incident.longitude - existing.longitude
                    )

                    location_close = (
                        lat_diff < 0.2
                        and lon_diff < 0.2
                    )

                # ---------------------------------------------------
                # Final duplicate decision
                # ---------------------------------------------------
                if (
                    score >= 95
                    and time_close
                    and location_close
                ):

                    # print("=" * 60)
                    # print(f"Duplicate Found (Score={score:.2f})")
                    # print("NEW      :", incident.title)
                    # print("EXISTING :", existing.title)
                    # print()

                    duplicate = True
                    break

            if not duplicate:
                unique.append(incident)

        # print(f"Before deduplication: {len(incidents)}")
        # print(f"After deduplication : {len(unique)}")

        return unique