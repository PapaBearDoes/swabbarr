"""
============================================================================
Swabrr — Media Library Pruning Engine
============================================================================

Signal calculators for the five scoring categories.
Each function takes a MediaRecord and returns a score from 0–100.

----------------------------------------------------------------------------
FILE VERSION: v1.1.0
LAST MODIFIED: 2026-04-03
COMPONENT: swabrr-api
CLEAN ARCHITECTURE: Compliant
Repository: https://github.com/PapaBearDoes/swabrr
============================================================================
"""

import math
from datetime import datetime, timezone

from src.scoring.models import MediaRecord


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TOTAL_USERS = 11  # Active Plex users
CLASSIC_YEAR_THRESHOLD = 2000
RECENCY_HALF_LIFE_DAYS = 180  # 6 months — score halves every 6 months


def _days_since(timestamp: str | int | None) -> float | None:
    """Calculate days elapsed since a timestamp. Returns None if invalid.

    Accepts ISO 8601 strings or Unix epoch integers/floats.
    """
    if timestamp is None:
        return None
    try:
        if isinstance(timestamp, (int, float)):
            dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        else:
            dt = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return max(0, (now - dt).total_seconds() / 86400)
    except (ValueError, TypeError, OSError):
        return None


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    """Clamp a value between low and high."""
    return max(low, min(high, value))


# ---------------------------------------------------------------------------
# Series completion modifier (Phase 9)
# ---------------------------------------------------------------------------
def _calc_series_completion_modifier(record: MediaRecord) -> float:
    """Calculate a bonus or penalty based on series status and episode completion.

    Only applies to series with valid status data from Sonarr.
    Returns a modifier that is added to the base watch activity score:
      - Continuing + caught up:   +15 (actively following)
      - Continuing + mostly up:   +8  (keeping up)
      - Ended + never watched:    -10 (dead weight)
      - Ended + half-abandoned:   -5  (started then stopped)
      - Everything else:          0   (neutral)

    Movies and series without status data are always 0 (no effect).
    """
    if record.media_type != "series":
        return 0.0
    if not record.series_status:
        return 0.0

    status = record.series_status.lower()

    # Calculate episode completion ratio if we have the data
    completion_ratio: float | None = None
    if (
        record.episode_count is not None
        and record.series_total_episodes is not None
        and record.series_total_episodes > 0
    ):
        completion_ratio = record.episode_count / record.series_total_episodes

    if status == "continuing":
        if completion_ratio is not None:
            if completion_ratio >= 0.95:
                return 15.0  # Caught up — someone is actively following
            elif completion_ratio >= 0.75:
                return 8.0  # Mostly caught up
        # Continuing but low completion or unknown — no modifier
        return 0.0

    if status == "ended":
        if record.total_plays == 0:
            return -10.0  # Ended + never watched = dead weight
        if completion_ratio is not None and completion_ratio < 0.50:
            return -5.0  # Ended + less than half watched
        return 0.0

    # 'upcoming' or any unexpected value — neutral
    return 0.0


# ---------------------------------------------------------------------------
# Signal 1: Watch Activity (default weight: 40%)
# ---------------------------------------------------------------------------
def calc_watch_activity(record: MediaRecord) -> float:
    """Score based on play count, unique viewers, recency, completion,
    and series status.

    0 = never watched (or ended + never watched with penalty).
    100 = heavily watched recently by many users.

    For series, the score is modified by whether the series is ongoing
    and how caught up the library is on available episodes (Phase 9).
    """
    # --- Series completion modifier (Phase 9) ---
    # Calculated first because it can apply even to unwatched series
    # (e.g. ended + never watched penalty)
    series_modifier = _calc_series_completion_modifier(record)

    if record.total_plays == 0:
        # No watch history — base score is 0, but series modifier can
        # push it negative (clamped to 0) for ended+unwatched series.
        # A continuing series with 0 plays stays at 0 (no bonus for
        # something nobody has started watching).
        return _clamp(0.0 + series_modifier)

    # --- Viewer ratio (0–30 points) ---
    # What fraction of total users have watched this?
    viewer_ratio = min(record.unique_viewers / TOTAL_USERS, 1.0)
    viewer_score = viewer_ratio * 30.0

    # --- Play count with diminishing returns (0–25 points) ---
    # log2 curve: 1 play=0, 2=10, 4=15, 8=18, 16=20, 32+=25
    play_score = min(math.log2(max(record.total_plays, 1)) * 5.0, 25.0)

    # --- Recency decay (0–30 points) ---
    # Exponential decay: score halves every RECENCY_HALF_LIFE_DAYS
    days = _days_since(record.last_watched_at)
    if days is not None:
        decay = math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS)
        recency_score = decay * 30.0
    else:
        recency_score = 0.0

    # --- Completion bonus (0–15 points) ---
    # High average completion means people actually enjoyed it
    completion_score = (record.avg_completion_pct / 100.0) * 15.0

    total = viewer_score + play_score + recency_score + completion_score
    total += series_modifier
    return _clamp(total)


