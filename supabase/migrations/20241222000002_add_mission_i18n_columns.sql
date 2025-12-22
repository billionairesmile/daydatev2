-- =====================================================
-- Migration: Add i18n columns to featured_missions
-- Date: 2024-12-22
-- Description: Add English language columns for multi-language mission support
-- =====================================================

-- Add English language columns to featured_missions table
-- Korean is the default (title, description), English is optional (title_en, description_en)

ALTER TABLE featured_missions
ADD COLUMN IF NOT EXISTS title_en TEXT,
ADD COLUMN IF NOT EXISTS description_en TEXT;

-- Add comment for documentation
COMMENT ON COLUMN featured_missions.title_en IS 'English title for the mission (optional, falls back to title if NULL)';
COMMENT ON COLUMN featured_missions.description_en IS 'English description for the mission (optional, falls back to description if NULL)';

-- Create a helper function to get localized mission content
-- This can be used in queries to automatically select the right language
CREATE OR REPLACE FUNCTION get_localized_featured_mission(
  p_mission featured_missions,
  p_language TEXT DEFAULT 'ko'
)
RETURNS TABLE (
  localized_title TEXT,
  localized_description TEXT
) AS $$
BEGIN
  IF p_language = 'en' THEN
    RETURN QUERY SELECT
      COALESCE(p_mission.title_en, p_mission.title) AS localized_title,
      COALESCE(p_mission.description_en, p_mission.description) AS localized_description;
  ELSE
    RETURN QUERY SELECT
      p_mission.title AS localized_title,
      p_mission.description AS localized_description;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update existing sample data with English translations
UPDATE featured_missions
SET
  title_en = 'Christmas Special Date',
  description_en = 'Create special memories for Christmas! Go see the Christmas tree together or take a walk while listening to carols.'
WHERE title = '크리스마스 특별 데이트';

UPDATE featured_missions
SET
  title_en = 'Valentine''s Day Special',
  description_en = 'Take a special time to express your love for each other on Valentine''s Day.'
WHERE title = '발렌타인데이 스페셜';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 20241222000002_add_mission_i18n_columns completed successfully';
END $$;
