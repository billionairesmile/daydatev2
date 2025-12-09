-- Migration: Remove deprecated date worry options
-- Created: 2025-12-09
-- Description: Remove 'energy' and 'distance' from dateWorries arrays in preferences

-- ============================================
-- Remove deprecated date worries from profiles
-- ============================================

-- Update profiles table: Remove 'energy' and 'distance' from preferences.dateWorries
UPDATE profiles
SET preferences = jsonb_set(
  preferences,
  '{dateWorries}',
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements_text(preferences->'dateWorries') AS elem
    WHERE elem NOT IN ('energy', 'distance')
  )
)
WHERE preferences ? 'dateWorries'
  AND preferences->'dateWorries' @> '["energy"]'::jsonb
  OR preferences->'dateWorries' @> '["distance"]'::jsonb;

-- ============================================
-- Remove deprecated date worries from onboarding_answers
-- ============================================

-- Update onboarding_answers table: Remove 'energy' and 'distance' from answers.dateWorries
UPDATE onboarding_answers
SET answers = jsonb_set(
  answers,
  '{dateWorries}',
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements_text(answers->'dateWorries') AS elem
    WHERE elem NOT IN ('energy', 'distance')
  )
)
WHERE answers ? 'dateWorries'
  AND (
    answers->'dateWorries' @> '["energy"]'::jsonb
    OR answers->'dateWorries' @> '["distance"]'::jsonb
  );

-- ============================================
-- Add comments for documentation
-- ============================================

COMMENT ON TABLE profiles IS 'User profiles table. DateWorries now excludes deprecated ''energy'' and ''distance'' options.';
COMMENT ON TABLE onboarding_answers IS 'User onboarding answers. DateWorries now excludes deprecated ''energy'' and ''distance'' options.';
