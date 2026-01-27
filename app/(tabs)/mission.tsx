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
  InteractionManager,
  type AppStateStatus,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import ReanimatedModule, {
  useSharedValue,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withSpring,
} from 'react-native-reanimated';
import { useConsistentBottomInset, useBannerAdBottom } from '@/hooks/useConsistentBottomInset';

const ReanimatedView = ReanimatedModule.View;
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

import { COLORS, SPACING, rs, fp } from '@/constants/design';
import { useMissionStore, MOOD_OPTIONS, TIME_OPTIONS, type TodayMood, type AvailableTime, type MissionGenerationAnswers } from '@/stores/missionStore';
import type { ExcludedMission } from '@/services/missionGenerator';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { useAuthStore } from '@/stores/authStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useBackground } from '@/contexts';
import { BookmarkedMissionsPage } from '@/components/BookmarkedMissionsPage';
import { CircularLoadingAnimation } from '@/components/CircularLoadingAnimation';
import NativeAdMissionCard from '@/components/ads/NativeAdMissionCard';
import { BannerAdView } from '@/components/ads';
import RefreshMissionCard from '@/components/RefreshMissionCard';
import type { Mission, FeaturedMission } from '@/types';
import { db, isDemoMode } from '@/lib/supabase';
import { rewardedAdManager } from '@/lib/rewardedAd';
import { cancelHourlyReminders, cancelMissionReminderNotification } from '@/lib/pushNotifications';
import { useNetwork } from '@/lib/useNetwork';

// Module-level flag to track returning from mission detail to bookmark view
// This allows router.back() to work while preserving bookmark state
let returningFromMissionDetailToBookmark = false;

export const setReturningFromBookmark = (value: boolean) => {
  returningFromMissionDetailToBookmark = value;
};

// Type for carousel items (Mission, Ad placeholder, or Refresh card)
type CarouselItem = Mission | { type: 'ad'; id: string } | { type: 'refresh'; id: string };

// Fixed card dimensions (width is calculated dynamically in component)
// Android uses slightly smaller height for visual balance
const CARD_HEIGHT = Platform.OS === 'android' ? rs(455) : rs(468);
const CARD_MARGIN = rs(10);

// Easing gradient for smooth blur transition
const { colors: blurGradientColors, locations: blurGradientLocations } = easeGradient({
  colorStops: {
    0: { color: 'transparent' },
    0.5: { color: 'rgba(0,0,0,0.99)' },
    1: { color: 'black' },
  },
});

// Android: Animated card wrapper for smooth PagerView transitions
interface AndroidCardWrapperProps {
  index: number;
  scrollPosition: { value: number };
  scrollOffset: { value: number };
  cardWidth: number;
  children: React.ReactNode;
}

function AndroidCardWrapper({ index, scrollPosition, scrollOffset, cardWidth, children }: AndroidCardWrapperProps) {
  // Spring config for smooth settling animation
  const springConfig = {
    damping: 50,
    stiffness: 150,
    mass: 0.5,
  };

  const animatedStyle = useAnimatedStyle(() => {
    const position = scrollPosition.value;
    const offset = scrollOffset.value;

    // Calculate the continuous position (e.g., 1.3 means 30% between page 1 and 2)
    const continuousPosition = position + offset;

    // Calculate distance from this card's index to the current continuous position
    const distance = Math.abs(continuousPosition - index);

    // Interpolate scale based on distance: closer = larger
    const targetScale = interpolate(
      distance,
      [0, 0.5, 1],
      [1, 0.975, 0.95],
      Extrapolation.CLAMP
    );

    // Only apply spring to the current/focused card (distance < 0.5)
    const isCurrentCard = distance < 0.5;
    const finalScale = isCurrentCard
      ? withSpring(targetScale, springConfig)
      : targetScale;

    return {
      transform: [{ scale: finalScale }],
    };
  });

  return (
    <ReanimatedView
      style={[
        styles.androidCard,
        { width: cardWidth },
        animatedStyle,
      ]}
    >
      {children}
    </ReanimatedView>
  );
}

