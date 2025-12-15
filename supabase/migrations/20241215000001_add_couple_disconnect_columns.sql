-- Add columns for soft delete (disconnect) functionality with 30-day recovery period
-- This allows couples to reconnect within 30 days and restore all their data

-- Add disconnected_at column to track when the couple was disconnected
ALTER TABLE couples ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ;

-- Add disconnected_by column to track which user initiated the disconnect
ALTER TABLE couples ADD COLUMN IF NOT EXISTS disconnected_by UUID REFERENCES auth.users(id);

-- Create index for efficient lookup of disconnected couples within recovery period
CREATE INDEX IF NOT EXISTS idx_couples_disconnected_at ON couples (disconnected_at)
WHERE disconnected_at IS NOT NULL;

-- Create index for looking up disconnected couples by status
CREATE INDEX IF NOT EXISTS idx_couples_status_disconnected ON couples (status)
WHERE status = 'disconnected';

-- Add comment for documentation
COMMENT ON COLUMN couples.disconnected_at IS 'Timestamp when the couple was disconnected. Used for 30-day recovery period.';
COMMENT ON COLUMN couples.disconnected_by IS 'User ID who initiated the disconnect action.';
