-- Migration: Add fields for AI mission generation
-- Created: 2025-12-08
-- Description: Add birth_date, location fields to profiles table and dating/wedding dates to couples table

-- ============================================
-- 1. Update profiles table
-- ============================================

-- Add birth date field
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS birth_date DATE;

-- Add location fields for AI mission recommendations
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS location_latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS location_longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS location_city TEXT,
ADD COLUMN IF NOT EXISTS location_district TEXT;

-- Add index for location-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_location
ON profiles(location_latitude, location_longitude);

-- ============================================
-- 2. Update couples table
-- ============================================

-- Add dating start date (when they started dating)
ALTER TABLE couples
ADD COLUMN IF NOT EXISTS dating_start_date DATE;

-- Add wedding date (if married)
ALTER TABLE couples
ADD COLUMN IF NOT EXISTS wedding_date DATE;

-- Migrate existing anniversary_date to dating_start_date if needed
-- (Only if anniversary_type was 'dating')
UPDATE couples
SET dating_start_date = anniversary_date::date
WHERE anniversary_date IS NOT NULL
  AND anniversary_type = 'dating'
  AND dating_start_date IS NULL;

-- Add index for anniversary queries
CREATE INDEX IF NOT EXISTS idx_couples_dates
ON couples(dating_start_date, wedding_date);

-- ============================================
-- 3. Add comments for documentation
-- ============================================

COMMENT ON COLUMN profiles.birth_date IS 'User birth date for age-based mission recommendations';
COMMENT ON COLUMN profiles.location_latitude IS 'User location latitude for location-based recommendations';
COMMENT ON COLUMN profiles.location_longitude IS 'User location longitude for location-based recommendations';
COMMENT ON COLUMN profiles.location_city IS 'User location city (e.g., 서울특별시)';
COMMENT ON COLUMN profiles.location_district IS 'User location district (e.g., 강남구)';

COMMENT ON COLUMN couples.dating_start_date IS 'Date when the couple started dating (for 100-day anniversaries)';
COMMENT ON COLUMN couples.wedding_date IS 'Wedding date if married (for yearly wedding anniversaries)';
