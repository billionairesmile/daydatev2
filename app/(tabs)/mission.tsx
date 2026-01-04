import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import { easeGradient } from 'react-native-easing-gradient';
import { Bookmark, Sparkles, X } from 'lucide-react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useUIStore } from '@/stores/uiStore';
import * as Location from 'expo-location';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useMissionStore, MOOD_OPTIONS, TIME_OPTIONS, type TodayMood, type AvailableTime, type MissionGenerationAnswers } from '@/stores/missionStore';
import type { ExcludedMission } from '@/services/missionGenerator';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useBackground } from '@/contexts';
import { BookmarkedMissionsPage } from '@/components/BookmarkedMissionsPage';
import { CircularLoadingAnimation } from '@/components/CircularLoadingAnimation';
import NativeAdMissionCard from '@/components/ads/NativeAdMissionCard';
import RefreshMissionCard from '@/components/RefreshMissionCard';
import type { Mission, FeaturedMission } from '@/types';
import { db, isDemoMode } from '@/lib/supabase';
import { rewardedAdManager } from '@/lib/rewardedAd';
import { cancelHourlyReminders, cancelMissionReminderNotification } from '@/lib/pushNotifications';

// Type for carousel items (Mission, Ad placeholder, or Refresh card)
type CarouselItem = Mission | { type: 'ad'; id: string } | { type: 'refresh'; id: string };

// Fixed card dimensions (width is calculated dynamically in component)
const CARD_HEIGHT = 468;
const CARD_MARGIN = 10;

// Easing gradient for smooth blur transition
const { colors: blurGradientColors, locations: blurGradientLocations } = easeGradient({
  colorStops: {
    0: { color: 'transparent' },
    0.5: { color: 'rgba(0,0,0,0.99)' },
    1: { color: 'black' },
  },
});

