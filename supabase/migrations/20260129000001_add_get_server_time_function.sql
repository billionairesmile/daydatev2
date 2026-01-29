-- Migration: Add get_server_time function
-- Purpose: Prevent client time manipulation for mission generation
-- This function returns the current server timestamp to ensure
-- mission expiration and generation checks use trusted server time

-- Create function to get server time
CREATE OR REPLACE FUNCTION get_server_time()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT now();
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_server_time() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_server_time() IS 'Returns current server timestamp to prevent client time manipulation for mission operations';
