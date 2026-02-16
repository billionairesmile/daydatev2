import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { FeedCard, CategoryFilter } from '@/components/feed';
import { FeedPost, FeedCategory } from '@/types';
import { db } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { SP, FS, COLORS } from '@/constants/design';

// ---------------------------------------------------------------------------
// DB row → camelCase helper
// ---------------------------------------------------------------------------
function dbRowToFeedPost(row: any): FeedPost {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: row.title,
    caption: row.caption,
    sourceType: row.source_type,
    images: row.images || [],
    locationName: row.location_name,
    latitude: row.latitude,
    longitude: row.longitude,
    price: row.price,
    eventStartDate: row.event_start_date,
    eventEndDate: row.event_end_date,
    externalLink: row.external_link,
    affiliateLink: row.affiliate_link,
    category: row.category,
    tags: row.tags || [],
    isPublished: row.is_published,
    publishDate: row.publish_date,
    priority: row.priority,
    saveCount: row.save_count,
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Feed Screen
// ---------------------------------------------------------------------------
export default function FeedScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  // State
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<FeedCategory>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const offsetRef = useRef(0);

  // -------------------------------------------------------------------
  // Fetch saved post IDs
  // -------------------------------------------------------------------
  const fetchSavedIds = useCallback(async () => {
    if (!userId) return;
    const { data } = await db.feedSaves.getSavedPostIds(userId);
    setSavedIds(new Set(data));
  }, [userId]);

  // -------------------------------------------------------------------
  // Fetch posts (initial or after category change)
  // -------------------------------------------------------------------
  const fetchPosts = useCallback(
    async (reset = true) => {
      const offset = reset ? 0 : offsetRef.current;

      if (reset) {
        setIsLoading(true);
      }

      const { data, error } = await db.feedPosts.getPublished({
        category: category === 'all' ? undefined : category,
        limit: PAGE_SIZE,
        offset,
      });

      if (!error && data) {
        const mapped = data.map(dbRowToFeedPost);

        if (reset) {
          setPosts(mapped);
          offsetRef.current = mapped.length;
        } else {
          setPosts((prev) => [...prev, ...mapped]);
          offsetRef.current += mapped.length;
        }

        setHasMore(mapped.length >= PAGE_SIZE);
      }

      setIsLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
    },
    [category],
  );

  // -------------------------------------------------------------------
  // Initial load + category change
  // -------------------------------------------------------------------
  useEffect(() => {
    fetchPosts(true);
    fetchSavedIds();
  }, [fetchPosts, fetchSavedIds]);

  // -------------------------------------------------------------------
  // Pull to refresh
  // -------------------------------------------------------------------
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchPosts(true);
    fetchSavedIds();
  }, [fetchPosts, fetchSavedIds]);

  // -------------------------------------------------------------------
  // Load more (infinite scroll)
  // -------------------------------------------------------------------
  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    fetchPosts(false);
  }, [isLoadingMore, hasMore, fetchPosts]);

  // -------------------------------------------------------------------
  // Toggle save
  // -------------------------------------------------------------------
  const handleToggleSave = useCallback(
    async (postId: string) => {
      if (!userId) return;

      // Optimistic update
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(postId)) {
          next.delete(postId);
        } else {
          next.add(postId);
        }
        return next;
      });

      const { error } = await db.feedSaves.toggle(userId, postId);

      if (error) {
        // Revert on error
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (next.has(postId)) {
            next.delete(postId);
          } else {
            next.add(postId);
          }
          return next;
        });
      }
    },
    [userId],
  );

  // -------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------
  const renderItem = useCallback(
    ({ item }: { item: FeedPost }) => (
      <FeedCard
        post={item}
        isSaved={savedIds.has(item.id)}
        onToggleSave={() => handleToggleSave(item.id)}
      />
    ),
    [savedIds, handleToggleSave],
  );

  const keyExtractor = useCallback((item: FeedPost) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={COLORS.accent} />
      </View>
    );
  }, [isLoadingMore]);

  const renderEmpty = useCallback(() => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('feed.empty')}</Text>
      </View>
    );
  }, [isLoading, t]);

  const renderHeader = useCallback(
    () => (
      <CategoryFilter
        selected={category}
        onSelect={setCategory}
      />
    ),
    [category],
  );

  // -------------------------------------------------------------------
  // Initial loading state
  // -------------------------------------------------------------------
  if (isLoading && posts.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>{t('feed.loading')}</Text>
      </View>
    );
  }

  // -------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderHeader}
        stickyHeaderIndices={[0]}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.accent}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: SP.xxxl * 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  loadingText: {
    marginTop: SP.md,
    fontSize: FS.md,
    color: COLORS.muted,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: SP.xxxl * 4,
  },
  emptyText: {
    fontSize: FS.lg,
    color: COLORS.muted,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: SP.xl,
    alignItems: 'center',
  },
});
