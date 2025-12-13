-- =====================================================
-- ENSURE REALTIME SYNC SETTINGS FOR DELETE EVENTS
-- This migration ensures proper configuration for
-- real-time sync between paired devices
-- =====================================================

-- 1. Enable REPLICA IDENTITY FULL for all sync tables
-- This ensures DELETE events include the full row data in payload.old
-- Without this, only primary key is included in DELETE events
ALTER TABLE completed_missions REPLICA IDENTITY FULL;
ALTER TABLE album_photos REPLICA IDENTITY FULL;
ALTER TABLE couple_albums REPLICA IDENTITY FULL;
ALTER TABLE couple_todos REPLICA IDENTITY FULL;
ALTER TABLE couple_bookmarks REPLICA IDENTITY FULL;
ALTER TABLE mission_progress REPLICA IDENTITY FULL;
ALTER TABLE couple_settings REPLICA IDENTITY FULL;

-- 2. Ensure all sync tables are in the supabase_realtime publication
-- Note: These commands will fail silently if tables are already in publication
-- which is the desired behavior

DO $$
BEGIN
    -- Add completed_missions if not already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'completed_missions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE completed_missions;
        RAISE NOTICE 'Added completed_missions to supabase_realtime publication';
    END IF;

    -- Add album_photos if not already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'album_photos'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE album_photos;
        RAISE NOTICE 'Added album_photos to supabase_realtime publication';
    END IF;

    -- Add couple_albums if not already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'couple_albums'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE couple_albums;
        RAISE NOTICE 'Added couple_albums to supabase_realtime publication';
    END IF;

    -- Add couple_todos if not already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'couple_todos'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE couple_todos;
        RAISE NOTICE 'Added couple_todos to supabase_realtime publication';
    END IF;

    -- Add couple_bookmarks if not already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'couple_bookmarks'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE couple_bookmarks;
        RAISE NOTICE 'Added couple_bookmarks to supabase_realtime publication';
    END IF;

    -- Add mission_progress if not already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'mission_progress'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE mission_progress;
        RAISE NOTICE 'Added mission_progress to supabase_realtime publication';
    END IF;

    -- Add couple_settings if not already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'couple_settings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE couple_settings;
        RAISE NOTICE 'Added couple_settings to supabase_realtime publication';
    END IF;
END $$;

-- 3. Verify settings by logging current state
DO $$
DECLARE
    table_record RECORD;
BEGIN
    RAISE NOTICE '=== Current Supabase Realtime Publication Tables ===';
    FOR table_record IN
        SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
    LOOP
        RAISE NOTICE 'Table in publication: %', table_record.tablename;
    END LOOP;
END $$;