export default function MissionScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const setTabBarHidden = useUIStore((s) => s.setTabBarHidden);
  const { showBookmark } = useLocalSearchParams<{ showBookmark?: string }>();
  const { backgroundImage } = useBackground();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBookmarkedMissions, setShowBookmarkedMissions] = useState(false);

  // Hide tab bar when bookmarked missions page is shown
  useEffect(() => {
    setTabBarHidden(showBookmarkedMissions);

    // Cleanup: restore tab bar when component unmounts
    return () => {
      setTabBarHidden(false);
    };
  }, [showBookmarkedMissions, setTabBarHidden]);

  // Get screen dimensions dynamically
  const { width: screenWidth } = useWindowDimensions();
  const CARD_WIDTH = screenWidth * 0.75;
  const SNAP_INTERVAL = CARD_WIDTH + CARD_MARGIN * 2;

  // Handle returning from mission detail to bookmark page
  useEffect(() => {
    if (showBookmark === 'true') {
      setShowBookmarkedMissions(true);
      // Clear the query param to prevent reopening on next focus
      router.setParams({ showBookmark: undefined });
    }
  }, [showBookmark, router]);
  const [showGenerationModal, setShowGenerationModal] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [canMeetToday, setCanMeetToday] = useState<boolean | null>(null);
  const [availableTime, setAvailableTime] = useState<AvailableTime | null>(null);
  const [selectedMoods, setSelectedMoods] = useState<TodayMood[]>([]);
  const [featuredMissions, setFeaturedMissions] = useState<Mission[]>([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(false);
  const [partnerGeneratingMessage, setPartnerGeneratingMessage] = useState<string | null>(null);
  const [isScrollInitialized, setIsScrollInitialized] = useState(false);
  const [loadedImagesCount, setLoadedImagesCount] = useState(0);
  const [totalImagesToLoad, setTotalImagesToLoad] = useState(0);
  const [isWaitingForImages, setIsWaitingForImages] = useState(false);
  const [isRefreshMode, setIsRefreshMode] = useState(false);
  const [isLoadingAd, setIsLoadingAd] = useState(false);
  const isWaitingForImagesRef = useRef(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<Animated.FlatList<CarouselItem>>(null);
  // Track if carousel has been initialized to prevent reset during background sync
  const hasInitializedCarousel = useRef(false);
  const previousMissionsLength = useRef(0);

  const {
    keptMissions,
    keepMission,
    isKeptMission,
    canStartMission,
    isTodayCompletedMission,
    hasTodayMissions,
    getTodayMissions,
    generateTodayMissions,
    checkAndResetMissions,
    resetGeneratedMissions,
    setRefreshUsedToday,
    hasUsedRefreshToday,
    generatedMissionData, // Subscribe to this state to trigger re-renders
    refreshUsedDate, // Subscribe to refreshUsedDate to trigger re-renders when refresh is used
  } = useMissionStore();

  // Couple sync state
  const {
    missionGenerationStatus,
    sharedMissions,
    sharedMissionsDate,
    sharedMissionsRefreshedAt,
    sharedBookmarks,
    isInitialized: isSyncInitialized,
    addBookmark,
    isBookmarked,
    lockedMissionId,
    allMissionProgress,
    coupleId,
    resetAllMissions,
    loadSharedMissions,
  } = useCoupleSyncStore();

  // Get partner info from auth store
  const { partner } = useAuthStore();

  // Subscription store for ads
  const { shouldShowAds } = useSubscriptionStore();

  // Random ad position (1, 2, or 3 = positions 2, 3, or 4 in the carousel)
  const [adPosition] = useState(() => Math.floor(Math.random() * 3) + 1);

  // Check if partner has location enabled (has location data in DB)
  const checkPartnerHasLocation = useCallback((): boolean => {
    if (!partner) return false;
    return !!(partner.locationLatitude && partner.locationLongitude);
  }, [partner]);

  // Use synced bookmark check if initialized, otherwise local
  const checkIsKept = useCallback((missionId: string) => {
    if (isSyncInitialized) {
      return isBookmarked(missionId);
    }
    return isKeptMission(missionId);
  }, [isSyncInitialized, isBookmarked, isKeptMission]);

  // Check if another mission is in progress (locked but not completed)
  const isAnotherMissionInProgress = useCallback((missionId: string) => {
    if (!lockedMissionId || lockedMissionId === missionId) {
      return false;
    }
    // Check if the locked mission is still in progress (not completed)
    const lockedProgress = allMissionProgress.find(p => p.mission_id === lockedMissionId);
    return lockedProgress?.status !== 'completed';
  }, [lockedMissionId, allMissionProgress]);

  // Handle keeping/bookmarking a mission
  const handleKeepMission = useCallback(async (mission: Mission): Promise<boolean> => {
    if (isSyncInitialized) {
      // Use synced bookmarks
      return await addBookmark(mission);
    }
    // Fallback to local
    return keepMission(mission);
  }, [isSyncInitialized, addBookmark, keepMission]);

  // Count bookmarks for badge
  const bookmarkCount = isSyncInitialized ? sharedBookmarks.length : keptMissions.length;

  // Get today's missions or empty array
  // Use useMemo to ensure re-calculation when dependencies change
  // IMPORTANT: isSyncInitialized must be in deps because getTodayMissions() checks it internally
  const todayMissions = React.useMemo(() => {
    return getTodayMissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedMissionData, sharedMissions, sharedMissionsDate, isSyncInitialized, getTodayMissions]);

  const hasGeneratedMissions = React.useMemo(() => {
    return hasTodayMissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedMissionData, sharedMissions, sharedMissionsDate, isSyncInitialized, hasTodayMissions]);

  // Combine AI-generated missions with featured missions (only show featured after daily missions are generated)
  // Also insert native ad at random position (2nd, 3rd, or 4th) if user should see ads
  // Add refresh card at the end for free users
  const allMissions = React.useMemo((): CarouselItem[] => {
    let missions: CarouselItem[] = [];

    // Only include featured missions if today's missions have been generated
    if (hasGeneratedMissions && todayMissions.length > 0) {
      missions = [...todayMissions, ...featuredMissions];
    } else {
      missions = [...todayMissions];
    }

    // Insert ad at random position (1, 2, or 3 = index 1, 2, or 3) if:
    // - Missions have been generated (hasGeneratedMissions is true)
    // - User should see ads (not premium)
    // - There are at least 3 missions (so we have positions 2, 3, 4)
    if (hasGeneratedMissions && shouldShowAds() && missions.length >= 3) {
      const adPlaceholder: CarouselItem = { type: 'ad', id: 'native-ad' };
      // Insert at position 1, 2, or 3 (which is 2nd, 3rd, or 4th item)
      const insertIndex = Math.min(adPosition, missions.length);
      missions = [
        ...missions.slice(0, insertIndex),
        adPlaceholder,
        ...missions.slice(insertIndex),
      ];
    }

    // Add refresh card at the end for ALL users (both free and premium)
    // Only show if missions exist and refresh not used today
    // Refresh is available once per day for everyone
    // Use synced sharedMissionsRefreshedAt (from DB) if sync is initialized, otherwise fallback to local refreshUsedDate
    // This ensures both users see the same refresh card status
    const now = new Date();
    const todayDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Check if refresh was used today:
    // 1. If sync is initialized, use sharedMissionsRefreshedAt (synced from DB)
    // 2. Otherwise, fallback to local refreshUsedDate
    let hasUsedRefresh = false;
    if (isSyncInitialized && sharedMissionsRefreshedAt) {
      // Check if sharedMissionsRefreshedAt is from today
      const refreshedDate = sharedMissionsRefreshedAt.split('T')[0]; // Get YYYY-MM-DD part
      hasUsedRefresh = refreshedDate === todayDateString;
    } else {
      // Fallback to local state
      hasUsedRefresh = refreshUsedDate === todayDateString;
    }

    if (hasGeneratedMissions && todayMissions.length > 0 && !hasUsedRefresh) {
      const refreshPlaceholder: CarouselItem = { type: 'refresh', id: 'refresh-card' };
      missions = [...missions, refreshPlaceholder];
    }

    return missions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayMissions, featuredMissions, hasGeneratedMissions, shouldShowAds, adPosition, refreshUsedDate, isSyncInitialized, sharedMissionsRefreshedAt]);

  // Force FlatList to render properly when missions change from empty to populated
  // This handles cases where the list mounts before React has finished updating
  // IMPORTANT: Only reset scroll on initial load or explicit refresh, not on background sync updates
  useEffect(() => {
    const hasNow = allMissions.length > 0;

    // If missions become empty (e.g., day changed or refresh started), mark for re-initialization
    if (!hasNow && previousMissionsLength.current > 0) {
      hasInitializedCarousel.current = false;
    }

    previousMissionsLength.current = allMissions.length;

    // Only initialize carousel when:
    // 1. We have missions now
    // 2. Not currently generating/loading
    // 3. Carousel hasn't been initialized yet (prevents reset during background sync)
    const shouldInitialize = hasNow && !isGenerating && !isWaitingForImages && !hasInitializedCarousel.current;

    if (shouldInitialize) {
      hasInitializedCarousel.current = true;
      setIsScrollInitialized(false);
      setCurrentIndex(0);
      scrollX.setValue(0);

      // Trigger a scroll to ensure the FlatList renders the items
      // Then set scroll as initialized after a brief delay
      const timer = setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollToOffset({ offset: 0, animated: false });
          // Mark scroll as initialized after the scroll position is set
          setTimeout(() => {
            setIsScrollInitialized(true);
          }, 50);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [allMissions.length, isGenerating, isWaitingForImages, scrollX]);

  // Handle image loading completion - hide loading when all images are loaded
  useEffect(() => {
    if (isWaitingForImages && loadedImagesCount >= totalImagesToLoad && totalImagesToLoad > 0) {
      // All images loaded, hide loading with a small delay for smooth transition
      const timer = setTimeout(() => {
        setIsGenerating(false);
        setIsWaitingForImages(false);
        isWaitingForImagesRef.current = false;
        setLoadedImagesCount(0);
        setTotalImagesToLoad(0);

        // Initialize scroll after images are loaded
        setCurrentIndex(0);
        scrollX.setValue(0);
        setIsScrollInitialized(false);

        setTimeout(() => {
          if (scrollViewRef.current) {
            scrollViewRef.current.scrollToOffset({ offset: 1, animated: false });
            setTimeout(() => {
              scrollViewRef.current?.scrollToOffset({ offset: 0, animated: false });
              setIsScrollInitialized(true);
            }, 50);
          }
        }, 150);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isWaitingForImages, loadedImagesCount, totalImagesToLoad, scrollX]);

  // Callback for when a mission card image loads
  const handleMissionImageLoad = useCallback(() => {
    setLoadedImagesCount(prev => prev + 1);
  }, []);

  // Load featured missions on mount and focus
  const loadFeaturedMissions = useCallback(async () => {
    if (isDemoMode) return; // Skip in demo mode

    setIsLoadingFeatured(true);
    try {
      const { data, error } = await db.featuredMissions.getActiveForToday();

      if (error) {
        console.error('Error loading featured missions:', error);
        return;
      }

      if (data && data.length > 0) {
        // Get completed mission IDs to filter out already completed featured missions
        let completedMissionIds: string[] = [];
        if (coupleId) {
          const { data: completedIds } = await db.completedMissions.getCompletedMissionIds(coupleId);
          if (completedIds) {
            completedMissionIds = completedIds;
          }
        }

        const isEnglish = i18n.language === 'en';

        // Convert featured missions to Mission format with language-aware title/description/tags
        // Filter out missions that have already been completed
        const convertedMissions: Mission[] = data
          .filter((fm) => !completedMissionIds.includes(fm.id))
          .map((fm) => ({
            id: fm.id,
            // Use English title/description/tags if available and language is English, otherwise fallback to Korean
            title: isEnglish && fm.title_en ? fm.title_en : fm.title,
            description: isEnglish && fm.description_en ? fm.description_en : fm.description,
            category: fm.category as Mission['category'],
            tags: isEnglish && fm.tags_en?.length ? fm.tags_en : (fm.tags || []),
            imageUrl: fm.image_url,
            isPremium: false, // Featured missions are free
          }));

        setFeaturedMissions(convertedMissions);
      }
    } catch (error) {
      console.error('Error loading featured missions:', error);
    } finally {
      setIsLoadingFeatured(false);
    }
  }, [i18n.language, coupleId]);

  // Check for date reset on focus
  useFocusEffect(
    useCallback(() => {
      checkAndResetMissions();
      // Don't reset bookmark view if returning from mission detail with showBookmark param
      if (showBookmark !== 'true') {
        setShowBookmarkedMissions(false);
      }
      loadFeaturedMissions(); // Load featured missions on focus

      // Cancel scheduled mission reminder notifications when user visits mission screen
      // This prevents duplicate reminders after user has already checked the app
      cancelHourlyReminders();
      cancelMissionReminderNotification();
    }, [checkAndResetMissions, loadFeaturedMissions, showBookmark])
  );

  // Reload featured missions when language changes
  useEffect(() => {
    loadFeaturedMissions();
  }, [i18n.language, loadFeaturedMissions]);

  // AppState listener to refresh mission data when app comes back to foreground
  // This prevents missions from disappearing when the screen is kept open for a long time
  // and the Supabase real-time subscription silently disconnects
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };

    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      // When app comes back to foreground from background/inactive
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active' &&
        isSyncInitialized &&
        coupleId
      ) {
        console.log('[MissionScreen] App came to foreground, refreshing mission data');
        // Reload shared missions to ensure data is fresh
        await loadSharedMissions();
        // Also check for date reset
        checkAndResetMissions();
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isSyncInitialized, coupleId, loadSharedMissions, checkAndResetMissions]);

  // Periodic refresh of mission data every 5 minutes while screen is active
  // This ensures mission data stays fresh even if real-time subscription disconnects
  useEffect(() => {
    if (!isSyncInitialized || !coupleId) return;

    const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

    const intervalId = setInterval(async () => {
      // Only refresh if app is in foreground
      if (AppState.currentState === 'active') {
        console.log('[MissionScreen] Periodic mission data refresh');
        await loadSharedMissions();
      }
    }, REFRESH_INTERVAL);

    return () => {
      clearInterval(intervalId);
    };
  }, [isSyncInitialized, coupleId, loadSharedMissions]);

  // Midnight reset timer - Reset missions exactly at 12:00 AM
  // This ensures missions reset even while the user is actively using the app
  useEffect(() => {
    const scheduleNextMidnightReset = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      console.log('[MissionScreen] Scheduling midnight reset in', Math.round(msUntilMidnight / 1000 / 60), 'minutes');

      return setTimeout(() => {
        console.log('[MissionScreen] Midnight reset triggered!');

        // Reset missions
        checkAndResetMissions();

        // Reset carousel state so it shows the empty state / generate button
        hasInitializedCarousel.current = false;
        setIsScrollInitialized(false);
        setCurrentIndex(0);

        // Schedule next midnight reset
        scheduleNextMidnightReset();
      }, msUntilMidnight);
    };

    const midnightTimeoutId = scheduleNextMidnightReset();

    return () => {
      clearTimeout(midnightTimeoutId);
    };
  }, [checkAndResetMissions]);

  // Watch for partner generating missions (via real-time sync)
  useEffect(() => {
    if (isSyncInitialized && missionGenerationStatus === 'generating') {
      // Partner is generating - show loading state
      setIsGenerating(true);
      setPartnerGeneratingMessage(t('mission.generatingMessage'));
    } else if (missionGenerationStatus === 'completed' && sharedMissions.length > 0) {
      // Missions were generated (by partner or self) - hide loading
      setIsGenerating(false);
      setPartnerGeneratingMessage(null);
    }
  }, [isSyncInitialized, missionGenerationStatus, sharedMissions.length]);

  // Check location permission
  const checkLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error checking location permission:', error);
      return false;
    }
  };

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Error requesting location permission:', error);
      return false;
    }
  };

  const handleOpenSettings = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  };

  const handleGenerateButtonPress = async () => {
    // Check if location permission is granted for current user
    const hasPermission = await checkLocationPermission();

    if (!hasPermission) {
      Alert.alert(
        t('mission.alerts.locationRequired'),
        t('mission.alerts.locationRequiredMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('mission.alerts.allowPermission'),
            onPress: async () => {
              const granted = await requestLocationPermission();
              if (granted) {
                // Only generating user's location is required
                setShowGenerationModal(true);
              } else {
                Alert.alert(
                  t('mission.alerts.locationDenied'),
                  t('mission.alerts.locationDeniedMessage'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    { text: t('mission.alerts.goToSettings'), onPress: handleOpenSettings },
                  ]
                );
              }
            },
          },
        ]
      );
      return;
    }

    // Only generating user's location is required, open modal
    setShowGenerationModal(true);
  };

  // Handle mission generation
  const handleGenerateMissions = useCallback(async () => {
    if (canMeetToday === null || availableTime === null || selectedMoods.length === 0) return;

    // Prepare answers
    const answers: MissionGenerationAnswers = {
      canMeetToday,
      availableTime,
      todayMoods: selectedMoods,
    };

    // Handle refresh mode
    if (isRefreshMode) {
      // Premium users skip the ad and directly generate missions
      const isPremiumUser = !shouldShowAds();

      if (isPremiumUser) {
        // Premium user - no ad required, directly generate
        setShowGenerationModal(false);
        setIsRefreshMode(false);
        setIsGenerating(true);
        setPartnerGeneratingMessage(null);

        // Save original missions before reset (for deduplication)
        const originalMissions = getTodayMissions();
        const excludedMissions: ExcludedMission[] = originalMissions.map(m => ({
          title: m.title,
          category: m.category,
        }));
        console.log('[Mission Refresh] Premium user - excluding original missions:', excludedMissions.map(m => m.title).join(', '));

        // Reset existing missions first (both local and shared)
        resetGeneratedMissions();
        await resetAllMissions();

        // Generate new missions with excluded missions to avoid duplicates
        let result;
        try {
          result = await generateTodayMissions(answers, excludedMissions);
        } catch (error) {
          console.error('[Mission Refresh] Premium user generation error:', error);
          setIsGenerating(false);
          setPartnerGeneratingMessage(null);
          Alert.alert(
            t('mission.alerts.generationError') || '미션 생성 오류',
            t('mission.alerts.generationErrorMessage') || '미션을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.',
            [{ text: t('common.confirm') || '확인' }]
          );
          return;
        }

        if (result && result.status === 'locked') {
          setPartnerGeneratingMessage(t('mission.refresh.partnerGenerating'));
          return;
        }

        if (result && result.status === 'exists') {
          setIsGenerating(false);
          setPartnerGeneratingMessage(null);
          return;
        }

        // Handle error statuses that block generation
        if (result && (result.status === 'location_required' || result.status === 'preferences_required' || result.status === 'limit_reached')) {
          setIsGenerating(false);
          setPartnerGeneratingMessage(null);
          return;
        }

        const newMissions = getTodayMissions();

        // Mark refresh as used for today (only once per day - applies to premium too)
        if (newMissions.length > 0) {
          await setRefreshUsedToday();
        }

        // Prefetch and load images
        if (newMissions.length > 0) {
          const imagesToLoad = newMissions.filter(mission => mission.imageUrl);

          try {
            const imagePromises = imagesToLoad.map(mission =>
              ExpoImage.prefetch(`${mission.imageUrl}?w=800&h=1000&fit=crop`)
            );

            await Promise.race([
              Promise.all(imagePromises),
              new Promise(resolve => setTimeout(resolve, 8000)),
            ]);
          } catch (error) {
            console.log('Image prefetch error:', error);
          }

          setLoadedImagesCount(0);
          setTotalImagesToLoad(imagesToLoad.length);
          setIsWaitingForImages(true);
          isWaitingForImagesRef.current = true;

          setTimeout(() => {
            if (isWaitingForImagesRef.current) {
              setIsGenerating(false);
              setIsWaitingForImages(false);
              isWaitingForImagesRef.current = false;
              setLoadedImagesCount(0);
              setTotalImagesToLoad(0);
            }
          }, 10000);
        } else {
          setIsGenerating(false);
        }

        setCanMeetToday(null);
        setAvailableTime(null);
        setSelectedMoods([]);
        return;
      }

      // Free user - close modal, show rewarded ad, generate missions in PARALLEL
      // Save original missions before reset (for deduplication)
      const originalMissionsForAd = getTodayMissions();
      const excludedMissionsForAd: ExcludedMission[] = originalMissionsForAd.map(m => ({
        title: m.title,
        category: m.category,
      }));
      console.log('[Mission Refresh] Free user - parallel ad + generation, excluding:', excludedMissionsForAd.map(m => m.title).join(', '));

      // 1. Set loading state FIRST (before closing modal) to prevent "오늘의 미션" button from showing
      setIsGenerating(true);
      setPartnerGeneratingMessage(null);
      setIsLoadingAd(true);

      // 2. Close modal
      setShowGenerationModal(false);
      setIsRefreshMode(false);

      // Track generation error for error handling
      let missionGenerationError: Error | null = null;
      let generationResult: Awaited<ReturnType<typeof generateTodayMissions>> | null = null;

      // 2. Start mission generation IMMEDIATELY (runs in parallel with ad)
      const missionGenerationPromise = (async () => {
        try {
          // Reset existing missions first (both local and shared)
          resetGeneratedMissions();
          await resetAllMissions();

          // Generate new missions with excluded missions to avoid duplicates
          const result = await generateTodayMissions(answers, excludedMissionsForAd);
          console.log('[Mission Refresh] Parallel generation completed:', result?.status);
          generationResult = result;
          return result;
        } catch (error) {
          console.error('[Mission Refresh] Parallel generation error:', error);
          missionGenerationError = error as Error;
          return null;
        }
      })();

      // 3. Load and show rewarded ad (runs in parallel with mission generation)
      const adShown = await rewardedAdManager.loadAndShow({
        onAdClosed: async () => {
          setIsLoadingAd(false);
          // isGenerating is already true from before modal close, keep it showing

          // Wait for mission generation to complete (should already be done or almost done)
          const result = await missionGenerationPromise;

          // Handle generation error
          if (missionGenerationError || !result) {
            setIsGenerating(false);
            Alert.alert(
              t('mission.refresh.adLoadingFailed'),
              t('mission.refresh.adLoadingFailedMessage'),
              [{ text: t('common.confirm') }]
            );
            return;
          }

          // Handle different generation statuses
          if (result.status === 'locked') {
            setPartnerGeneratingMessage(t('mission.refresh.partnerGenerating'));
            return;
          }

          if (result.status === 'exists' || result.status === 'success') {
            // Success - missions are ready
          } else if (result.status === 'location_required' || result.status === 'preferences_required') {
            setIsGenerating(false);
            setPartnerGeneratingMessage(null);
            return;
          }

          // Get the newly generated missions
          const newMissions = getTodayMissions();

          // Mark refresh as used for today (only once per day)
          if (newMissions.length > 0) {
            await setRefreshUsedToday();
          }

          // Prefetch and load images
          if (newMissions.length > 0) {
            const imagesToLoad = newMissions.filter(mission => mission.imageUrl);

            try {
              const imagePromises = imagesToLoad.map(mission =>
                ExpoImage.prefetch(`${mission.imageUrl}?w=800&h=1000&fit=crop`)
              );

              await Promise.race([
                Promise.all(imagePromises),
                new Promise(resolve => setTimeout(resolve, 8000)),
              ]);
            } catch (error) {
              console.log('Image prefetch error:', error);
            }

            setLoadedImagesCount(0);
            setTotalImagesToLoad(imagesToLoad.length);
            setIsWaitingForImages(true);
            isWaitingForImagesRef.current = true;

            setTimeout(() => {
              if (isWaitingForImagesRef.current) {
                setIsGenerating(false);
                setIsWaitingForImages(false);
                isWaitingForImagesRef.current = false;
                setLoadedImagesCount(0);
                setTotalImagesToLoad(0);
              }
            }, 10000);
          } else {
            setIsGenerating(false);
          }

          // Reset form
          setCanMeetToday(null);
          setAvailableTime(null);
          setSelectedMoods([]);
        },
        onAdFailedToLoad: () => {
          setIsLoadingAd(false);
          // Show error alert
          Alert.alert(
            t('mission.refresh.adLoadingFailed'),
            t('mission.refresh.adLoadingFailedMessage'),
            [{ text: t('common.confirm') }]
          );
        },
      });

      // If ad loading failed or was not shown (e.g., in Expo Go), handle fallback
      if (!adShown) {
        setIsLoadingAd(false);
        // For Expo Go / development, skip ad and wait for generation to complete
        if (__DEV__) {
          // Modal already closed above, show loading animation
          setIsGenerating(true);
          setPartnerGeneratingMessage(null);

          // Wait for mission generation to complete and get result
          const devResult = await missionGenerationPromise;

          if (missionGenerationError || !devResult) {
            setIsGenerating(false);
            return;
          }

          if (devResult.status === 'locked') {
            setPartnerGeneratingMessage(t('mission.refresh.partnerGenerating'));
            return;
          }

          if (devResult.status === 'exists' || devResult.status === 'success') {
            // Success - continue to show missions
          } else if (devResult.status === 'location_required' || devResult.status === 'preferences_required') {
            setIsGenerating(false);
            setPartnerGeneratingMessage(null);
            return;
          }

          const newMissions = getTodayMissions();

          // Mark refresh as used for today (only once per day)
          if (newMissions.length > 0) {
            await setRefreshUsedToday();
          }

          if (newMissions.length > 0) {
            const imagesToLoad = newMissions.filter(mission => mission.imageUrl);

            try {
              const imagePromises = imagesToLoad.map(mission =>
                ExpoImage.prefetch(`${mission.imageUrl}?w=800&h=1000&fit=crop`)
              );

              await Promise.race([
                Promise.all(imagePromises),
                new Promise(resolve => setTimeout(resolve, 8000)),
              ]);
            } catch (error) {
              console.log('Image prefetch error:', error);
            }

            setLoadedImagesCount(0);
            setTotalImagesToLoad(imagesToLoad.length);
            setIsWaitingForImages(true);
            isWaitingForImagesRef.current = true;

            setTimeout(() => {
              if (isWaitingForImagesRef.current) {
                setIsGenerating(false);
                setIsWaitingForImages(false);
                isWaitingForImagesRef.current = false;
                setLoadedImagesCount(0);
                setTotalImagesToLoad(0);
              }
            }, 10000);
          } else {
            setIsGenerating(false);
          }

          setCanMeetToday(null);
          setAvailableTime(null);
          setSelectedMoods([]);
        }
      }

      return;
    }

    // Normal mode (not refresh)
    // Close modal first
    setShowGenerationModal(false);

    // Show loading animation
    setIsGenerating(true);
    setPartnerGeneratingMessage(null);

    // Generate missions (this calls AI API)
    console.log('[Mission] Starting mission generation...');
    let result;
    try {
      result = await generateTodayMissions(answers);
      console.log('[Mission] Generation result:', result);
    } catch (error) {
      console.error('[Mission] Error generating missions:', error);
      setIsGenerating(false);
      setPartnerGeneratingMessage(null);
      Alert.alert(
        t('mission.alerts.generationError') || '미션 생성 오류',
        t('mission.alerts.generationErrorMessage') || '미션을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.',
        [{ text: t('common.confirm') || '확인' }]
      );
      return;
    }

    // Handle different generation statuses
    console.log('[Mission] Handling result status:', result?.status);
    if (result && result.status === 'locked') {
      // Partner is already generating - show their message
      setPartnerGeneratingMessage(t('mission.generatingMessage'));
      // Don't hide loading - wait for sync update
      return;
    }

    if (result && result.status === 'exists') {
      // Missions already exist - just show them
      setIsGenerating(false);
      setPartnerGeneratingMessage(null);
      return;
    }

    // Handle error statuses that block generation
    if (result && (result.status === 'location_required' || result.status === 'preferences_required' || result.status === 'limit_reached')) {
      // These statuses already showed their own alerts in missionStore
      console.log('[Mission] Blocking status received:', result.status, '- hiding loading');
      setIsGenerating(false);
      setPartnerGeneratingMessage(null);
      return;
    }

    // Get the newly generated missions
    console.log('[Mission] Getting generated missions...');
    const newMissions = getTodayMissions();
    console.log('[Mission] Generated missions count:', newMissions.length);

    // Prefetch all mission images before showing cards
    if (newMissions.length > 0) {
      const imagesToLoad = newMissions.filter(mission => mission.imageUrl);

      try {
        const imagePromises = imagesToLoad.map(mission =>
          ExpoImage.prefetch(`${mission.imageUrl}?w=800&h=1000&fit=crop`)
        );

        // Wait for all images to prefetch (with timeout fallback)
        await Promise.race([
          Promise.all(imagePromises),
          new Promise(resolve => setTimeout(resolve, 8000)), // 8초 타임아웃
        ]);
      } catch (error) {
        console.log('Image prefetch error:', error);
        // Continue even if prefetch fails
      }

      // Set up image loading tracking - wait for actual render
      // The loading will hide when all images call onLoad
      setLoadedImagesCount(0);
      setTotalImagesToLoad(imagesToLoad.length);
      setIsWaitingForImages(true);
      isWaitingForImagesRef.current = true;

      // Set a maximum wait time (10 seconds) as fallback
      setTimeout(() => {
        if (isWaitingForImagesRef.current) {
          setIsGenerating(false);
          setIsWaitingForImages(false);
          isWaitingForImagesRef.current = false;
          setLoadedImagesCount(0);
          setTotalImagesToLoad(0);
        }
      }, 10000);
    } else {
      // No missions generated, hide loading immediately
      setIsGenerating(false);
    }

    // Reset form
    setCanMeetToday(null);
    setAvailableTime(null);
    setSelectedMoods([]);
  }, [canMeetToday, availableTime, selectedMoods, isRefreshMode, generateTodayMissions, getTodayMissions, resetGeneratedMissions, resetAllMissions, setRefreshUsedToday, t, scrollX]);

  const toggleMood = (mood: TodayMood) => {
    if (selectedMoods.includes(mood)) {
      setSelectedMoods(selectedMoods.filter(m => m !== mood));
    } else {
      setSelectedMoods([...selectedMoods, mood]);
    }
  };

  const isGenerationFormValid = canMeetToday !== null && availableTime !== null && selectedMoods.length > 0;

  const handleMissionPress = useCallback((missionId: string) => {
    router.push(`/mission/${missionId}`);
  }, [router]);

  const handleDotPress = (index: number) => {
    scrollViewRef.current?.scrollToIndex({
      index,
      animated: true,
    });
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
    []
  );

  // Mark scroll as initialized when user starts dragging
  const onScrollBeginDrag = useCallback(() => {
    if (!isScrollInitialized) {
      setIsScrollInitialized(true);
    }
  }, [isScrollInitialized]);

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  // Helper function to check if item is an ad
  const isAdItem = (item: CarouselItem): item is { type: 'ad'; id: string } => {
    return 'type' in item && item.type === 'ad';
  };

  // Helper function to check if item is a refresh card
  const isRefreshItem = (item: CarouselItem): item is { type: 'refresh'; id: string } => {
    return 'type' in item && item.type === 'refresh';
  };

  // Handle refresh button press - open modal in refresh mode
  const handleRefreshPress = useCallback(() => {
    setIsRefreshMode(true);
    setShowGenerationModal(true);
  }, []);

  const renderCard = useCallback(
    ({ item, index }: { item: CarouselItem; index: number }) => {
      const inputRange = [
        (index - 1) * SNAP_INTERVAL,
        index * SNAP_INTERVAL,
        (index + 1) * SNAP_INTERVAL,
      ];

      // For the first card, use full scale (1.0) until scroll is initialized
      // This prevents the intermittent bug where first card appears smaller
      const scale = index === 0 && !isScrollInitialized
        ? 1
        : scrollX.interpolate({
          inputRange,
          outputRange: [0.9, 1, 0.9],
          extrapolate: 'clamp',
        });

      // Don't use opacity animation - it causes cards to be invisible until scroll event
      // The scale animation provides enough visual feedback for carousel effect

      // Render native ad if item is ad placeholder
      if (isAdItem(item)) {
        return (
          <Animated.View
            style={[
              styles.card,
              {
                width: CARD_WIDTH,
                transform: [{ scale }],
              },
            ]}
          >
            <View style={styles.cardInnerAd}>
              <NativeAdMissionCard />
            </View>
          </Animated.View>
        );
      }

      // Render refresh card if item is refresh placeholder
      if (isRefreshItem(item)) {
        return (
          <Animated.View
            style={[
              styles.card,
              {
                width: CARD_WIDTH,
                transform: [{ scale }],
              },
            ]}
          >
            <RefreshMissionCard onRefreshPress={handleRefreshPress} />
          </Animated.View>
        );
      }

      // Render mission card
      return (
        <Animated.View
          style={[
            styles.card,
            {
              width: CARD_WIDTH,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={styles.cardInner}>
            <MissionCardContent
              mission={item}
              onStartPress={() => handleMissionPress(item.id)}
              onKeepPress={() => handleKeepMission(item)}
              isKept={checkIsKept(item.id)}
              canStart={canStartMission(item.id)}
              isCompletedToday={isTodayCompletedMission(item.id)}
              isAnotherMissionInProgress={isAnotherMissionInProgress(item.id)}
              onImageLoad={handleMissionImageLoad}
            />
          </View>
        </Animated.View>
      );
    },
    [scrollX, handleMissionPress, handleKeepMission, checkIsKept, canStartMission, isTodayCompletedMission, lockedMissionId, isScrollInitialized, isAnotherMissionInProgress, handleMissionImageLoad, handleRefreshPress, SNAP_INTERVAL, CARD_WIDTH]
  );

  return (
    <View style={styles.container}>
      {/* Background Image - Optimized with expo-image + blur */}
      <View style={styles.backgroundImage}>
        <ExpoImage
          source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
          placeholder="L6PZfSi_.AyE_3t7t7R**0LTIpIp"
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          style={styles.backgroundImageStyle}
        />
        <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.overlay} />

      {/* BookmarkedMissionsPage Overlay */}
      {showBookmarkedMissions && (
        <View style={styles.bookmarkedOverlay}>
          <BookmarkedMissionsPage
            onBack={() => setShowBookmarkedMissions(false)}
          />
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('mission.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {t('mission.subtitle')}
          </Text>
        </View>
        <Pressable
          style={styles.historyButton}
          onPress={() => setShowBookmarkedMissions(true)}
        >
          <Bookmark color={COLORS.white} size={20} strokeWidth={2} />
          {bookmarkCount > 0 && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{bookmarkCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Card Carousel or Empty State */}
      <View style={styles.cardContainer}>
        {hasGeneratedMissions ? (
          <View style={styles.carouselWrapper}>
            <Animated.FlatList
              key={`mission-list-${allMissions.length}`}
              ref={scrollViewRef}
              data={allMissions}
              keyExtractor={(item) => item.id}
              renderItem={renderCard}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={SNAP_INTERVAL}
              decelerationRate="fast"
              disableIntervalMomentum={true}
              contentContainerStyle={{
                paddingHorizontal: (screenWidth - CARD_WIDTH) / 2 - CARD_MARGIN,
                alignItems: 'center',
              }}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true }
              )}
              scrollEventThrottle={16}
              onScrollBeginDrag={onScrollBeginDrag}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              getItemLayout={(_, index) => ({
                length: SNAP_INTERVAL,
                offset: SNAP_INTERVAL * index,
                index,
              })}
              extraData={[hasGeneratedMissions, allMissions.map(m => m.id).join(','), lockedMissionId]}
              initialNumToRender={3}
              maxToRenderPerBatch={3}
              windowSize={5}
              removeClippedSubviews={false}
            />

            {/* Dots Indicator - Positioned at bottom of carousel */}
            <View style={styles.dotsContainer}>
              {allMissions.map((_, index) => (
                <Pressable
                  key={index}
                  onPress={() => handleDotPress(index)}
                  style={[
                    styles.dot,
                    index === currentIndex && styles.dotActive,
                  ]}
                />
              ))}
            </View>
          </View>
        ) : (
          /* Empty State - Generate Button or Loading Animation */
          <View style={styles.emptyStateContainer}>
            {isGenerating || isLoadingAd ? (
              <View style={styles.loadingAnimationWrapper}>
                <CircularLoadingAnimation size={100} strokeWidth={6} color={COLORS.white} />
                <Text style={styles.loadingAnimationText}>
                  {isLoadingAd ? t('mission.refresh.loadingAd') : (partnerGeneratingMessage ? t('mission.generating') : t('mission.generatingMessage'))}
                </Text>
                <Text style={styles.loadingAnimationSubtext}>
                  {t('mission.pleaseWait')}
                </Text>
              </View>
            ) : (
              <Pressable
                style={styles.glassGenerateButton}
                onPress={handleGenerateButtonPress}
              >
                <BlurView
                  intensity={30}
                  tint="dark"
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.glassGenerateButtonText}>{t('mission.title')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {/* Mission Generation Modal */}
      <Modal
        visible={showGenerationModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGenerationModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.whiteModalContainer}>
            {/* Modal Header */}
            <View style={styles.whiteModalHeader}>
              <View style={styles.modalHeaderSpacer} />
              <Text style={styles.whiteModalTitle}>
                {isRefreshMode ? t('mission.refresh.modalTitle') : t('mission.title')}
              </Text>
              <Pressable
                style={styles.whiteModalCloseButton}
                onPress={() => {
                  setShowGenerationModal(false);
                  setIsRefreshMode(false);
                  setCanMeetToday(null);
                  setAvailableTime(null);
                  setSelectedMoods([]);
                }}
              >
                <X color={COLORS.black} size={24} />
              </Pressable>
            </View>

            {/* Question 1: Can Meet Today */}
            <View style={styles.whiteQuestionSection}>
              <Text style={styles.whiteQuestionLabel}>{t('mission.questions.canMeetToday')}</Text>
              <View style={styles.whiteBinaryOptions}>
                <Pressable
                  style={[
                    styles.whiteBinaryOption,
                    canMeetToday === true && styles.whiteBinaryOptionActive,
                  ]}
                  onPress={() => setCanMeetToday(true)}
                >
                  <Text style={[
                    styles.whiteBinaryOptionText,
                    canMeetToday === true && styles.whiteBinaryOptionTextActive,
                  ]}>
                    {t('mission.questions.yesMeet')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.whiteBinaryOption,
                    canMeetToday === false && styles.whiteBinaryOptionActive,
                  ]}
                  onPress={() => setCanMeetToday(false)}
                >
                  <Text style={[
                    styles.whiteBinaryOptionText,
                    canMeetToday === false && styles.whiteBinaryOptionTextActive,
                  ]}>
                    {t('mission.questions.noMeet')}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Question 2: Available Time */}
            <View style={styles.whiteQuestionSection}>
              <Text style={styles.whiteQuestionLabel}>{t('mission.questions.availableTime')}</Text>
              <View style={styles.whiteTimeOptions}>
                {TIME_OPTIONS.map((time) => (
                  <Pressable
                    key={time.id}
                    style={[
                      styles.whiteTimeOption,
                      availableTime === time.id && styles.whiteTimeOptionActive,
                    ]}
                    onPress={() => setAvailableTime(time.id)}
                  >
                    <Text style={[
                      styles.whiteTimeOptionLabel,
                      availableTime === time.id && styles.whiteTimeOptionLabelActive,
                    ]}>
                      {t(`mission.timeOptions.${time.id}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Question 3: Today's Mood */}
            <View style={styles.whiteQuestionSection}>
              <Text style={styles.whiteQuestionLabel}>{t('mission.questions.todayMood')}</Text>
              <View style={styles.whiteMoodOptions}>
                {MOOD_OPTIONS.map((mood, index) => {
                  // 2-3-2 layout: first 2 buttons 47%, next 3 buttons 30%, last 2 buttons 47%
                  const buttonWidth = index < 2 || index > 4 ? '47%' : '30%';
                  return (
                    <Pressable
                      key={mood.id}
                      style={[
                        styles.whiteMoodOption,
                        { width: buttonWidth },
                        selectedMoods.includes(mood.id) && styles.whiteMoodOptionActive,
                      ]}
                      onPress={() => toggleMood(mood.id)}
                    >
                      <Text style={styles.whiteMoodOptionIcon}>{mood.icon}</Text>
                      <Text style={[
                        styles.whiteMoodOptionText,
                        selectedMoods.includes(mood.id) && styles.whiteMoodOptionTextActive,
                      ]}>
                        {t(`mission.moodOptions.${mood.id}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Generate Button */}
            <View style={styles.whiteModalButtonContainer}>
              <Pressable
                style={[
                  styles.whiteModalGenerateButton,
                  !isGenerationFormValid && styles.whiteModalGenerateButtonDisabled,
                ]}
                onPress={handleGenerateMissions}
                disabled={!isGenerationFormValid || isGenerating || isLoadingAd}
              >
                {isGenerating || isLoadingAd ? (
                  <View style={styles.generatingContent}>
                    <ActivityIndicator color={COLORS.white} size="small" />
                    <Text style={styles.whiteModalGenerateButtonText}>
                      {isLoadingAd ? t('mission.refresh.generating') : t('mission.generating')}
                    </Text>
                  </View>
                ) : (
                  <Text style={[
                    styles.whiteModalGenerateButtonText,
                    !isGenerationFormValid && styles.whiteModalGenerateButtonTextDisabled,
                  ]}>
                    {isRefreshMode ? t('mission.refresh.modalButton') : t('mission.generate')}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

interface MissionCardContentProps {
  mission: Mission;
  onStartPress?: () => void;
  onKeepPress?: () => boolean | void | Promise<boolean>;
  isKept?: boolean;
  canStart?: boolean;
  isCompletedToday?: boolean;
  isAnotherMissionInProgress?: boolean;
  onImageLoad?: () => void;
}

function MissionCardContent({ mission, onStartPress, onKeepPress, isKept, canStart = true, isCompletedToday = false, isAnotherMissionInProgress = false, onImageLoad }: MissionCardContentProps) {
  const { t } = useTranslation();
  const blurHeight = CARD_HEIGHT * 0.8; // Blur covers bottom 55% of card
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Generate image URL with retry support (add timestamp to bust cache on retry)
  const imageUrl = useMemo(() => {
    if (!mission.imageUrl) return null;
    const baseUrl = `${mission.imageUrl}?w=800&h=1000&fit=crop`;
    return retryCount > 0 ? `${baseUrl}&retry=${retryCount}` : baseUrl;
  }, [mission.imageUrl, retryCount]);

  // Handle image load error with retry
  const handleImageError = useCallback(() => {
    console.warn('[MissionCard] Image failed to load:', mission.imageUrl);
    if (retryCount < 2) {
      // Retry up to 2 times
      setRetryCount(prev => prev + 1);
    } else {
      setImageError(true);
    }
  }, [mission.imageUrl, retryCount]);

  const handleKeepPress = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();

    // Show message if mission is already completed today
    if (isCompletedToday) {
      Alert.alert(
        t('mission.alerts.cannotKeep'),
        t('mission.alerts.alreadyCompletedKeep'),
        [{ text: t('common.confirm') }]
      );
      return;
    }

    // Show message if already kept
    if (isKept) {
      return;
    }

    Alert.alert(
      t('mission.alerts.keepMission'),
      t('mission.alerts.keepMissionConfirm', { title: mission.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.save'),
          onPress: async () => {
            const success = await onKeepPress?.();
            if (success === false) {
              Alert.alert(
                t('mission.alerts.keepLimit'),
                t('mission.alerts.keepLimitMessage'),
                [{ text: t('common.confirm') }]
              );
            }
          },
        },
      ]
    );
  };

  const handleStartPress = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();

    // Show message if can't start
    if (!canStart && !isCompletedToday) {
      if (isAnotherMissionInProgress) {
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

    onStartPress?.();
  };

  return (
    <View style={styles.cardContentWrapper}>
      {/* Background Image with fallback */}
      {imageUrl && !imageError ? (
        <ExpoImage
          source={{ uri: imageUrl }}
          style={styles.cardImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          onLoad={onImageLoad}
          onError={handleImageError}
        />
      ) : (
        <View style={[styles.cardImage, styles.cardImageFallback]}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      )}

      {/* Blur Container with Masked Gradient */}
      <View style={[styles.blurContainer, { height: blurHeight }]}>
        <MaskedView
          maskElement={
            <LinearGradient
              locations={blurGradientLocations as [number, number, ...number[]]}
              colors={blurGradientColors as [string, string, ...string[]]}
              style={StyleSheet.absoluteFill}
            />
          }
          style={StyleSheet.absoluteFill}
        >
          <BlurView
            intensity={50}
            tint={Platform.OS === 'ios' ? 'systemChromeMaterialDark' : 'dark'}
            style={StyleSheet.absoluteFill}
          />
        </MaskedView>
        {/* Dark Gradient Overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.6)']}
          locations={[0, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        {/* Title */}
        <Text style={styles.missionTitle}>{mission.title}</Text>

        {/* Description */}
        <Text style={styles.missionDescription}>{mission.description}</Text>

        {/* Tags */}
        <View style={styles.tagsContainer}>
          {mission.tags.map((tag, index) => (
            <Text key={index} style={styles.tagText}>
              #{tag}
            </Text>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtonsRow}>
          {onKeepPress && (
            <Pressable
              style={[
                styles.keepActionButton,
                (isKept || isCompletedToday) && styles.keepActionButtonKept,
              ]}
              onPress={handleKeepPress}
            >
              <BlurView
                intensity={30}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.keepButtonContent}>
                {isKept && (
                  <Bookmark
                    color={COLORS.white}
                    size={16}
                    fill={COLORS.white}
                  />
                )}
                <Text style={styles.keepActionButtonText}>
                  {isKept ? t('mission.kept') : t('mission.keep')}
                </Text>
              </View>
            </Pressable>
          )}
          {onStartPress && (
            <Pressable
              style={[
                styles.startActionButton,
                !canStart && !isCompletedToday && styles.startActionButtonDisabled,
              ]}
              onPress={handleStartPress}
            >
              <Text style={[
                styles.startActionButtonText,
                !canStart && !isCompletedToday && styles.startActionButtonTextDisabled,
              ]}>
                {isCompletedToday ? t('mission.completed') : (isAnotherMissionInProgress ? t('mission.anotherInProgress') : t('mission.start'))}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bookmarkedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  backgroundImageStyle: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.0 }],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 64,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    zIndex: 20,
  },
  headerTitle: {
    fontSize: 32,
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: 38,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
    marginTop: 4,
  },
  historyButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 120,
  },
  carouselWrapper: {
    height: CARD_HEIGHT + 40,
  },
  cardStack: {
    width: '100%',
    maxWidth: 324,
    height: CARD_HEIGHT,
    position: 'relative',
  },
  card: {
    // width is set dynamically inline using CARD_WIDTH = screenWidth * 0.75
    height: CARD_HEIGHT,
    marginHorizontal: CARD_MARGIN,
    borderRadius: 45,
    backgroundColor: 'transparent',
  },
  cardInner: {
    flex: 1,
    borderRadius: 45,
    overflow: 'hidden',
  },
  cardInnerAd: {
    flex: 1,
    borderRadius: 45,
    // NO overflow: hidden for ad cards - causes "asset boundaries" error
    backgroundColor: '#000000',
  },
  cardPressable: {
    flex: 1,
  },
  cardContentWrapper: {
    flex: 1,
  },
  cardImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  cardImageFallback: {
    overflow: 'hidden',
  },
  blurContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  cardContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.lg,
    zIndex: 2,
  },
  missionTitle: {
    fontSize: 28,
    color: COLORS.white,
    fontWeight: '700',
    marginBottom: 12,
    lineHeight: 34,
  },
  missionDescription: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 22,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  tagText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  keepActionButton: {
    flex: 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  keepActionButtonKept: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    opacity: 0.5,
  },
  keepButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  keepActionButtonText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '600',
  },
  startActionButton: {
    flex: 1,
    height: 52,
    borderRadius: 100,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  startActionButtonText: {
    fontSize: 15,
    color: COLORS.black,
    fontWeight: '600',
  },
  startActionButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  startActionButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    width: 32,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.white,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeContainer: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 11,
    color: COLORS.white,
    fontWeight: '700',
  },
  // Empty State Styles
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  glassGenerateButton: {
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 100,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  glassGenerateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  loadingAnimationWrapper: {
    alignItems: 'center',
    gap: 20,
  },
  loadingAnimationText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
    marginTop: 8,
  },
  loadingAnimationSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '400',
  },
  // White Modal Styles
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  whiteModalContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  whiteModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  whiteModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  modalHeaderSpacer: {
    width: 40,
  },
  whiteModalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whiteQuestionSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  whiteQuestionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: SPACING.md,
  },
  whiteBinaryOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  whiteBinaryOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: SPACING.md,
    borderRadius: 100,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 8,
  },
  whiteBinaryOptionActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  whiteBinaryOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  whiteBinaryOptionTextActive: {
    color: COLORS.black,
  },
  whiteTimeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  whiteTimeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 100,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  whiteTimeOptionActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  whiteTimeOptionIcon: {
    fontSize: 14,
  },
  whiteTimeOptionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  whiteTimeOptionLabelActive: {
    color: COLORS.black,
  },
  whiteMoodOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  whiteMoodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 100,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: 6,
  },
  whiteMoodOptionActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  whiteMoodOptionIcon: {
    fontSize: 16,
  },
  whiteMoodOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  whiteMoodOptionTextActive: {
    color: COLORS.black,
  },
  whiteModalButtonContainer: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
  },
  whiteModalGenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: SPACING.lg,
    borderRadius: 16,
    backgroundColor: COLORS.black,
  },
  whiteModalGenerateButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  whiteModalGenerateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  whiteModalGenerateButtonTextDisabled: {
    color: '#999',
  },
  generatingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
