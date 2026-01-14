-- Add completed_at column to couple_bookmarks table
-- This tracks when a bookmarked mission was completed
-- Bookmarks will be cleaned up at noon the day after completion

ALTER TABLE couple_bookmarks
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_couple_bookmarks_completed_at
ON couple_bookmarks (completed_at)
WHERE completed_at IS NOT NULL;

-- Function to clean up completed bookmarks (removes bookmarks completed before noon yesterday)
CREATE OR REPLACE FUNCTION cleanup_completed_bookmarks()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
  cleanup_threshold TIMESTAMPTZ;
BEGIN
  -- Calculate threshold: noon of today
  -- Any bookmark completed before (today - 12 hours) should be removed
  -- This means if it's 2PM today, bookmarks completed before 2AM today are removed
  -- But we want: completed yesterday, removed at noon today
  -- So threshold = today at 00:00 - 12 hours = yesterday at noon
  cleanup_threshold := DATE_TRUNC('day', NOW()) - INTERVAL '12 hours';

  DELETE FROM couple_bookmarks
  WHERE completed_at IS NOT NULL
    AND completed_at < cleanup_threshold;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and clean up completed bookmarks for a specific couple
-- Returns the IDs of removed bookmarks
CREATE OR REPLACE FUNCTION cleanup_couple_completed_bookmarks(p_couple_id UUID)
RETURNS TABLE(removed_mission_id TEXT) AS $$
DECLARE
  cleanup_threshold TIMESTAMPTZ;
BEGIN
  -- Threshold: noon of today (same logic as above)
  cleanup_threshold := DATE_TRUNC('day', NOW()) - INTERVAL '12 hours';

  RETURN QUERY
  DELETE FROM couple_bookmarks
  WHERE couple_id = p_couple_id
    AND completed_at IS NOT NULL
    AND completed_at < cleanup_threshold
  RETURNING mission_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment on the column
COMMENT ON COLUMN couple_bookmarks.completed_at IS 'Timestamp when the bookmarked mission was completed. Bookmark will be removed at noon the day after completion.';
