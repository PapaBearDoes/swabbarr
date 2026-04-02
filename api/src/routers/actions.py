"""
============================================================================
Swabbarr — Media Library Pruning Engine
============================================================================

Actions router — trigger scoring runs, mark titles as removed,
view removal history.

----------------------------------------------------------------------------
FILE VERSION: v1.0.0
LAST MODIFIED: 2026-04-01
COMPONENT: swabbarr-api
CLEAN ARCHITECTURE: Compliant
Repository: https://github.com/PapaBearDoes/swabbarr
============================================================================
"""

import asyncio

from fastapi import APIRouter, Request, HTTPException, Query

router = APIRouter()

# Module-level lock to prevent concurrent scoring runs
_scoring_lock = asyncio.Lock()
_scoring_status = {"running": False, "last_result": None}


@router.post("/score")
async def trigger_scoring_run(request: Request):
    """Trigger a manual scoring run."""
    if _scoring_lock.locked():
        raise HTTPException(status_code=409, detail="A scoring run is already in progress")

    engine = request.app.state.scoring_engine

    async def _run():
        _scoring_status["running"] = True
        try:
            result = await engine.run(trigger="manual")
            _scoring_status["last_result"] = {
                "run_id": result.run_id,
                "started_at": result.started_at.isoformat(),
                "completed_at": result.completed_at.isoformat() if result.completed_at else None,
                "titles_scored": result.titles_scored,
                "candidates_flagged": result.candidates_flagged,
                "space_reclaimable_bytes": result.space_reclaimable_bytes,
                "partial_data": result.partial_data,
                "notes": result.notes,
            }
        finally:
            _scoring_status["running"] = False

    async with _scoring_lock:
        asyncio.create_task(_run())

    return {"status": "started", "message": "Scoring run initiated"}


# ---------------------------------------------------------------------------
# GET /api/actions/status — Current run status
# ---------------------------------------------------------------------------
@router.get("/status")
async def get_status():
    """Get current scoring run status."""
    return {
        "running": _scoring_status["running"],
        "last_result": _scoring_status["last_result"],
    }


# ---------------------------------------------------------------------------
# POST /api/actions/remove/{tmdb_id} — Mark title as removed
# ---------------------------------------------------------------------------
@router.post("/remove/{tmdb_id}")
async def mark_removed(request: Request, tmdb_id: int):
    """Mark a title as removed. User has already deleted it in Radarr/Sonarr."""
    db = request.app.state.db_manager
    async with db.acquire() as conn:
        item = await conn.fetchrow(
            "SELECT * FROM media_items WHERE tmdb_id = $1", tmdb_id
        )
        if not item:
            raise HTTPException(status_code=404, detail="Title not found")

        # Get the most recent score for this title
        score_row = await conn.fetchrow(
            """
            SELECT keep_score FROM media_scores
            WHERE media_item_id = $1
            ORDER BY scored_at DESC LIMIT 1
            """,
            item["id"],
        )
        final_score = float(score_row["keep_score"]) if score_row else None

        # Insert into removal history
        await conn.execute(
            """
            INSERT INTO removal_history (
                media_item_id, tmdb_id, title, media_type,
                file_size_bytes, final_keep_score
            ) VALUES ($1, $2, $3, $4, $5, $6)
            """,
            item["id"], item["tmdb_id"], item["title"],
            item["media_type"], item["file_size_bytes"], final_score,
        )

        # Remove from protected titles if it was protected
        await conn.execute(
            "DELETE FROM protected_titles WHERE media_item_id = $1",
            item["id"],
        )

    return {
        "status": "removed",
        "tmdb_id": tmdb_id,
        "title": item["title"],
        "file_size_bytes": item["file_size_bytes"],
        "final_keep_score": final_score,
    }


# ---------------------------------------------------------------------------
# GET /api/actions/removal-history — Removal history with space reclaimed
# ---------------------------------------------------------------------------
@router.get("/removal-history")
async def removal_history(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
):
    """Get removal history with cumulative space reclaimed."""
    db = request.app.state.db_manager
    async with db.acquire() as conn:
        count_row = await conn.fetchrow(
            "SELECT COUNT(*) as total FROM removal_history"
        )
        total_removed = await conn.fetchval(
            "SELECT COALESCE(SUM(file_size_bytes), 0) FROM removal_history"
        )

        offset = (page - 1) * per_page
        rows = await conn.fetch(
            """
            SELECT tmdb_id, title, media_type, file_size_bytes,
                   final_keep_score, removed_at
            FROM removal_history
            ORDER BY removed_at DESC
            LIMIT $1 OFFSET $2
            """,
            per_page, offset,
        )

    return {
        "removals": [dict(r) for r in rows],
        "total": count_row["total"],
        "total_removed_bytes": total_removed,
        "page": page,
        "per_page": per_page,
    }
