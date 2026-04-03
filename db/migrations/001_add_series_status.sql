-- ============================================================================
-- Swabrr — Media Library Pruning Engine
-- ============================================================================
--
-- Migration 001: Add series_status to media_items
-- Part of Phase 9 — Series Completion Signal
--
-- Captures whether a TV/anime series is 'continuing', 'ended', or
-- 'upcoming' as reported by Sonarr. Used by the scoring engine to
-- adjust Watch Activity scores for ongoing vs completed series.
--
-- FILE VERSION: v1.0.0
-- LAST MODIFIED: 2026-04-03
-- COMPONENT: swabrr-db
-- ============================================================================

ALTER TABLE media_items
    ADD COLUMN IF NOT EXISTS series_status VARCHAR(20);

COMMENT ON COLUMN media_items.series_status IS
    'Sonarr series status: continuing, ended, upcoming. NULL for movies.';
