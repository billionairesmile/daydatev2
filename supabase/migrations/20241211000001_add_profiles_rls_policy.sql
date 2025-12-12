-- Add RLS policies for profiles table to allow anon/authenticated users to create and manage profiles

-- Enable RLS on profiles table (if not already enabled)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow anon insert profiles" ON profiles;
DROP POLICY IF EXISTS "Allow anon select profiles" ON profiles;
DROP POLICY IF EXISTS "Allow anon update profiles" ON profiles;
DROP POLICY IF EXISTS "Allow authenticated insert profiles" ON profiles;
DROP POLICY IF EXISTS "Allow authenticated select profiles" ON profiles;
DROP POLICY IF EXISTS "Allow authenticated update profiles" ON profiles;

-- Create permissive policies for anon role
CREATE POLICY "Allow anon insert profiles" ON profiles
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon select profiles" ON profiles
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "Allow anon update profiles" ON profiles
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (true);

-- Create permissive policies for authenticated role
CREATE POLICY "Allow authenticated insert profiles" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated select profiles" ON profiles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated update profiles" ON profiles
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
