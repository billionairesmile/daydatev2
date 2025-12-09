import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { ChevronLeft, Bell } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { db } from '@/lib/supabase';

type Announcement = {
  id: string;
  title: string;
  date: string;
  isNew: boolean;
};

export default function AnnouncementsScreen() {
  const router = useRouter();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch announcements from Supabase
  useEffect(() => {
    loadAnnouncements();
  }, []);

  const loadAnnouncements = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await db.announcements.getActive();

      if (error) throw error;

      if (data) {
        const formattedAnnouncements: Announcement[] = data.map((item) => ({
          id: item.id,
          title: item.title,
          date: item.date,
          isNew: item.is_new,
        }));
        setAnnouncements(formattedAnnouncements);
      }
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>공지사항</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : announcements.length > 0 ? (
          <View style={styles.listContainer}>
            {announcements.map((item, index) => {
              const isLast = index === announcements.length - 1;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.announcementItem, !isLast && styles.itemBorder]}
                  onPress={() => {}}
                >
                  <View style={styles.itemContent}>
                    <View style={styles.titleRow}>
                      {item.isNew && (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                      )}
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                    </View>
                    <Text style={styles.itemDate}>{item.date}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrapper}>
              <Bell color="#ccc" size={48} />
            </View>
            <Text style={styles.emptyText}>공지사항이 없습니다</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: SPACING.lg,
  },
  listContainer: {
    marginHorizontal: SPACING.lg,
    backgroundColor: '#f8f8f8',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  announcementItem: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  itemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  itemContent: {
    gap: SPACING.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  newBadge: {
    backgroundColor: '#ff4757',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.black,
    flex: 1,
  },
  itemDate: {
    fontSize: 13,
    color: '#999',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyIconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
});
