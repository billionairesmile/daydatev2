-- Change bookmark cleanup from noon to midnight
-- Bookmarks will now be cleaned up at midnight (when the date changes)
-- instead of noon the next day

-- Update the global cleanup function
CREATE OR REPLACE FUNCTION cleanup_completed_bookmarks()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
  cleanup_threshold TIMESTAMPTZ;
BEGIN
  -- Calculate threshold: midnight of today
  -- Any bookmark completed before today's midnight should be removed
  -- This means completed yesterday or earlier will be removed at midnight
  cleanup_threshold := DATE_TRUNC('day', NOW());

  DELETE FROM couple_bookmarks
  WHERE completed_at IS NOT NULL
    AND completed_at < cleanup_threshold;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the couple-specific cleanup function
CREATE OR REPLACE FUNCTION cleanup_couple_completed_bookmarks(p_couple_id UUID)
RETURNS TABLE(removed_mission_id TEXT) AS $$
DECLARE
  cleanup_threshold TIMESTAMPTZ;
BEGIN
  -- Threshold: midnight of today
  -- Remove bookmarks completed before today
  cleanup_threshold := DATE_TRUNC('day', NOW());

  RETURN QUERY
  DELETE FROM couple_bookmarks
  WHERE couple_id = p_couple_id
    AND completed_at IS NOT NULL
    AND completed_at < cleanup_threshold
  RETURNING mission_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update column comment
COMMENT ON COLUMN couple_bookmarks.completed_at IS 'Timestamp when the bookmarked mission was completed. Bookmark will be removed at midnight when the date changes.';
