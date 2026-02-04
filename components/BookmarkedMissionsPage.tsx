import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Bookmark, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { COLORS, SPACING, isFoldableDevice } from '@/constants/design';
import { useMissionStore } from '@/stores/missionStore';
import { useCoupleSyncStore, type SyncedBookmark } from '@/stores/coupleSyncStore';
import type { KeptMission, Mission } from '@/types';

interface BookmarkedMissionsPageProps {
  onBack: () => void;
}

// Z Flip responsive sizing
const IS_ZFLIP = Platform.OS === 'android' && isFoldableDevice();
const ZFLIP_TITLE_SIZE = IS_ZFLIP ? 15 : 16;
const ZFLIP_DESC_SIZE = IS_ZFLIP ? 12 : 13;
const ZFLIP_BUTTON_HEIGHT = IS_ZFLIP ? 35 : 40;
const ZFLIP_BUTTON_TEXT_SIZE = IS_ZFLIP ? 12 : 14;
const ZFLIP_DELETE_ICON_SIZE = IS_ZFLIP ? 15 : 18;

// Union type for both local and synced bookmarks
type BookmarkItem = KeptMission | SyncedBookmark;

export function BookmarkedMissionsPage({ onBack }: BookmarkedMissionsPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  // Subscribe to todayCompletedMission to trigger re-render when a mission is completed
  // This ensures Start buttons are properly disabled after completing any mission
  const { keptMissions, removeKeptMissionByKeptId, canStartMission, isTodayCompletedMission, todayCompletedMission } = useMissionStore();

  // Helper to check if a bookmark is completed (has completed_at set)
  const isBookmarkCompleted = useCallback((bookmark: BookmarkItem): boolean => {
    if ('mission_data' in bookmark && 'completed_at' in bookmark) {
      return bookmark.completed_at !== null && bookmark.completed_at !== undefined;
    }
    return false;
  }, []);
  const { sharedBookmarks, removeBookmark, isInitialized: isSyncInitialized, lockedMissionId, allMissionProgress } = useCoupleSyncStore();

  // Check if another mission is in progress (locked but not completed)
  const isAnotherMissionInProgress = useCallback((missionId: string) => {
    if (!lockedMissionId || lockedMissionId === missionId) {
      return false;
    }
    // Check if the locked mission is still in progress (not completed)
    const lockedProgress = allMissionProgress.find(p => p.mission_id === lockedMissionId);
    return lockedProgress?.status !== 'completed';
  }, [lockedMissionId, allMissionProgress]);

  // Use synced bookmarks if initialized, otherwise fall back to local
  const bookmarks: BookmarkItem[] = isSyncInitialized
    ? sharedBookmarks
    : keptMissions;

  // Helper to get mission data from bookmark
  const getMissionFromBookmark = (bookmark: BookmarkItem): Mission => {
    if ('mission_data' in bookmark) {
      return bookmark.mission_data;
    }
    return bookmark as Mission;
  };

  // Helper to get unique ID from bookmark
  const getBookmarkId = (bookmark: BookmarkItem): string => {
    if ('mission_data' in bookmark) {
      return bookmark.id;
    }
    return (bookmark as KeptMission).keptId;
  };

  const handleMissionPress = useCallback((missionId: string, isCompleted: boolean) => {
    // If completed, navigate to view the completed mission
    if (isCompleted) {
      router.push(`/mission/${missionId}?source=bookmark`);
      return;
    }

    // Show message if can't start (already completed another mission today or another in progress)
    if (!canStartMission(missionId) && !isTodayCompletedMission(missionId)) {
      if (isAnotherMissionInProgress(missionId)) {
        // Another mission is in progress (locked but not completed)
        Alert.alert(
          t('mission.alerts.cannotStart'),
          t('mission.alerts.anotherInProgressMessage'),
          [{ text: t('common.confirm') }]
        );
      } else {
        // Today's mission quota is used (another mission was completed)
        Alert.alert(
          t('mission.alerts.cannotStart'),
          t('mission.alerts.dailyLimitMessage'),
          [{ text: t('common.confirm') }]
        );
      }
      return;
    }

    // Pass source=bookmark to return to bookmark page on back
    router.push(`/mission/${missionId}?source=bookmark`);
  }, [router, canStartMission, isTodayCompletedMission, isAnotherMissionInProgress, t]);

  const handleRemove = useCallback((bookmark: BookmarkItem, title: string) => {
    Alert.alert(
      t('bookmark.deleteMission'),
      t('bookmark.deleteConfirm', { title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if ('mission_data' in bookmark) {
              // Synced bookmark - remove from DB
              await removeBookmark(bookmark.mission_id);
            } else {
              // Local bookmark - remove locally
              removeKeptMissionByKeptId((bookmark as KeptMission).keptId);
            }
          },
        },
      ]
    );
  }, [removeKeptMissionByKeptId, removeBookmark, t]);

  return (
    <View style={styles.container}>
      {/* Blurred Background Overlay */}
      <BlurView
        experimentalBlurMethod="dimezisBlurView"
        intensity={Platform.OS === 'android' ? 40 : 60}
        tint={Platform.OS === 'android' ? 'light' : 'default'}
        style={styles.blurOverlay}
      />
      <View style={styles.darkOverlay} />

      {/* Header */}
      <View style={styles.header}>
        {/* Back Button */}
        <Pressable onPress={onBack} style={styles.backButton}>
          <ChevronLeft color={COLORS.white} size={24} />
        </Pressable>

        {/* Centered Title */}
        <Text style={styles.headerTitle}>{t('bookmark.title')}</Text>

        {/* Spacer for alignment */}
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {bookmarks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Bookmark color="rgba(255, 255, 255, 0.4)" size={48} style={{ marginBottom: 24 }} />
          <Text style={styles.emptyText}>{t('bookmark.empty')}</Text>
          <Text style={styles.emptySubtext}>{t('bookmark.emptyHint')}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          alwaysBounceVertical={true}
        >
          {bookmarks.map((bookmark) => {
            const mission = getMissionFromBookmark(bookmark);
            const bookmarkId = getBookmarkId(bookmark);
            const isCompleted = isBookmarkCompleted(bookmark) || isTodayCompletedMission(mission.id);
            // Check if this specific mission is currently in progress (locked)
            const isMissionInProgress = lockedMissionId === mission.id;
            const canDelete = !isMissionInProgress;

            return (
              <View key={bookmarkId} style={styles.missionCard}>
                <BlurView experimentalBlurMethod="dimezisBlurView" intensity={60} tint={Platform.OS === 'android' ? 'dark' : 'default'} style={StyleSheet.absoluteFill} />
                <View style={styles.cardDarkOverlay} />


                <View style={styles.cardInner}>
                  {/* Thumbnail */}
                  <View style={styles.thumbnailContainer}>
                    <Image
                      source={{ uri: `${mission.imageUrl}?w=300&h=400&fit=crop` }}
                      style={[styles.thumbnail, isCompleted && styles.thumbnailCompleted]}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.5)']}
                      style={styles.thumbnailOverlay}
                    />
                  </View>

                  {/* Content */}
                  <View style={styles.cardContent}>
                    {/* Title */}
                    <Text style={styles.missionTitle} numberOfLines={2} textBreakStrategy="simple" lineBreakStrategyIOS="hangul-word">
                      {mission.title}
                    </Text>

                    {/* Description */}
                    <Text style={styles.missionDescription} numberOfLines={2}>
                      {mission.description}
                    </Text>

                    {/* Action Buttons */}
                    <View style={styles.actionButtonsRow}>
                      {/* Start/View Button */}
                      <Pressable
                        style={[
                          styles.startButton,
                          !isCompleted && (!canStartMission(mission.id) && !isTodayCompletedMission(mission.id)) && styles.startButtonDisabled,
                        ]}
                        onPress={() => handleMissionPress(mission.id, isCompleted)}
                      >
                        <Text style={[
                          styles.startButtonText,
                          !isCompleted && (!canStartMission(mission.id) && !isTodayCompletedMission(mission.id)) && styles.startButtonTextDisabled,
                        ]}>
                          {isCompleted
                            ? t('mission.completed')
                            : (isAnotherMissionInProgress(mission.id) ? t('mission.anotherInProgress') : t('mission.start'))}
                        </Text>
                      </Pressable>

                      {/* Delete Button - disabled when mission is in progress */}
                      <Pressable
                        style={[
                          styles.deleteButton,
                          !canDelete && styles.deleteButtonDisabled,
                        ]}
                        onPress={() => {
                          if (!canDelete) {
                            return;
                          }
                          handleRemove(bookmark, mission.title);
                        }}
                      >
                        <Trash2
                          color={!canDelete ? 'rgba(255, 255, 255, 0.4)' : COLORS.white}
                          size={ZFLIP_DELETE_ICON_SIZE}
                        />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 64,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    zIndex: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    color: COLORS.white,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -80,
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 120,
    gap: 16,
  },
  missionCard: {
    borderRadius: 24,
    backgroundColor: Platform.OS === 'android' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  cardDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Platform.OS === 'android' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(0, 0, 0, 0)',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start', // cardContent가 자연스러운 높이를 가지도록 함
    gap: 16,
    padding: 16,
  },
  thumbnailContainer: {
    width: 96,
    // minHeight 제거 - 컨텐츠 높이에 따라 자연스럽게 조절
    maxHeight: 140, // 과도하게 길어지지 않도록 제한
    borderRadius: 16,
    overflow: 'hidden',
    flexShrink: 0,
    alignSelf: 'stretch', // 컨텐츠 영역 높이에 맞춤
  },
  thumbnail: {
    ...StyleSheet.absoluteFillObject, // 절대 위치로 컨테이너를 채움
  },
  thumbnailOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
    // justifyContent: 'space-between' 제거 - 컨텐츠를 자연스럽게 쌓아서 높이 축소
  },
  missionTitle: {
    fontSize: ZFLIP_TITLE_SIZE,
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: IS_ZFLIP ? 17 : 21,
    marginBottom: IS_ZFLIP ? 4 : 4,
  },
  missionDescription: {
    fontSize: ZFLIP_DESC_SIZE,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
    lineHeight: IS_ZFLIP ? 15 : 18,
    marginBottom: IS_ZFLIP ? 12 : 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  startButton: {
    flex: 1,
    height: ZFLIP_BUTTON_HEIGHT,
    borderRadius: 100,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: ZFLIP_BUTTON_HEIGHT,
    height: ZFLIP_BUTTON_HEIGHT,
    borderRadius: ZFLIP_BUTTON_HEIGHT / 2,
    backgroundColor: '#FF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: 'rgba(255, 68, 68, 0.4)',
    opacity: 0.6,
  },
  startButtonText: {
    fontSize: ZFLIP_BUTTON_TEXT_SIZE,
    color: COLORS.black,
    fontWeight: '600',
  },
  startButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  startButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  thumbnailCompleted: {
    opacity: 0.5,
  },
});

export default BookmarkedMissionsPage;
