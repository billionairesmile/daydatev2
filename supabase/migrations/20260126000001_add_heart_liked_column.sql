-- Add heart_liked_by column to couples table for real-time heart sync
-- This stores the user ID who liked the heart (null means not liked)

ALTER TABLE couples
ADD COLUMN IF NOT EXISTS heart_liked_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN couples.heart_liked_by IS 'User ID who liked the heart. Null means not liked. Used for real-time sync between partners.';

-- Ensure realtime is enabled for this column
-- The couples table should already have REPLICA IDENTITY FULL from previous migrations
