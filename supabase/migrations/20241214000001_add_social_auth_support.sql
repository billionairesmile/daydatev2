-- =====================================================
-- ADD SOCIAL AUTH SUPPORT
-- This migration adds support for Google and Kakao OAuth
-- =====================================================

-- 1. Add auth_provider column to profiles table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'auth_provider'
    ) THEN
        ALTER TABLE profiles ADD COLUMN auth_provider TEXT DEFAULT 'email';
    END IF;
END $$;

-- 2. Add avatar_url column to profiles table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'avatar_url'
    ) THEN
        ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
    END IF;
END $$;

-- 3. Add email column to profiles table (if not exists)
-- This is useful for storing the user's email from OAuth providers
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'email'
    ) THEN
        ALTER TABLE profiles ADD COLUMN email TEXT;
    END IF;
END $$;

-- 4. Add social_id column to profiles table (if not exists)
-- This stores the unique ID from the OAuth provider
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'social_id'
    ) THEN
        ALTER TABLE profiles ADD COLUMN social_id TEXT;
    END IF;
END $$;

-- 5. Create index for auth_provider for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_auth_provider ON profiles(auth_provider);

-- 6. Create index for social_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_social_id ON profiles(social_id);

-- 7. Add RLS policy for profiles if not exists (to allow users to read their own profile)
-- Note: Permissive policies already exist from previous migrations

-- 8. Create function to handle new user creation from OAuth
-- This function is triggered when a new user signs up via OAuth
CREATE OR REPLACE FUNCTION handle_new_oauth_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Only run for OAuth signups (not email/password)
    IF NEW.raw_app_meta_data->>'provider' IN ('google', 'kakao') THEN
        INSERT INTO public.profiles (
            id,
            nickname,
            email,
            avatar_url,
            auth_provider,
            social_id,
            invite_code
        )
        VALUES (
            NEW.id,
            COALESCE(
                NEW.raw_user_meta_data->>'full_name',
                NEW.raw_user_meta_data->>'name',
                split_part(NEW.email, '@', 1),
                'User'
            ),
            NEW.email,
            COALESCE(
                NEW.raw_user_meta_data->>'avatar_url',
                NEW.raw_user_meta_data->>'picture'
            ),
            NEW.raw_app_meta_data->>'provider',
            NEW.raw_user_meta_data->>'sub',
            substr(md5(random()::text), 1, 6)
        )
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url),
            auth_provider = EXCLUDED.auth_provider,
            social_id = EXCLUDED.social_id,
            updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Create trigger for handling new OAuth users
DROP TRIGGER IF EXISTS on_auth_user_created_oauth ON auth.users;
CREATE TRIGGER on_auth_user_created_oauth
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_oauth_user();

-- 10. Create or update profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    nickname TEXT,
    email TEXT,
    avatar_url TEXT,
    invite_code TEXT UNIQUE,
    auth_provider TEXT DEFAULT 'email',
    social_id TEXT,
    preferences JSONB DEFAULT '{}',
    birth_date DATE,
    location_latitude DOUBLE PRECISION,
    location_longitude DOUBLE PRECISION,
    location_city TEXT,
    location_district TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Enable RLS on profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 12. Create permissive RLS policies for profiles (if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'anon_all_profiles'
    ) THEN
        CREATE POLICY "anon_all_profiles" ON profiles FOR ALL TO anon USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'auth_all_profiles'
    ) THEN
        CREATE POLICY "auth_all_profiles" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 13. Add index for invite_code lookup
CREATE INDEX IF NOT EXISTS idx_profiles_invite_code ON profiles(invite_code);

-- 14. Log completion
DO $$
BEGIN
    RAISE NOTICE 'Social auth support migration completed successfully';
END $$;
