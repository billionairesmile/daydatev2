import React, { useState, useEffect, useCallback } from 'react';
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
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { db } from '@/lib/supabase';
import { useLanguageStore, type SupportedLanguage } from '@/stores/languageStore';

type Announcement = {
  id: string;
  title: string;
  date: string;
  isNew: boolean;
};

export default function AnnouncementsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language: appLanguage } = useLanguageStore();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(appLanguage);

  // Fetch announcements from Supabase
  useEffect(() => {
    loadAnnouncements(selectedLanguage);
  }, [selectedLanguage]);

  const loadAnnouncements = useCallback(async (lang: SupportedLanguage) => {
    try {
      setIsLoading(true);
      const { data, error } = await db.announcements.getActiveByLanguage(lang);

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
  }, []);

  const handleLanguageToggle = (lang: SupportedLanguage) => {
    setSelectedLanguage(lang);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('more.announcements.title')}</Text>
        {/* Language Toggle */}
        <View style={styles.languageToggle}>
          <Pressable
            style={[
              styles.langButton,
              selectedLanguage === 'ko' && styles.langButtonActive,
            ]}
            onPress={() => handleLanguageToggle('ko')}
          >
            <Text
              style={[
                styles.langButtonText,
                selectedLanguage === 'ko' && styles.langButtonTextActive,
              ]}
            >
              KR
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.langButton,
              selectedLanguage === 'en' && styles.langButtonActive,
            ]}
            onPress={() => handleLanguageToggle('en')}
          >
            <Text
              style={[
                styles.langButtonText,
                selectedLanguage === 'en' && styles.langButtonTextActive,
              ]}
            >
              EN
            </Text>
          </Pressable>
        </View>
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
            <Text style={styles.emptyText}>{t('more.announcements.empty')}</Text>
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
  languageToggle: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
  },
  langButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  langButtonActive: {
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  langButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
  },
  langButtonTextActive: {
    color: COLORS.black,
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
