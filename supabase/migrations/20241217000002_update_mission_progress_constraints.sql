-- Migration: Update mission_progress constraints to support multiple missions per day
-- This allows couples to have multiple missions in progress on the same day
-- The first mission where a message is written becomes "locked" for that day

-- Step 1: Drop old constraint (couple_id, date) - only allows one mission per day
ALTER TABLE mission_progress DROP CONSTRAINT IF EXISTS mission_progress_couple_id_date_key;

-- Step 2: Add new constraint (couple_id, date, mission_id) - allows multiple missions per day
ALTER TABLE mission_progress ADD CONSTRAINT mission_progress_couple_date_mission_key
  UNIQUE (couple_id, date, mission_id);

-- Step 3: Add is_message_locked column to track which mission is locked for the day
ALTER TABLE mission_progress ADD COLUMN IF NOT EXISTS is_message_locked BOOLEAN DEFAULT false;

-- Step 4: Create trigger function to ensure only one mission can be locked per couple per day
CREATE OR REPLACE FUNCTION check_single_locked_mission()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_message_locked = true THEN
    IF EXISTS (
      SELECT 1 FROM mission_progress
      WHERE couple_id = NEW.couple_id
        AND date = NEW.date
        AND is_message_locked = true
        AND id != NEW.id
    ) THEN
      RAISE EXCEPTION 'Another mission is already locked for this couple on this date';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger
DROP TRIGGER IF EXISTS enforce_single_locked_mission ON mission_progress;
CREATE TRIGGER enforce_single_locked_mission
  BEFORE INSERT OR UPDATE ON mission_progress
  FOR EACH ROW
  EXECUTE FUNCTION check_single_locked_mission();

-- Step 6: Add index for faster locked mission lookups
CREATE INDEX IF NOT EXISTS idx_mission_progress_locked
  ON mission_progress (couple_id, date, is_message_locked)
  WHERE is_message_locked = true;
