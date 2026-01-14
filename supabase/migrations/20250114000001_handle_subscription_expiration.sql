-- Migration: Handle subscription expiration
-- Description: Automatically updates subscription_plan to 'free' when subscription expires
-- Date: 2025-01-14

-- ============================================
-- 1. Create function to handle expired subscriptions
-- ============================================
CREATE OR REPLACE FUNCTION handle_expired_subscriptions()
RETURNS TABLE (
  updated_profile_id UUID,
  previous_plan TEXT,
  expired_at TIMESTAMPTZ
) AS $$
DECLARE
  profile_record RECORD;
  updated_count INTEGER := 0;
BEGIN
  -- Find all profiles with expired subscriptions
  FOR profile_record IN
    SELECT
      p.id,
      p.subscription_plan,
      p.subscription_expires_at,
      p.couple_id
    FROM profiles p
    WHERE p.subscription_plan IN ('monthly', 'annual')
      AND p.subscription_expires_at IS NOT NULL
      AND p.subscription_expires_at < NOW()
  LOOP
    RAISE NOTICE 'Expiring subscription for profile %: plan=%, expired_at=%',
      profile_record.id,
      profile_record.subscription_plan,
      profile_record.subscription_expires_at;

    -- Return info about the profile being updated
    updated_profile_id := profile_record.id;
    previous_plan := profile_record.subscription_plan;
    expired_at := profile_record.subscription_expires_at;

    -- Update profile to free plan
    UPDATE profiles
    SET
      subscription_plan = 'free',
      subscription_expires_at = NULL,
      updated_at = NOW()
    WHERE id = profile_record.id;

    -- Also update couple's premium status if this user was the premium user
    IF profile_record.couple_id IS NOT NULL THEN
      UPDATE couples
      SET
        is_premium = FALSE,
        premium_user_id = NULL,
        premium_expires_at = NULL,
        updated_at = NOW()
      WHERE id = profile_record.couple_id
        AND premium_user_id = profile_record.id;
    END IF;

    updated_count := updated_count + 1;

    RETURN NEXT;
  END LOOP;

  RAISE NOTICE 'Subscription expiration complete: % profiles updated to free', updated_count;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION handle_expired_subscriptions() TO service_role;

-- ============================================
-- 2. Create log table for subscription changes
-- ============================================
CREATE TABLE IF NOT EXISTS subscription_expiration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL,
  previous_plan TEXT NOT NULL,
  expired_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  trigger TEXT DEFAULT 'cron' CHECK (trigger IN ('cron', 'manual', 'app', 'webhook'))
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_subscription_log_processed_at ON subscription_expiration_log(processed_at);
CREATE INDEX IF NOT EXISTS idx_subscription_log_profile_id ON subscription_expiration_log(profile_id);

-- ============================================
-- 3. Create wrapper function that logs changes
-- ============================================
CREATE OR REPLACE FUNCTION handle_expired_subscriptions_with_log(
  p_trigger TEXT DEFAULT 'cron'
)
RETURNS TABLE (
  updated_count INTEGER,
  log_entries JSONB
) AS $$
DECLARE
  expiration_result RECORD;
  total_updated INTEGER := 0;
  log_array JSONB := '[]'::JSONB;
BEGIN
  FOR expiration_result IN SELECT * FROM handle_expired_subscriptions()
  LOOP
    -- Log each expiration
    INSERT INTO subscription_expiration_log (
      profile_id,
      previous_plan,
      expired_at,
      trigger
    ) VALUES (
      expiration_result.updated_profile_id,
      expiration_result.previous_plan,
      expiration_result.expired_at,
      p_trigger
    );

    log_array := log_array || jsonb_build_object(
      'profile_id', expiration_result.updated_profile_id,
      'previous_plan', expiration_result.previous_plan,
      'expired_at', expiration_result.expired_at
    );

    total_updated := total_updated + 1;
  END LOOP;

  updated_count := total_updated;
  log_entries := log_array;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION handle_expired_subscriptions_with_log(TEXT) TO service_role;

