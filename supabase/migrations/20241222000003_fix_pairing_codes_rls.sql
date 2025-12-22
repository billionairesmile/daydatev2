-- =====================================================
-- Migration: Fix Pairing Codes RLS Policy
-- Date: 2024-12-22
-- Description: Allow all authenticated users to read pairing codes
-- This is necessary for the joiner to look up codes created by others
-- =====================================================

-- 1. Enable RLS on pairing_codes table (if not already enabled)
ALTER TABLE pairing_codes ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies if any
DROP POLICY IF EXISTS "Users can read own pairing codes" ON pairing_codes;
DROP POLICY IF EXISTS "Users can read pairing codes" ON pairing_codes;
DROP POLICY IF EXISTS "Users can insert pairing codes" ON pairing_codes;
DROP POLICY IF EXISTS "Users can update pairing codes" ON pairing_codes;
DROP POLICY IF EXISTS "Users can delete pairing codes" ON pairing_codes;
DROP POLICY IF EXISTS "Allow anon all pairing_codes" ON pairing_codes;
DROP POLICY IF EXISTS "Allow authenticated all pairing_codes" ON pairing_codes;

-- 3. Create permissive policies for pairing_codes
-- Anyone (authenticated or anon) can read any pairing code
-- This is necessary for the joiner to look up codes
CREATE POLICY "Allow public read pairing_codes" ON pairing_codes
  FOR SELECT USING (true);

-- Authenticated users can insert pairing codes
CREATE POLICY "Allow authenticated insert pairing_codes" ON pairing_codes
  FOR INSERT TO authenticated WITH CHECK (true);

-- Authenticated users can update any pairing code
-- This is necessary for the joiner to update the code when joining
CREATE POLICY "Allow authenticated update pairing_codes" ON pairing_codes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Authenticated users can delete pairing codes
CREATE POLICY "Allow authenticated delete pairing_codes" ON pairing_codes
  FOR DELETE TO authenticated USING (true);

-- Also allow anon users (for demo/test mode)
CREATE POLICY "Allow anon all pairing_codes" ON pairing_codes
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Also check couples table has proper RLS
ALTER TABLE couples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read couples" ON couples;
DROP POLICY IF EXISTS "Allow authenticated all couples" ON couples;
DROP POLICY IF EXISTS "Allow anon all couples" ON couples;

CREATE POLICY "Allow public read couples" ON couples
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert couples" ON couples
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update couples" ON couples
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated delete couples" ON couples
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow anon all couples" ON couples
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 20241222000003_fix_pairing_codes_rls completed successfully';
END $$;
