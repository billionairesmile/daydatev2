import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronDown, ChevronUp, Bell, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { db } from '@/lib/supabase';
import { useLanguageStore, type SupportedLanguage } from '@/stores/languageStore';

const READ_ANNOUNCEMENTS_KEY = '@daydate/read_announcements';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type Announcement = {
  id: string;
  title: string;
  content: string | null;
  date: string;
  createdAt: string;
};

const LANGUAGE_OPTIONS: { code: SupportedLanguage; label: string; displayName: string }[] = [
  { code: 'ko', label: 'KR', displayName: '한국어' },
  { code: 'en', label: 'EN', displayName: 'English' },
  { code: 'ja', label: 'JA', displayName: '日本語' },
  { code: 'zh-TW', label: 'TW', displayName: '繁體中文' },
  { code: 'es', label: 'ES', displayName: 'Español' },
];

export default function AnnouncementsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language: appLanguage } = useLanguageStore();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(appLanguage);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Load read announcements from AsyncStorage
  useEffect(() => {
    const loadReadIds = async () => {
      try {
        const stored = await AsyncStorage.getItem(READ_ANNOUNCEMENTS_KEY);
        if (stored) {
          setReadIds(new Set(JSON.parse(stored)));
        }
      } catch (error) {
        console.error('Error loading read announcements:', error);
      }
    };
    loadReadIds();
  }, []);

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
          content: item.content,
          date: item.date,
          createdAt: item.created_at,
        }));
        setAnnouncements(formattedAnnouncements);
      }
    } catch (error) {
      console.error('Error loading announcements:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if announcement should show NEW badge
  const isNewAnnouncement = useCallback((announcement: Announcement) => {
    // Already read by user
    if (readIds.has(announcement.id)) {
      return false;
    }
    // Check if within 7 days
    const createdDate = new Date(announcement.createdAt);
    const now = new Date();
    return now.getTime() - createdDate.getTime() < SEVEN_DAYS_MS;
  }, [readIds]);

  // Mark announcement as read
  const markAsRead = useCallback(async (id: string) => {
    if (readIds.has(id)) return;

    const newReadIds = new Set(readIds);
    newReadIds.add(id);
    setReadIds(newReadIds);

    try {
      await AsyncStorage.setItem(
        READ_ANNOUNCEMENTS_KEY,
        JSON.stringify([...newReadIds])
      );
    } catch (error) {
      console.error('Error saving read announcements:', error);
    }
  }, [readIds]);

  const handleLanguageSelect = (lang: SupportedLanguage) => {
    setSelectedLanguage(lang);
    setIsDropdownOpen(false);
  };

  const toggleExpand = (id: string) => {
    const isOpening = expandedId !== id;
    setExpandedId(isOpening ? id : null);

    // Mark as read when opening
    if (isOpening) {
      markAsRead(id);
    }
  };

  const currentLanguageOption = LANGUAGE_OPTIONS.find(opt => opt.code === selectedLanguage) || LANGUAGE_OPTIONS[0];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('more.announcements.title')}</Text>
        {/* Language Dropdown */}
        <Pressable
          style={styles.dropdownButton}
          onPress={() => setIsDropdownOpen(true)}
        >
          <Text style={styles.dropdownButtonText}>{currentLanguageOption.displayName}</Text>
          <ChevronDown color={COLORS.black} size={16} />
        </Pressable>
      </View>

      {/* Language Selection Modal */}
      <Modal
        visible={isDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDropdownOpen(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsDropdownOpen(false)}
        >
          <View style={styles.dropdownMenu}>
            {LANGUAGE_OPTIONS.map((option) => (
              <Pressable
                key={option.code}
                style={[
                  styles.dropdownItem,
                  selectedLanguage === option.code && styles.dropdownItemActive,
                ]}
                onPress={() => handleLanguageSelect(option.code)}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    selectedLanguage === option.code && styles.dropdownItemTextActive,
                  ]}
                >
                  {option.displayName}
                </Text>
                {selectedLanguage === option.code && (
                  <Check color={COLORS.black} size={18} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

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
              const isExpanded = expandedId === item.id;
              const isLast = index === announcements.length - 1;
              return (
                <View key={item.id}>
                  <Pressable
                    style={[styles.announcementItem, !isLast && !isExpanded && styles.itemBorder]}
                    onPress={() => toggleExpand(item.id)}
                  >
                    <View style={styles.itemContent}>
                      <View style={styles.titleRow}>
                        {isNewAnnouncement(item) && (
                          <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>NEW</Text>
                          </View>
                        )}
                        <Text style={[styles.itemTitle, isExpanded && styles.itemTitleExpanded]} numberOfLines={isExpanded ? undefined : 1}>
                          {item.title}
                        </Text>
                        {isExpanded ? (
                          <ChevronUp color="#999" size={20} />
                        ) : (
                          <ChevronDown color="#999" size={20} />
                        )}
                      </View>
                      <Text style={styles.itemDate}>{item.date}</Text>
                    </View>
                  </Pressable>
                  {isExpanded && item.content && (
                    <View style={[styles.contentContainer, !isLast && styles.contentBorder]}>
                      <Text style={styles.contentText}>{item.content}</Text>
                    </View>
                  )}
                </View>
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
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
    zIndex: -1,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  dropdownButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.black,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownMenu: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    width: 200,
    paddingVertical: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 8,
    borderRadius: RADIUS.sm,
  },
  dropdownItemActive: {
    backgroundColor: '#f0f0f0',
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.black,
  },
  dropdownItemTextActive: {
    color: COLORS.black,
    fontWeight: '600',
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
  itemTitleExpanded: {
    fontWeight: '600',
  },
  itemDate: {
    fontSize: 13,
    color: '#999',
  },
  contentContainer: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  contentBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  contentText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
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
