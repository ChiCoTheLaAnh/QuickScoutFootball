from __future__ import annotations

from datetime import datetime


def classify_idempotency(
    previous_mart: dict | None,
    current_mart: dict,
    source_stats_count: int,
    source_updated_at: str | None,
) -> str:
    if previous_mart is None:
        return "baseline_created"
    if (
        current_mart["row_count"] == previous_mart["row_count"]
        and current_mart["checksum"] == previous_mart["checksum"]
    ):
        return "verified"

    old_update = previous_mart.get("source_updated_at")
    source_is_newer = bool(
        source_updated_at
        and (old_update is None or datetime.fromisoformat(source_updated_at) > datetime.fromisoformat(old_update))
    )
    if source_stats_count != previous_mart["row_count"] or source_is_newer:
        return "source_updated"
    raise RuntimeError("Mart changed without a source update")
