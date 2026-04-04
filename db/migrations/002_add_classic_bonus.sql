-- ============================================================================
-- Migration 002: Add classic title bonus settings to scoring_weights
-- ============================================================================
-- Part of the Classic Title Bonus feature.
--
-- Adds two configurable columns:
--   classic_age_threshold  — minimum age in years for a title to qualify (15–30)
--   classic_bonus_points   — flat bonus added to keep_score (0–10)
--
-- FILE VERSION: v1.0.0
-- LAST MODIFIED: 2026-04-04
-- COMPONENT: swabrr-db
-- ============================================================================

ALTER TABLE scoring_weights
    ADD COLUMN IF NOT EXISTS classic_age_threshold INTEGER NOT NULL DEFAULT 20,
    ADD COLUMN IF NOT EXISTS classic_bonus_points  NUMERIC(4,1) NOT NULL DEFAULT 5.0;
