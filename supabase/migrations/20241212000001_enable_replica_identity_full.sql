-- =====================================================
-- ENABLE REPLICA IDENTITY FULL FOR REALTIME DELETE EVENTS
-- This allows payload.old to contain full row data on DELETE
-- =====================================================

-- Tables that use DELETE event in realtime subscriptions
ALTER TABLE couple_todos REPLICA IDENTITY FULL;
ALTER TABLE couple_bookmarks REPLICA IDENTITY FULL;
ALTER TABLE couple_albums REPLICA IDENTITY FULL;
ALTER TABLE album_photos REPLICA IDENTITY FULL;
ALTER TABLE mission_progress REPLICA IDENTITY FULL;
ALTER TABLE completed_missions REPLICA IDENTITY FULL;
