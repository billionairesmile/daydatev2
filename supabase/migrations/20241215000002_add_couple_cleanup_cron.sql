-- Migration: Add automatic cleanup for disconnected couples
-- Description: Permanently deletes couple data 30 days after disconnection
-- Date: 2025-12-15

-- ============================================
-- 1. Create cleanup function
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_disconnected_couples()
RETURNS TABLE (
  deleted_couple_id UUID,
  user1_id UUID,
  user2_id UUID,
  disconnected_at TIMESTAMPTZ,
  days_since_disconnect INTEGER
) AS $$
DECLARE
  couple_record RECORD;
  deleted_count INTEGER := 0;
BEGIN
  -- Find all couples disconnected more than 30 days ago
  FOR couple_record IN
    SELECT
      c.id,
      c.user1_id,
      c.user2_id,
      c.disconnected_at,
      EXTRACT(DAY FROM NOW() - c.disconnected_at)::INTEGER as days_since
    FROM couples c
    WHERE c.status = 'disconnected'
      AND c.disconnected_at IS NOT NULL
      AND c.disconnected_at < NOW() - INTERVAL '30 days'
  LOOP
    -- Delete Storage files for completed missions (photos)
    -- Note: Storage files need to be deleted via Storage API, logged here for manual cleanup
    RAISE NOTICE 'Cleaning up couple %: user1=%, user2=%, disconnected % days ago',
      couple_record.id,
      couple_record.user1_id,
      couple_record.user2_id,
      couple_record.days_since;

    -- Return info about the couple being deleted
    deleted_couple_id := couple_record.id;
    user1_id := couple_record.user1_id;
    user2_id := couple_record.user2_id;
    disconnected_at := couple_record.disconnected_at;
    days_since_disconnect := couple_record.days_since;

    -- Delete the couple record (CASCADE will handle related tables)
    -- Related tables with ON DELETE CASCADE:
    --   - couple_settings
    --   - mission_progress
    --   - couple_albums (-> album_photos)
    --   - couple_missions
    --   - mission_generation_lock
    --   - couple_bookmarks
    --   - couple_todos
    --   - menstrual_settings
    --   - completed_missions
    DELETE FROM couples WHERE id = couple_record.id;

    deleted_count := deleted_count + 1;

    RETURN NEXT;
  END LOOP;

  RAISE NOTICE 'Cleanup complete: % couples permanently deleted', deleted_count;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION cleanup_disconnected_couples() TO service_role;

-- ============================================
-- 2. Create cleanup log table for audit trail
-- ============================================
CREATE TABLE IF NOT EXISTS couple_cleanup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL,
  user1_id UUID,
  user2_id UUID,
  disconnected_at TIMESTAMPTZ,
  cleaned_up_at TIMESTAMPTZ DEFAULT NOW(),
  days_since_disconnect INTEGER,
  cleanup_trigger TEXT DEFAULT 'cron' CHECK (cleanup_trigger IN ('cron', 'manual', 'user_request'))
);

-- Index for audit queries
CREATE INDEX idx_cleanup_log_cleaned_at ON couple_cleanup_log(cleaned_up_at);

-- ============================================
-- 3. Create wrapper function that logs cleanup
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_disconnected_couples_with_log(
  p_trigger TEXT DEFAULT 'cron'
)
RETURNS TABLE (
  deleted_count INTEGER,
  log_entries JSONB
) AS $$
DECLARE
  cleanup_result RECORD;
  total_deleted INTEGER := 0;
  log_array JSONB := '[]'::JSONB;
BEGIN
  FOR cleanup_result IN SELECT * FROM cleanup_disconnected_couples()
  LOOP
    -- Log each deletion
    INSERT INTO couple_cleanup_log (
      couple_id,
      user1_id,
      user2_id,
      disconnected_at,
      days_since_disconnect,
      cleanup_trigger
    ) VALUES (
      cleanup_result.deleted_couple_id,
      cleanup_result.user1_id,
      cleanup_result.user2_id,
      cleanup_result.disconnected_at,
      cleanup_result.days_since_disconnect,
      p_trigger
    );

    log_array := log_array || jsonb_build_object(
      'couple_id', cleanup_result.deleted_couple_id,
      'user1_id', cleanup_result.user1_id,
      'user2_id', cleanup_result.user2_id,
      'days_since_disconnect', cleanup_result.days_since_disconnect
    );

    total_deleted := total_deleted + 1;
  END LOOP;

  deleted_count := total_deleted;
  log_entries := log_array;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cleanup_disconnected_couples_with_log(TEXT) TO service_role;

-- ============================================
-- 4. Preview function (dry run without deletion)
-- ============================================
CREATE OR REPLACE FUNCTION preview_cleanup_disconnected_couples()
RETURNS TABLE (
  couple_id UUID,
  user1_id UUID,
  user2_id UUID,
  disconnected_at TIMESTAMPTZ,
  days_since_disconnect INTEGER,
  will_be_deleted_in_days INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as couple_id,
    c.user1_id,
    c.user2_id,
    c.disconnected_at,
    EXTRACT(DAY FROM NOW() - c.disconnected_at)::INTEGER as days_since_disconnect,
    GREATEST(0, 30 - EXTRACT(DAY FROM NOW() - c.disconnected_at)::INTEGER) as will_be_deleted_in_days
  FROM couples c
  WHERE c.status = 'disconnected'
    AND c.disconnected_at IS NOT NULL
  ORDER BY c.disconnected_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION preview_cleanup_disconnected_couples() TO service_role;
GRANT EXECUTE ON FUNCTION preview_cleanup_disconnected_couples() TO authenticated;

-- ============================================
-- 5. Enable pg_cron extension (if not exists)
-- Note: This needs to be enabled in Supabase Dashboard
--       Settings > Database > Extensions > pg_cron
-- ============================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================
-- 6. Schedule daily cleanup at 3 AM KST (18:00 UTC)
-- Note: Run this manually in Supabase SQL Editor after enabling pg_cron
-- ============================================
-- SELECT cron.schedule(
--   'cleanup-disconnected-couples',  -- job name
--   '0 18 * * *',                    -- 3 AM KST = 18:00 UTC (every day)
--   $$SELECT cleanup_disconnected_couples_with_log('cron')$$
-- );

-- To unschedule: SELECT cron.unschedule('cleanup-disconnected-couples');
-- To view jobs: SELECT * FROM cron.job;
-- To view job runs: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- ============================================
-- 7. Add comment for documentation
-- ============================================
COMMENT ON FUNCTION cleanup_disconnected_couples() IS
'Permanently deletes couples that have been disconnected for more than 30 days.
Related data is automatically deleted via CASCADE constraints.
Storage files (photos) need manual cleanup via Supabase Storage API.';

COMMENT ON FUNCTION cleanup_disconnected_couples_with_log(TEXT) IS
'Wrapper function that calls cleanup_disconnected_couples() and logs each deletion to couple_cleanup_log table.
Trigger parameter: cron, manual, or user_request';

COMMENT ON FUNCTION preview_cleanup_disconnected_couples() IS
'Preview function to see which couples would be deleted without actually deleting them.
Shows days since disconnect and days until deletion.';

COMMENT ON TABLE couple_cleanup_log IS
'Audit log for couple data cleanup operations. Tracks when and why couple data was permanently deleted.';
