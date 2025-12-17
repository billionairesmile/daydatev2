-- Add push token field to profiles table for Expo Push Notifications
-- This field stores the Expo push token for sending push notifications

-- Push notification token from Expo
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Timestamp when the token was last updated
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN profiles.push_token IS 'Expo push notification token (format: ExponentPushToken[...])';
COMMENT ON COLUMN profiles.push_token_updated_at IS 'Timestamp when the push token was last updated';

-- Create index for faster push token lookups
CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON profiles(push_token) WHERE push_token IS NOT NULL;