-- ============================================
-- 4. Preview function (shows what would be updated)
-- ============================================
CREATE OR REPLACE FUNCTION preview_expired_subscriptions()
RETURNS TABLE (
  profile_id UUID,
  nickname TEXT,
  subscription_plan TEXT,
  expires_at TIMESTAMPTZ,
  hours_since_expiration NUMERIC,
  couple_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as profile_id,
    p.nickname,
    p.subscription_plan,
    p.subscription_expires_at as expires_at,
    ROUND(EXTRACT(EPOCH FROM (NOW() - p.subscription_expires_at)) / 3600, 1) as hours_since_expiration,
    p.couple_id
  FROM profiles p
  WHERE p.subscription_plan IN ('monthly', 'annual')
    AND p.subscription_expires_at IS NOT NULL
    AND p.subscription_expires_at < NOW()
  ORDER BY p.subscription_expires_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION preview_expired_subscriptions() TO service_role;

-- ============================================
-- 5. Create function to check single profile subscription
-- (Can be called from app when user loads profile)
-- ============================================
CREATE OR REPLACE FUNCTION check_and_expire_subscription(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  profile_record RECORD;
  result JSONB;
BEGIN
  SELECT
    id,
    subscription_plan,
    subscription_expires_at,
    couple_id
  INTO profile_record
  FROM profiles
  WHERE id = p_user_id;

  -- Check if subscription is expired
  IF profile_record.subscription_plan IN ('monthly', 'annual')
     AND profile_record.subscription_expires_at IS NOT NULL
     AND profile_record.subscription_expires_at < NOW()
  THEN
    -- Update profile
    UPDATE profiles
    SET
      subscription_plan = 'free',
      subscription_expires_at = NULL,
      updated_at = NOW()
    WHERE id = p_user_id;

    -- Update couple if applicable
    IF profile_record.couple_id IS NOT NULL THEN
      UPDATE couples
      SET
        is_premium = FALSE,
        premium_user_id = NULL,
        premium_expires_at = NULL,
        updated_at = NOW()
      WHERE id = profile_record.couple_id
        AND premium_user_id = p_user_id;
    END IF;

    -- Log the expiration
    INSERT INTO subscription_expiration_log (
      profile_id,
      previous_plan,
      expired_at,
      trigger
    ) VALUES (
      p_user_id,
      profile_record.subscription_plan,
      profile_record.subscription_expires_at,
      'app'
    );

    result := jsonb_build_object(
      'expired', true,
      'previous_plan', profile_record.subscription_plan,
      'expired_at', profile_record.subscription_expires_at,
      'new_plan', 'free'
    );
  ELSE
    result := jsonb_build_object(
      'expired', false,
      'current_plan', profile_record.subscription_plan,
      'expires_at', profile_record.subscription_expires_at
    );
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_and_expire_subscription(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION check_and_expire_subscription(UUID) TO authenticated;

-- ============================================
-- 6. Schedule hourly check (via pg_cron)
-- Note: Run this manually in Supabase SQL Editor after enabling pg_cron
-- ============================================
-- SELECT cron.schedule(
--   'handle-expired-subscriptions',  -- job name
--   '0 * * * *',                     -- Every hour at minute 0
--   $$SELECT handle_expired_subscriptions_with_log('cron')$$
-- );

-- To unschedule: SELECT cron.unschedule('handle-expired-subscriptions');
-- To view jobs: SELECT * FROM cron.job;
-- To view job runs: SELECT * FROM cron.job_run_details WHERE jobname = 'handle-expired-subscriptions' ORDER BY start_time DESC LIMIT 10;

-- ============================================
-- 7. Add comments for documentation
-- ============================================
COMMENT ON FUNCTION handle_expired_subscriptions() IS
'Finds all profiles with expired subscriptions and updates them to free plan.
Also updates related couple premium status.';

COMMENT ON FUNCTION handle_expired_subscriptions_with_log(TEXT) IS
'Wrapper function that handles expired subscriptions and logs each change.
Trigger parameter: cron, manual, app, or webhook';

COMMENT ON FUNCTION preview_expired_subscriptions() IS
'Preview function to see which profiles have expired subscriptions without updating them.';

COMMENT ON FUNCTION check_and_expire_subscription(UUID) IS
'Check and expire subscription for a single user. Called from app when user loads profile.
Returns JSON with expiration status.';

COMMENT ON TABLE subscription_expiration_log IS
'Audit log for subscription expiration events. Tracks when and how subscriptions were expired.';
