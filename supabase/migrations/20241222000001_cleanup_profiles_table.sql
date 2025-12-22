-- =====================================================
-- Migration: Cleanup Profiles Table
-- Date: 2024-12-22
-- Description: Remove unused columns and sync data
-- =====================================================

-- 1. Remove unused columns from profiles table
ALTER TABLE profiles
DROP COLUMN IF EXISTS social_id,
DROP COLUMN IF EXISTS login_provider,
DROP COLUMN IF EXISTS mbti,
DROP COLUMN IF EXISTS avatar_url,
DROP COLUMN IF EXISTS invite_code;

-- 2. Drop unused indexes
DROP INDEX IF EXISTS idx_profiles_invite_code;
DROP INDEX IF EXISTS idx_profiles_social_id;

-- 3. Sync auth_provider from auth.users to profiles
UPDATE profiles
SET auth_provider = auth.users.raw_app_meta_data->>'provider'
FROM auth.users
WHERE profiles.id = auth.users.id
AND (profiles.auth_provider IS NULL OR profiles.auth_provider = 'email');

-- 4. Sync email from auth.users to profiles (for NULL emails)
UPDATE profiles
SET email = auth.users.email
FROM auth.users
WHERE profiles.id = auth.users.id
AND profiles.email IS NULL;

-- 5. Sync couple_id from couples table to profiles (for user1)
UPDATE profiles
SET couple_id = couples.id
FROM couples
WHERE profiles.id = couples.user1_id
AND couples.status = 'active'
AND profiles.couple_id IS NULL;

-- 6. Sync couple_id from couples table to profiles (for user2)
UPDATE profiles
SET couple_id = couples.id
FROM couples
WHERE profiles.id = couples.user2_id
AND couples.status = 'active'
AND profiles.couple_id IS NULL;

-- 7. Set is_onboarding_complete to true for users with active couples
UPDATE profiles
SET is_onboarding_complete = true
WHERE couple_id IS NOT NULL
AND (is_onboarding_complete IS NULL OR is_onboarding_complete = false);

-- 8. Cleanup duplicate pending couples (keep only the latest per user)
DELETE FROM couples c1
WHERE c1.status = 'pending'
AND c1.user2_id IS NULL
AND EXISTS (
    SELECT 1 FROM couples c2
    WHERE c2.user1_id = c1.user1_id
    AND c2.status = 'pending'
    AND c2.user2_id IS NULL
    AND c2.created_at > c1.created_at
);

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 20241222000001_cleanup_profiles_table completed successfully';
END $$;