export default function MissionScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { isOnline } = useNetwork();
  const insets = useConsistentBottomInset();
  const bannerAdBottom = useBannerAdBottom();
  const setTabBarHidden = useUIStore((s) => s.setTabBarHidden);
  const { showBookmark } = useLocalSearchParams<{ showBookmark?: string }>();
  const { backgroundImage } = useBackground();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showBookmarkedMissions, setShowBookmarkedMissions] = useState(false);

  // Track if navigation/interaction is complete for deferred operations
  const [isInteractionComplete, setIsInteractionComplete] = useState(false);

  // Defer heavy operations until after navigation completes
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsInteractionComplete(true);
    });
    return () => handle.cancel();
  }, []);

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
  const [dotCount, setDotCount] = useState(1); // For animated dots (1→2→3→1)
  const isWaitingForImagesRef = useRef(false);
  const firstImageLoadedRef = useRef(false);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<Animated.FlatList<CarouselItem>>(null);
  const pagerRef = useRef<PagerView>(null);
  // Android: Use reanimated shared values for smooth scroll animation
  const androidScrollPosition = useSharedValue(0);
  const androidScrollOffset = useSharedValue(0);
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
    canPremiumRefresh,
    incrementPremiumRefreshCount,
    generatedMissionData, // Subscribe to this state to trigger re-renders
    refreshUsedDate, // Subscribe to refreshUsedDate to trigger re-renders when refresh is used
    todayCompletedMission, // Subscribe to trigger re-renders when mission is completed (disables other Start buttons)
    premiumRefreshCount, // Subscribe to trigger re-renders when premium refresh count changes
    premiumRefreshDate, // Subscribe for date changes
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
    generatingUserId,
    setAdWatchingStatus,
    releaseMissionLock,
  } = useCoupleSyncStore();

  // Get user and partner info from auth store
  const { user, partner } = useAuthStore();

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

    // Add refresh card at the end
    // Premium users: show refresh card up to 5 times per day
    // Free users: only show if refresh not used today (1 refresh per day)
    const isPremiumUser = !shouldShowAds();

    if (hasGeneratedMissions && todayMissions.length > 0) {
      let showRefreshCard = false;

      if (isPremiumUser) {
        // Premium: show refresh card only if under 5 refreshes today
        showRefreshCard = canPremiumRefresh();
      } else {
        // Free: check if refresh was used today
        const now = new Date();
        const todayDateString = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        let hasUsedRefresh = false;
        if (isSyncInitialized && sharedMissionsRefreshedAt) {
          const refreshedDate = sharedMissionsRefreshedAt.split('T')[0];
          hasUsedRefresh = refreshedDate === todayDateString;
        } else {
          hasUsedRefresh = refreshUsedDate === todayDateString;
        }

        showRefreshCard = !hasUsedRefresh;
      }

      if (showRefreshCard) {
        const refreshPlaceholder: CarouselItem = { type: 'refresh', id: 'refresh-card' };
        missions = [...missions, refreshPlaceholder];
      }
    }

    return missions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayMissions, featuredMissions, hasGeneratedMissions, shouldShowAds, adPosition, refreshUsedDate, isSyncInitialized, sharedMissionsRefreshedAt, canPremiumRefresh, premiumRefreshCount, premiumRefreshDate]);

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

  // Handle image loading completion - hide loading when first image is rendered
  useEffect(() => {
    if (isWaitingForImages && loadedImagesCount >= totalImagesToLoad && totalImagesToLoad > 0) {
      // First image loaded, hide loading with minimal delay (image is already rendered)
      const timer = setTimeout(() => {
        setIsGenerating(false);
        setIsWaitingForImages(false);
        isWaitingForImagesRef.current = false;
        setLoadedImagesCount(0);
        setTotalImagesToLoad(0);
        firstImageLoadedRef.current = false;  // Reset for next generation

        // Initialize scroll after images are loaded
        setCurrentIndex(0);
        scrollX.setValue(0);
        setIsScrollInitialized(false);
        hasInitializedCarousel.current = false;

        setTimeout(() => {
          if (scrollViewRef.current) {
            scrollViewRef.current.scrollToOffset({ offset: 1, animated: false });
            setTimeout(() => {
              scrollViewRef.current?.scrollToOffset({ offset: 0, animated: false });
              setIsScrollInitialized(true);
            }, 50);
          }
        }, 100);
      }, 100);  // Reduced from 300ms since image is already visible
      return () => clearTimeout(timer);
    }
  }, [isWaitingForImages, loadedImagesCount, totalImagesToLoad, scrollX]);

  // Fallback timeout: If first image doesn't load within 5 seconds, show cards anyway
  useEffect(() => {
    if (isWaitingForImages && totalImagesToLoad > 0) {
      const fallbackTimer = setTimeout(() => {
        if (isWaitingForImagesRef.current) {
          console.warn('[Mission] Image load timeout - showing cards anyway');
          setIsGenerating(false);
          setIsWaitingForImages(false);
          isWaitingForImagesRef.current = false;
          setLoadedImagesCount(0);
          setTotalImagesToLoad(0);
          firstImageLoadedRef.current = false;

          // Reset carousel state
          setCurrentIndex(0);
          scrollX.setValue(0);
          setIsScrollInitialized(false);
          hasInitializedCarousel.current = false;

          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollToOffset({ offset: 1, animated: false });
              setTimeout(() => {
                scrollViewRef.current?.scrollToOffset({ offset: 0, animated: false });
                setIsScrollInitialized(true);
              }, 50);
            }
          }, 100);
        }
      }, 5000);  // 5 second timeout

      return () => clearTimeout(fallbackTimer);
    }
  }, [isWaitingForImages, totalImagesToLoad, scrollX]);

  // Initialize waiting state for first image render
  const initializeImageWait = useCallback(() => {
    firstImageLoadedRef.current = false;
    setLoadedImagesCount(0);
    setTotalImagesToLoad(1);  // Only wait for first image
    setIsWaitingForImages(true);
    isWaitingForImagesRef.current = true;
  }, []);

  // Callback for when a mission card image loads
  const handleMissionImageLoad = useCallback((isFirstCard: boolean) => {
    // Only track the first card's image load during waiting state
    if (isFirstCard && isWaitingForImagesRef.current && !firstImageLoadedRef.current) {
      firstImageLoadedRef.current = true;
      setLoadedImagesCount(1);
    }
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
      // Don't reset bookmark view if returning from mission detail via back navigation
      // or if showBookmark param is set (legacy support)
      if (returningFromMissionDetailToBookmark) {
        // Keep bookmark view open and clear the flag
        returningFromMissionDetailToBookmark = false;
      } else if (showBookmark !== 'true') {
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

        // Reset any stuck loading states (e.g., if app was backgrounded during ad loading)
        setIsGenerating(false);
        setIsLoadingAd(false);
        setIsWaitingForImages(false);
        isWaitingForImagesRef.current = false;
        setPartnerGeneratingMessage(null);

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

        // Reset ALL loading states to prevent stuck UI
        setIsGenerating(false);
        setIsLoadingAd(false);
        setIsWaitingForImages(false);
        isWaitingForImagesRef.current = false;
        setPartnerGeneratingMessage(null);
        setLoadedImagesCount(0);
        setTotalImagesToLoad(0);

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
    const currentUserId = user?.id;

    if (isSyncInitialized) {
      // Check if partner is generating (not self)
      const isPartnerAction = generatingUserId && generatingUserId !== currentUserId;

      if (missionGenerationStatus === 'generating' && isPartnerAction) {
        // Partner is generating - show loading state
        setIsGenerating(true);
        setPartnerGeneratingMessage(t('mission.generatingMessage'));
      } else if (missionGenerationStatus === 'ad_watching' && isPartnerAction) {
        // Partner is watching ad - show full loading UI to prevent B from starting missions
        // Use partner's nickname in the message
        const partnerNickname = partner?.nickname || t('common.partner');
        setIsGenerating(true);
        setPartnerGeneratingMessage(t('mission.partnerWatchingAdWithName', { name: partnerNickname }));
      } else if (missionGenerationStatus === 'completed' && sharedMissions.length > 0 && isPartnerAction) {
        // Only hide loading if partner was generating (not self)
        // Self-generation handles its own loading state via initializeImageWait()
        setIsGenerating(false);
        setPartnerGeneratingMessage(null);
      } else if (missionGenerationStatus === 'idle' && isPartnerAction) {
        // Partner cancelled/rolled back - hide loading
        setIsGenerating(false);
        setPartnerGeneratingMessage(null);
      }
    }
  }, [isSyncInitialized, missionGenerationStatus, sharedMissions.length, generatingUserId, user?.id, t, partner?.nickname]);

  // Animated dots for partner watching ad message (1→2→3→1 repeating)
  useEffect(() => {
    const currentUserId = user?.id;
    const isPartnerAction = generatingUserId && generatingUserId !== currentUserId;

    if (missionGenerationStatus === 'ad_watching' && isPartnerAction) {
      // Start dot animation
      const intervalId = setInterval(() => {
        setDotCount(prev => (prev % 3) + 1); // 1→2→3→1
      }, 500); // Change every 500ms

      return () => clearInterval(intervalId);
    } else {
      // Reset dot count when not in ad_watching state
      setDotCount(1);
    }
  }, [missionGenerationStatus, generatingUserId, user?.id]);

  // Automatic polling for stale lock recovery when partner is generating
  // This helps User B recover automatically when User A force-closes app during ad
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    // Only poll when partner (not self) is generating or watching ad
    if (missionGenerationStatus === 'generating' || missionGenerationStatus === 'ad_watching') {
      const currentUserId = user?.id;
      const isPartnerGenerating = generatingUserId && generatingUserId !== currentUserId;

      if (isPartnerGenerating) {
        // Dynamic poll interval: ad_watching = 60s (ads take longer), generating = 30s
        const pollInterval = missionGenerationStatus === 'ad_watching' ? 60000 : 30000;
        // Poll to check for stale locks
        intervalId = setInterval(async () => {
          console.log('[Mission] Polling for stale lock recovery (interval:', pollInterval / 1000, 's)...');

          // Get status before polling
          const statusBeforePoll = useCoupleSyncStore.getState().missionGenerationStatus;

          await loadSharedMissions(); // This function auto-releases stale locks

          // Get status after polling
          const statusAfterPoll = useCoupleSyncStore.getState().missionGenerationStatus;

          // If status changed from generating/ad_watching to idle, reset UI and carousel
          if (
            (statusBeforePoll === 'generating' || statusBeforePoll === 'ad_watching') &&
            statusAfterPoll === 'idle'
          ) {
            console.log('[Mission] Polling detected stale lock recovery, resetting UI and carousel');

            // Reset UI loading states
            setIsGenerating(false);
            setPartnerGeneratingMessage(null);

            // Reset carousel state for proper first card scale
            setIsScrollInitialized(false);
            hasInitializedCarousel.current = false;
            setCurrentIndex(0);
            scrollX.setValue(0);

            setTimeout(() => {
              if (scrollViewRef.current) {
                scrollViewRef.current.scrollToOffset({ offset: 1, animated: false });
                setTimeout(() => {
                  scrollViewRef.current?.scrollToOffset({ offset: 0, animated: false });
                  setIsScrollInitialized(true);
                }, 50);
              }
            }, 150);
          }
        }, pollInterval);
      }
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [missionGenerationStatus, generatingUserId, user?.id, loadSharedMissions, scrollX]);

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

    // Check network connectivity - mission generation requires internet (OpenAI API)
    if (!isOnline) {
      setShowGenerationModal(false);
      Alert.alert(
        t('mission.alerts.offlineTitle') || '인터넷 연결 필요',
        t('mission.alerts.offlineMessage') || '미션을 생성하려면 인터넷 연결이 필요합니다. 네트워크 연결을 확인하고 다시 시도해주세요.',
        [{ text: t('common.confirm') || '확인' }]
      );
      return;
    }

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

        // Mark refresh as used for today and increment premium refresh count
        if (newMissions.length > 0) {
          await setRefreshUsedToday();
          incrementPremiumRefreshCount(); // Increment premium user's daily refresh count
        }

        // Prefetch all mission images before showing cards
        if (newMissions.length > 0) {
          const imagesToLoad = newMissions.filter(mission => mission.imageUrl);

          try {
            // Prefetch card images (cropped version)
            const cardImagePromises = imagesToLoad.map(mission =>
              ExpoImage.prefetch(`${mission.imageUrl}?w=800&h=1000&fit=crop`)
            );
            // Prefetch detail page background images (original version)
            const detailImagePromises = imagesToLoad.map(mission =>
              ExpoImage.prefetch(mission.imageUrl)
            );

            // Wait for all images to prefetch (with timeout fallback)
            await Promise.race([
              Promise.all([...cardImagePromises, ...detailImagePromises]),
              new Promise(resolve => setTimeout(resolve, 10000)), // 10초 타임아웃
            ]);

            console.log('[Mission Refresh] Premium - Image prefetch completed (card + detail), images are cached');
          } catch (error) {
            console.log('Image prefetch error:', error);
          }

          // Wait for first card image to actually render before hiding loading
          if (newMissions[0]?.imageUrl) {
            initializeImageWait();
            // isGenerating stays true, useEffect will hide it when first image onLoad fires
          } else {
            // No image URL, hide loading immediately
            setIsGenerating(false);
          }
        } else {
          setIsGenerating(false);
        }

        setCanMeetToday(null);
        setAvailableTime(null);
        setSelectedMoods([]);
        return;
      }

      // Free user - close modal, show rewarded ad, generate missions with PENDING state
      // Only commit to DB after ad is fully watched
      // Save original missions before reset (for deduplication)
      const originalMissionsForAd = getTodayMissions();
      const excludedMissionsForAd: ExcludedMission[] = originalMissionsForAd.map(m => ({
        title: m.title,
        category: m.category,
      }));
      console.log('[Mission Refresh] Free user - ad-gated generation, excluding:', excludedMissionsForAd.map(m => m.title).join(', '));

      // 1. Set loading state FIRST (before closing modal) to prevent "오늘의 미션" button from showing
      setIsGenerating(true);
      setPartnerGeneratingMessage(null);
      setIsLoadingAd(true);

      // 2. Close modal
      setShowGenerationModal(false);
      setIsRefreshMode(false);

      // Track if ad was fully watched (onEarnedReward was called)
      let adCompletedSuccessfully = false;

      // 2. Set ad_watching status (NO mission generation yet - will generate AFTER ad completes)
      // This tells partner that user is watching ad, but doesn't create pending missions
      await setAdWatchingStatus();
      console.log('[Mission Refresh] Set ad_watching status - will generate missions after ad completes');

      // 3. Load and show rewarded ad (mission generation happens AFTER ad completes)
      const adShown = await rewardedAdManager.loadAndShow({
        onEarnedReward: (reward) => {
          // User watched complete ad - set flag for generation
          console.log('[Mission Refresh] Ad reward earned:', reward);
          adCompletedSuccessfully = true;
        },
        onAdClosed: async () => {
          setIsLoadingAd(false);

          // Check if ad was completed successfully
          if (adCompletedSuccessfully) {
            // SUCCESS: NOW generate missions (after ad completion)
            console.log('[Mission Refresh] Ad completed - NOW starting mission generation');

            try {
              // Reset local generated mission state
              resetGeneratedMissions();

              // Reset existing shared missions before generating new ones
              await resetAllMissions();

              // Generate new missions (deferSave: false - save directly to DB)
              // forceRegenerate: true to skip 'exists' check since we're refreshing
              const result = await generateTodayMissions(answers, excludedMissionsForAd, {
                deferSave: false,  // Save directly to active DB
                forceRegenerate: true
              });
              console.log('[Mission Refresh] Generation completed:', result?.status);

              // Handle different generation statuses
              if (!result) {
                setIsGenerating(false);
                await releaseMissionLock('idle');
                Alert.alert(
                  t('mission.refresh.adLoadingFailed'),
                  t('mission.refresh.adLoadingFailedMessage'),
                  [{ text: t('common.confirm') }]
                );
                return;
              }

              if (result.status === 'locked') {
                setIsGenerating(false);
                setPartnerGeneratingMessage(t('mission.refresh.partnerGenerating'));
                return;
              }

              if (result.status === 'location_required' || result.status === 'preferences_required') {
                setIsGenerating(false);
                setPartnerGeneratingMessage(null);
                await releaseMissionLock('idle');
                return;
              }

              // Get the newly generated missions
              const newMissions = getTodayMissions();

              // Mark refresh as used for today (only once per day)
              if (newMissions.length > 0) {
                await setRefreshUsedToday();
              }

              // Prefetch all mission images before showing cards
              if (newMissions.length > 0) {
                const imagesToLoad = newMissions.filter(mission => mission.imageUrl);

                try {
                  // Prefetch card images (cropped version)
                  const cardImagePromises = imagesToLoad.map(mission =>
                    ExpoImage.prefetch(`${mission.imageUrl}?w=800&h=1000&fit=crop`)
                  );
                  // Prefetch detail page background images (original version)
                  const detailImagePromises = imagesToLoad.map(mission =>
                    ExpoImage.prefetch(mission.imageUrl)
                  );

                  // Wait for all images to prefetch (with timeout fallback)
                  await Promise.race([
                    Promise.all([...cardImagePromises, ...detailImagePromises]),
                    new Promise(resolve => setTimeout(resolve, 10000)), // 10초 타임아웃
                  ]);

                  console.log('[Mission Refresh] Ad completed - Image prefetch completed (card + detail)');
                } catch (error) {
                  console.log('Image prefetch error:', error);
                }

                // Wait for first card image to actually render before hiding loading
                if (newMissions[0]?.imageUrl) {
                  initializeImageWait();
                  // isGenerating stays true, useEffect will hide it when first image onLoad fires
                  // Carousel reset will be handled by useEffect
                } else {
                  // No image URL, hide loading immediately
                  setIsGenerating(false);
                }
              } else {
                // No missions with images
                setIsGenerating(false);
              }

            } catch (error) {
              console.error('[Mission Refresh] Generation error:', error);
              setIsGenerating(false);
              await releaseMissionLock('idle');
              Alert.alert(
                t('mission.alerts.generationError') || '미션 생성 오류',
                t('mission.alerts.generationErrorMessage') || '미션을 생성하는 중 오류가 발생했습니다. 다시 시도해주세요.',
                [{ text: t('common.confirm') || '확인' }]
              );
            }

          } else {
            // Ad was not completed (user closed early) - release lock, keep existing missions
            console.log('[Mission Refresh] Ad not completed - releasing lock, keeping existing missions');
            await releaseMissionLock('idle');

            setIsGenerating(false);
            setPartnerGeneratingMessage(null);

            // Inform user that ad must be completed
            Alert.alert(
              t('mission.refresh.adNotCompleted') || '광고 시청 미완료',
              t('mission.refresh.adNotCompletedMessage') || '미션을 새로고침하려면 광고를 끝까지 시청해주세요.',
              [{ text: t('common.confirm') || '확인' }]
            );
          }

          // Reset form
          setCanMeetToday(null);
          setAvailableTime(null);
          setSelectedMoods([]);
        },
        onAdFailedToLoad: async () => {
          setIsLoadingAd(false);
          setIsGenerating(false);

          // Release lock since ad failed
          await releaseMissionLock('idle');

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

        // Release lock since ad was not shown
        await releaseMissionLock('idle');

        setIsGenerating(false);
        setPartnerGeneratingMessage(null);

        // In development (Expo Go), show info message
        if (__DEV__) {
          Alert.alert(
            '개발 모드',
            '광고는 프로덕션 빌드에서만 표시됩니다. 미션 새로고침은 광고 시청 후 사용 가능합니다.',
            [{ text: t('common.confirm') || '확인' }]
          );
        } else {
          // Production - ad failed to load
          Alert.alert(
            t('mission.refresh.adLoadingFailed'),
            t('mission.refresh.adLoadingFailedMessage'),
            [{ text: t('common.confirm') }]
          );
        }

        setCanMeetToday(null);
        setAvailableTime(null);
        setSelectedMoods([]);
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
        // Prefetch card images (cropped version)
        const cardImagePromises = imagesToLoad.map(mission =>
          ExpoImage.prefetch(`${mission.imageUrl}?w=800&h=1000&fit=crop`)
        );
        // Prefetch detail page background images (original version)
        const detailImagePromises = imagesToLoad.map(mission =>
          ExpoImage.prefetch(mission.imageUrl)
        );

        // Wait for all images to prefetch (with timeout fallback)
        await Promise.race([
          Promise.all([...cardImagePromises, ...detailImagePromises]),
          new Promise(resolve => setTimeout(resolve, 10000)), // 10초 타임아웃
        ]);

        console.log('[Mission] Image prefetch completed (card + detail), images are cached');
      } catch (error) {
        console.log('Image prefetch error:', error);
        // Continue even if prefetch fails
      }

      // Wait for first card image to actually render before hiding loading
      if (newMissions[0]?.imageUrl) {
        initializeImageWait();
        // isGenerating stays true, useEffect will hide it when first image onLoad fires
      } else {
        // No image URL, hide loading immediately
        setIsGenerating(false);
      }
    } else {
      // No missions generated, hide loading immediately
      setIsGenerating(false);
    }

    // Reset form
    setCanMeetToday(null);
    setAvailableTime(null);
    setSelectedMoods([]);
  }, [canMeetToday, availableTime, selectedMoods, isRefreshMode, isOnline, generateTodayMissions, getTodayMissions, resetGeneratedMissions, resetAllMissions, setRefreshUsedToday, incrementPremiumRefreshCount, t, scrollX, initializeImageWait]);

  const toggleMood = (mood: TodayMood) => {
    if (selectedMoods.includes(mood)) {
      setSelectedMoods(selectedMoods.filter(m => m !== mood));
    } else {
      setSelectedMoods([...selectedMoods, mood]);
    }
  };

  const isGenerationFormValid = canMeetToday !== null && availableTime !== null && selectedMoods.length > 0;

  const handleMissionPress = useCallback((missionId: string) => {
    // Use requestAnimationFrame on Android to prevent UI blocking
    if (Platform.OS === 'android') {
      requestAnimationFrame(() => {
        router.push(`/mission/${missionId}`);
      });
    } else {
      router.push(`/mission/${missionId}`);
    }
  }, [router]);

  const handleDotPress = (index: number) => {
    if (Platform.OS === 'ios') {
      scrollViewRef.current?.scrollToIndex({
        index,
        animated: true,
      });
    } else {
      pagerRef.current?.setPage(index);
    }
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
  // Check if partner is already generating before opening modal
  const handleRefreshPress = useCallback(() => {
    // Check if partner is generating (not self)
    const currentUserId = user?.id;
    const isPartnerGenerating = generatingUserId && generatingUserId !== currentUserId;

    if ((missionGenerationStatus === 'generating' || missionGenerationStatus === 'ad_watching') && isPartnerGenerating) {
      // Partner is generating - show alert and prevent opening modal
      Alert.alert(
        t('mission.refresh.partnerGenerating'),
        t('mission.refresh.partnerGeneratingMessage'),
        [{ text: t('common.confirm') }]
      );
      return;
    }

    setIsRefreshMode(true);
    setShowGenerationModal(true);
  }, [user?.id, generatingUserId, missionGenerationStatus, t]);

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
              isFirstCard={index === 0}
            />
          </View>
        </Animated.View>
      );
    },
    [scrollX, handleMissionPress, handleKeepMission, checkIsKept, canStartMission, isTodayCompletedMission, lockedMissionId, isScrollInitialized, isAnotherMissionInProgress, handleMissionImageLoad, handleRefreshPress, SNAP_INTERVAL, CARD_WIDTH]
  );

  return (
    <View style={styles.container}>
      {/* Background Image */}
      <View style={styles.backgroundImage}>
        <ExpoImage
          source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
          placeholder="L6PZfSi_.AyE_3t7t7R**0LTIpIp"
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          priority="high"
          style={styles.backgroundImageStyle}
        />
        <BlurView experimentalBlurMethod="dimezisBlurView" intensity={Platform.OS === 'ios' ? 90 : 50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={StyleSheet.absoluteFill} />
      </View>
      <View style={[styles.overlay, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.15)' }]} />

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
          <Bookmark color={COLORS.white} size={rs(20)} strokeWidth={2} />
          {bookmarkCount > 0 && (
            <View style={styles.badgeContainer}>
              <Text style={styles.badgeText}>{bookmarkCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Card Carousel or Empty State */}
      <View style={styles.cardContainer}>
        {/* Show carousel only when missions exist AND images are loaded (not generating/waiting) */}
        {hasGeneratedMissions && !isGenerating && !isWaitingForImages ? (
          <View style={styles.carouselWrapper}>
            {/* iOS: Original Animated.FlatList (don't modify) */}
            {Platform.OS === 'ios' ? (
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
                extraData={[hasGeneratedMissions, allMissions.map(m => m.id).join(','), lockedMissionId, todayCompletedMission, allMissionProgress]}
                initialNumToRender={3}
                maxToRenderPerBatch={3}
                windowSize={5}
                removeClippedSubviews={false}
              />
            ) : (
              /* Android: PagerView for smooth native scrolling */
              <View style={styles.androidPagerContainer}>
                <PagerView
                  ref={pagerRef}
                  style={styles.androidPagerView}
                  initialPage={0}
                  onPageSelected={(e) => setCurrentIndex(e.nativeEvent.position)}
                  onPageScroll={(e) => {
                    // Update shared values for smooth reanimated transitions
                    androidScrollPosition.value = e.nativeEvent.position;
                    androidScrollOffset.value = e.nativeEvent.offset;
                  }}
                  pageMargin={CARD_MARGIN}
                  offscreenPageLimit={2}
                  overdrag={true}
                >
                  {allMissions.map((item, index) => (
                    <View key={item.id} style={styles.androidPageWrapper} collapsable={false}>
                      <AndroidCardWrapper
                        index={index}
                        scrollPosition={androidScrollPosition}
                        scrollOffset={androidScrollOffset}
                        cardWidth={CARD_WIDTH}
                      >
                        {isAdItem(item) ? (
                          <View style={styles.cardInnerAd}>
                            <NativeAdMissionCard />
                          </View>
                        ) : isRefreshItem(item) ? (
                          <RefreshMissionCard onRefreshPress={handleRefreshPress} />
                        ) : (
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
                              isFirstCard={index === 0}
                            />
                          </View>
                        )}
                      </AndroidCardWrapper>
                    </View>
                  ))}
                </PagerView>
              </View>
            )}

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
            {isGenerating || isLoadingAd || isWaitingForImages ? (
              <View style={styles.loadingAnimationWrapper}>
                {/* Partner watching ad - show ONLY text with animated dots (NO circular animation) */}
                {missionGenerationStatus === 'ad_watching' && partnerGeneratingMessage ? (
                  <Text style={styles.partnerWatchingAdText}>
                    {partnerGeneratingMessage}{'.'.repeat(dotCount)}
                  </Text>
                ) : (
                  <>
                    {/* Normal loading - show circular animation + text */}
                    <CircularLoadingAnimation size={rs(100)} strokeWidth={rs(6)} color={COLORS.white} />
                    <Text style={styles.loadingAnimationText}>
                      {isLoadingAd ? t('mission.refresh.loadingAd') : (partnerGeneratingMessage ? t('mission.generating') : t('mission.generatingMessage'))}
                    </Text>
                    <Text style={styles.loadingAnimationSubtext}>
                      {t('mission.pleaseWait')}
                    </Text>
                  </>
                )}
              </View>
            ) : (
              <Pressable
                style={styles.glassGenerateButton}
                onPress={handleGenerateButtonPress}
              >
                <BlurView
                  experimentalBlurMethod="dimezisBlurView"
                  intensity={Platform.OS === 'ios' ? 30 : 40}
                  tint={Platform.OS === 'ios' ? 'dark' : 'default'}
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
          <View style={[
            styles.whiteModalContainer,
            Platform.OS === 'android' && { paddingBottom: rs(40) + insets.bottom }
          ]}>
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
                <X color={COLORS.black} size={rs(24)} />
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

      {/* Banner Ad - Fixed at bottom (Android only) */}
      {Platform.OS === 'android' && (
        <BannerAdView placement="home" style={[styles.bannerAd, { bottom: bannerAdBottom }]} />
      )}
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
  onImageLoad?: (isFirstCard: boolean) => void;
  isFirstCard?: boolean;
}

function MissionCardContent({ mission, onStartPress, onKeepPress, isKept, canStart = true, isCompletedToday = false, isAnotherMissionInProgress = false, onImageLoad, isFirstCard = false }: MissionCardContentProps) {
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
          onLoad={() => onImageLoad?.(isFirstCard)}
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
        {Platform.OS === 'ios' ? (
          /* iOS: MaskedView + BlurView for premium blur effect */
          <>
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
                experimentalBlurMethod="dimezisBlurView"
                intensity={50}
                tint="systemChromeMaterialDark"
                style={StyleSheet.absoluteFill}
              />
            </MaskedView>
            {/* Dark Gradient Overlay */}
            <LinearGradient
              colors={['transparent', 'rgba(0, 0, 0, 0.6)']}
              locations={[0, 1]}
              style={StyleSheet.absoluteFill}
            />
          </>
        ) : (
          /* Android: Simple LinearGradient for better performance */
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.85)']}
            locations={[0, 0.5]}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>

      {/* Content */}
      <View style={styles.cardContent}>
        {/* Title */}
        <Text style={styles.missionTitle} textBreakStrategy="simple" lineBreakStrategyIOS="hangul-word">{mission.title}</Text>

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
              android_ripple={{ color: 'rgba(255, 255, 255, 0.2)', borderless: false }}
            >
              <BlurView
                experimentalBlurMethod="dimezisBlurView"
                intensity={30}
                tint="dark"
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.keepButtonContent}>
                {isKept && (
                  <Bookmark
                    color={COLORS.white}
                    size={rs(16)}
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
              android_ripple={{ color: 'rgba(255, 255, 255, 0.3)', borderless: false }}
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
  // Android PagerView styles
  androidPagerContainer: {
    flex: 1,
    overflow: 'visible',
  },
  androidPagerView: {
    flex: 1,
  },
  androidPageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  androidCard: {
    height: CARD_HEIGHT,
    borderRadius: rs(45),
    overflow: 'hidden',
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: rs(64),
    paddingHorizontal: rs(SPACING.lg),
    paddingBottom: rs(SPACING.lg),
    zIndex: 20,
  },
  headerTitle: {
    fontSize: fp(32),
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: fp(38),
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  headerSubtitle: {
    fontSize: fp(14),
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
    marginTop: rs(4),
  },
  historyButton: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: Platform.OS === 'android' ? rs(160) : rs(120),
  },
  carouselWrapper: {
    height: CARD_HEIGHT + rs(40),
  },
  cardStack: {
    width: '100%',
    maxWidth: rs(324),
    height: CARD_HEIGHT,
    position: 'relative',
  },
  card: {
    // width is set dynamically inline using CARD_WIDTH = screenWidth * 0.75
    height: CARD_HEIGHT,
    marginHorizontal: CARD_MARGIN,
    borderRadius: rs(45),
    backgroundColor: 'transparent',
  },
  cardInner: {
    flex: 1,
    borderRadius: rs(45),
    overflow: 'hidden',
  },
  cardInnerAd: {
    flex: 1,
    borderRadius: rs(45),
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
    padding: rs(SPACING.lg),
    zIndex: 2,
  },
  missionTitle: {
    fontSize: fp(28),
    color: COLORS.white,
    fontWeight: '700',
    marginBottom: rs(12),
    lineHeight: fp(34),
  },
  missionDescription: {
    fontSize: fp(15),
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: fp(22),
    marginBottom: rs(12),
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rs(8),
    marginBottom: rs(12),
  },
  tagText: {
    fontSize: fp(14),
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: rs(10),
  },
  keepActionButton: {
    flex: 1,
    height: rs(52),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rs(100),
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
    gap: rs(8),
  },
  keepActionButtonText: {
    fontSize: fp(14),
    color: COLORS.white,
    fontWeight: '600',
  },
  startActionButton: {
    flex: 1,
    height: rs(52),
    borderRadius: rs(100),
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: rs(4) },
    shadowOpacity: 0.2,
    shadowRadius: rs(8),
    elevation: 4,
  },
  startActionButtonText: {
    fontSize: Platform.OS === 'android' ? fp(12) : fp(15),
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
    gap: rs(8),
    marginTop: rs(16),
  },
  dot: {
    width: rs(12),
    height: rs(12),
    borderRadius: rs(6),
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    width: rs(32),
    height: rs(12),
    borderRadius: rs(6),
    backgroundColor: COLORS.white,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: rs(4),
    elevation: 2,
  },
  badgeContainer: {
    position: 'absolute',
    top: rs(-4),
    right: rs(-4),
    minWidth: rs(18),
    height: rs(18),
    borderRadius: rs(9),
    backgroundColor: '#FF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(5),
  },
  badgeText: {
    fontSize: fp(11),
    color: COLORS.white,
    fontWeight: '700',
  },
  // Empty State Styles
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rs(SPACING.xl),
  },
  glassGenerateButton: {
    paddingVertical: Platform.OS === 'android' ? rs(14) : rs(18),
    paddingHorizontal: Platform.OS === 'android' ? rs(38) : rs(48),
    borderRadius: rs(100),
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'android' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  glassGenerateButtonText: {
    fontSize: fp(16),
    fontWeight: '600',
    color: COLORS.white,
  },
  loadingAnimationWrapper: {
    alignItems: 'center',
    gap: rs(20),
  },
  loadingAnimationText: {
    fontSize: fp(18),
    fontWeight: '600',
    color: COLORS.white,
    marginTop: rs(8),
  },
  loadingAnimationSubtext: {
    fontSize: fp(14),
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '400',
  },
  partnerWatchingAdText: {
    fontSize: fp(18),
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
    lineHeight: fp(26),
  },
  // White Modal Styles
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  whiteModalContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: rs(24),
    borderTopRightRadius: rs(24),
    paddingBottom: rs(40),
  },
  whiteModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(SPACING.lg),
    paddingVertical: rs(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  whiteModalTitle: {
    fontSize: fp(18),
    fontWeight: '600',
    color: COLORS.black,
  },
  modalHeaderSpacer: {
    width: rs(40),
  },
  whiteModalCloseButton: {
    width: rs(40),
    height: rs(40),
    borderRadius: rs(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  whiteQuestionSection: {
    paddingHorizontal: rs(SPACING.lg),
    marginTop: rs(SPACING.xl),
  },
  whiteQuestionLabel: {
    fontSize: fp(16),
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: rs(SPACING.md),
  },
  whiteBinaryOptions: {
    flexDirection: 'row',
    gap: rs(12),
  },
  whiteBinaryOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs(16),
    paddingHorizontal: rs(SPACING.md),
    borderRadius: rs(100),
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: rs(8),
  },
  whiteBinaryOptionActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  whiteBinaryOptionText: {
    fontSize: fp(15),
    fontWeight: '500',
    color: '#666',
  },
  whiteBinaryOptionTextActive: {
    color: COLORS.black,
  },
  whiteTimeOptions: {
    flexDirection: 'row',
    gap: rs(8),
  },
  whiteTimeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs(16),
    borderRadius: rs(100),
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  whiteTimeOptionActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  whiteTimeOptionIcon: {
    fontSize: fp(14),
  },
  whiteTimeOptionLabel: {
    fontSize: fp(13),
    fontWeight: '500',
    color: '#666',
  },
  whiteTimeOptionLabelActive: {
    color: COLORS.black,
  },
  whiteMoodOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rs(10),
    justifyContent: 'center',
  },
  whiteMoodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs(14),
    paddingHorizontal: rs(16),
    borderRadius: rs(100),
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    gap: rs(6),
  },
  whiteMoodOptionActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  whiteMoodOptionIcon: {
    fontSize: fp(16),
  },
  whiteMoodOptionText: {
    fontSize: fp(14),
    fontWeight: '500',
    color: '#666',
  },
  whiteMoodOptionTextActive: {
    color: COLORS.black,
  },
  whiteModalButtonContainer: {
    paddingHorizontal: rs(SPACING.lg),
    marginTop: rs(SPACING.xl),
  },
  whiteModalGenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: rs(18),
    paddingHorizontal: rs(SPACING.lg),
    borderRadius: rs(16),
    backgroundColor: COLORS.black,
  },
  whiteModalGenerateButtonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  whiteModalGenerateButtonText: {
    fontSize: fp(16),
    fontWeight: '600',
    color: COLORS.white,
  },
  whiteModalGenerateButtonTextDisabled: {
    color: '#999',
  },
  generatingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
  },
  bannerAd: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});