# ---------------------------------------------------------------------------
# Signal 2: Rarity & Replaceability (default weight: 20%)
# ---------------------------------------------------------------------------
def calc_rarity(record: MediaRecord) -> float:
    """Score based on streaming availability.

    High score = rare / hard to replace (strong keep signal).
    Low score = widely available on streaming (easy to re-get).

    Returns neutral 50 until TMDB integration (Phase 7) provides data.
    """
    if record.streaming_service_count is None:
        return 50.0  # Neutral until Phase 7

    count = record.streaming_service_count
    if count >= 4:
        return 15.0  # Very replaceable
    elif count == 3:
        return 25.0
    elif count == 2:
        return 40.0
    elif count == 1:
        return 60.0
    else:
        return 90.0  # Not on any streaming service — rare


# ---------------------------------------------------------------------------
# Signal 3: Request Accountability (default weight: 15%)
# ---------------------------------------------------------------------------
def calc_request_accountability(record: MediaRecord) -> float:
    """Score based on whether the requestor actually watched what they asked for.

    Not requested → neutral 50.
    Requested + watched → bonus 75.
    Requested + NOT watched → penalty, amplified by age.
    """
    if record.requested_by is None:
        return 50.0  # Not requested — neutral

    if record.requestor_watched:
        return 75.0  # Requested and watched — good

    # Requested but NOT watched — penalty scaled by request age
    days = _days_since(record.request_date)
    if days is None:
        return 25.0  # Requested, unwatched, unknown age

    # The longer it's been unwatched, the worse the score
    # 0 days → 35 (recently requested, give them time)
    # 90 days → 25
    # 365 days → 12
    # 730+ days → ~5
    age_factor = math.pow(0.5, days / 365.0)
    score = 5.0 + (30.0 * age_factor)
    return _clamp(score)


# ---------------------------------------------------------------------------
# Signal 4: Size Efficiency (default weight: 15%)
# ---------------------------------------------------------------------------
def calc_size_efficiency(
    record: MediaRecord,
    median_size_bytes: int,
) -> float:
    """Score based on file size relative to library median.

    This is a meta-signal: large files with low other scores become
    stronger removal candidates. Small files are less impactful to remove.

    High score = small file (efficient use of space).
    Low score = very large file (expensive to keep if not valued).
    """
    if record.file_size_bytes <= 0 or median_size_bytes <= 0:
        return 50.0  # Can't assess — neutral

    # Ratio: how many times larger than median?
    ratio = record.file_size_bytes / median_size_bytes

    # Inverse score: bigger files score lower
    # ratio 0.25 → 90 (quarter of median — very efficient)
    # ratio 0.5 → 80
    # ratio 1.0 → 50 (exactly median)
    # ratio 2.0 → 25
    # ratio 4.0 → 10
    # ratio 8.0+ → ~5
    score = 100.0 / (1.0 + ratio)
    return _clamp(score * 1.5)  # Scale up so median lands near 50


# ---------------------------------------------------------------------------
# Signal 5: Cultural Value (default weight: 10%)
# ---------------------------------------------------------------------------
def calc_cultural_value(record: MediaRecord) -> float:
    """Score based on critical reception and cultural significance.

    Uses TMDB rating and vote count. Falls back to neutral 50 if no data.
    Adds a classic bonus for older titles with high ratings.
    """
    if record.tmdb_rating is None:
        return 50.0  # No data — neutral until Phase 7

    rating = record.tmdb_rating  # 0.0–10.0 scale

    # Base score from rating (0–70 points)
    # Maps 0–10 TMDB scale to 0–70
    base_score = (rating / 10.0) * 70.0

    # Vote confidence bonus (0–15 points)
    # More votes = more reliable rating
    vote_count = record.tmdb_vote_count or 0
    if vote_count >= 10000:
        confidence = 15.0
    elif vote_count >= 1000:
        confidence = 10.0
    elif vote_count >= 100:
        confidence = 5.0
    else:
        confidence = 0.0

    # Classic bonus (0–15 points)
    # Older titles with high ratings get a preservation bonus
    classic_bonus = 0.0
    if record.year and record.year <= CLASSIC_YEAR_THRESHOLD and rating >= 7.0:
        classic_bonus = 15.0
    elif record.year and record.year <= CLASSIC_YEAR_THRESHOLD and rating >= 6.0:
        classic_bonus = 8.0

    total = base_score + confidence + classic_bonus
    return _clamp(total)


__all__ = [
    "calc_watch_activity",
    "calc_rarity",
    "calc_request_accountability",
    "calc_size_efficiency",
    "calc_cultural_value",
]
