-- Add user consent fields to profiles table
-- These fields track what the user agreed to during onboarding

-- Age verification (만 14세 이상)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT false;

-- Service terms agreement (서비스 이용약관)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS terms_agreed BOOLEAN DEFAULT false;

-- Location-based service terms agreement (위치기반 서비스 이용약관)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_terms_agreed BOOLEAN DEFAULT false;

-- Privacy policy agreement (개인정보 수집 및 이용)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_agreed BOOLEAN DEFAULT false;

-- Marketing notifications agreement (광고성 알림 수신 - optional)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_agreed BOOLEAN DEFAULT false;

-- Timestamp when consent was given
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN profiles.age_verified IS 'User confirmed they are 14 years or older';
COMMENT ON COLUMN profiles.terms_agreed IS 'User agreed to service terms of use';
COMMENT ON COLUMN profiles.location_terms_agreed IS 'User agreed to location-based service terms';
COMMENT ON COLUMN profiles.privacy_agreed IS 'User agreed to privacy policy and data collection';
COMMENT ON COLUMN profiles.marketing_agreed IS 'User agreed to receive marketing notifications (optional)';
COMMENT ON COLUMN profiles.consent_given_at IS 'Timestamp when the user gave their consent';
