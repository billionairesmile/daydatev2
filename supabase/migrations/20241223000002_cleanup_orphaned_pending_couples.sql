-- =====================================================
-- Migration: Cleanup Orphaned Pending Couples
-- Date: 2024-12-23
-- Description: Delete pending couples that have no user2_id (orphaned)
--              These are created when pairing fails or user creates new pairing code
-- =====================================================

-- Delete all pending couples where user2_id is null (orphaned/incomplete pairings)
-- Only delete if status is 'pending' and user2_id is null
DELETE FROM couples
WHERE status = 'pending'
  AND user2_id IS NULL;

-- Log how many were deleted (for debugging)
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Cleaned up % orphaned pending couples', deleted_count;
END $$;
