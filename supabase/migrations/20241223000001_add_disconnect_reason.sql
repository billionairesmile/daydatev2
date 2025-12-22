-- Add disconnect_reason column to couples table
-- This differentiates between 'unpaired' (user chose to disconnect) and 'account_deleted' (user deleted their account)

-- Add disconnect_reason column
ALTER TABLE couples ADD COLUMN IF NOT EXISTS disconnect_reason VARCHAR(20);

-- Add comment for documentation
COMMENT ON COLUMN couples.disconnect_reason IS 'Reason for disconnection: unpaired (user disconnected manually) or account_deleted (user deleted their account)';

-- Create index for filtering by disconnect reason
CREATE INDEX IF NOT EXISTS idx_couples_disconnect_reason ON couples (disconnect_reason)
WHERE disconnect_reason IS NOT NULL;
