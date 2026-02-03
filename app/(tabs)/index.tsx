import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  TouchableWithoutFeedback,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  StatusBar,
  InteractionManager,
  ActivityIndicator,
  PixelRatio,
  Share,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import Svg, { Rect, Circle, Defs, Mask } from 'react-native-svg';
import { X, Edit2, Trash2, ChevronLeft, ChevronRight, Users, Heart, Send, Image as ImageIcon, Calendar } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { useTranslation } from 'react-i18next';
import { captureScreen, captureRef } from 'react-native-view-shot';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import NetInfo from '@react-native-community/netinfo';
import KoreanLunarCalendar from 'korean-lunar-calendar';

import { COLORS, SPACING, RADIUS, rs, fp, SCREEN_WIDTH, SCREEN_HEIGHT, rw, rh, isCompactHeight } from '@/constants/design';
import { useBackground } from '@/contexts';
import { useOnboardingStore, useAuthStore, useTimezoneStore } from '@/stores';
import { BannerAdView } from '@/components/ads';
import { useBannerAdBottom, usePremiumContentPadding } from '@/hooks/useConsistentBottomInset';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { db } from '@/lib/supabase';
import { anniversaryService } from '@/services/anniversaryService';

// Pre-load static images (outside component to avoid re-creation)
const LOGO_IMAGE = require('@/assets/images/daydate-logo.png');
const DEFAULT_BACKGROUND_IMAGE = require('@/assets/images/backgroundimage.png');

// Preload images at module level
Asset.fromModule(LOGO_IMAGE).downloadAsync();
Asset.fromModule(DEFAULT_BACKGROUND_IMAGE).downloadAsync();

// Responsive Polaroid sizing
// Base: iPhone 16 (393px width) with 280px polaroid = 71.2% ratio
const POLAROID_BASE_WIDTH = 280;

// Detect Android screen types by aspect ratio
// Galaxy S24: 1080x2340 = aspect ratio 2.17 (needs reduced content)
// Z Flip: 1080x2640 = aspect ratio 2.44 (needs original larger content)
const SCREEN_ASPECT_RATIO = SCREEN_HEIGHT / SCREEN_WIDTH;

// Galaxy S24 type: aspect ratio 2.0 ~ 2.3 (tall but not ultra-tall)
const isGalaxyS24Type = Platform.OS === 'android' && SCREEN_ASPECT_RATIO > 2.0 && SCREEN_ASPECT_RATIO <= 2.3;
// Z Flip type: aspect ratio > 2.3 (ultra-tall foldable screens)
const isZFlipType = Platform.OS === 'android' && SCREEN_ASPECT_RATIO > 2.3;
// Legacy alias for backward compatibility
const isTallAndroidScreen = isGalaxyS24Type;

// Calculate responsive polaroid width and scale factor
// For compact screens (height < 700), use smaller ratio
// Galaxy S24 type (2.0-2.3 ratio): 0.62 ratio for better fit
// Z Flip type (>2.3 ratio): 0.72 ratio (original size works better)
// Android normal screens: 0.72 ratio
// iOS: 0.712 ratio (iPhone 16 baseline)
const POLAROID_WIDTH_RATIO = isCompactHeight()
  ? 0.55
  : Platform.OS === 'android'
    ? (isGalaxyS24Type ? 0.62 : 0.72)  // Z Flip uses 0.72 (same as normal)
    : 0.712;

// Calculate polaroid width with min/max constraints for extreme screen sizes
// Min: 200px (very small phones)
// Max: 280px for Galaxy S24 type, 320px for others (including Z Flip)
const rawPolaroidWidth = Math.round(SCREEN_WIDTH * POLAROID_WIDTH_RATIO);
const POLAROID_MAX_WIDTH = isGalaxyS24Type ? 280 : 320;
const POLAROID_WIDTH = Math.min(POLAROID_MAX_WIDTH, Math.max(200, rawPolaroidWidth));
const POLAROID_SCALE = POLAROID_WIDTH / POLAROID_BASE_WIDTH;

// Helper to scale polaroid-related values proportionally
const polaroidScale = (size: number): number => {
  return Math.round(size * POLAROID_SCALE);
};

// Lunar to Solar date conversion utility
const lunarToSolar = (lunarYear: number, lunarMonth: number, lunarDay: number): Date => {
  const calendar = new KoreanLunarCalendar();
  calendar.setLunarDate(lunarYear, lunarMonth, lunarDay, false);
  const solarDate = calendar.getSolarCalendar();
  return new Date(solarDate.year, solarDate.month - 1, solarDate.day);
};

// Parse date as local date (not UTC) to avoid timezone issues
// Handles both Date objects and ISO date strings
const parseDateAsLocal = (date: Date | string): Date => {
  if (date instanceof Date) {
    // If it's already a Date, extract components and create new local date
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  // If it's an ISO timestamp (contains T), parse as Date first to get correct local time
  // e.g., "1990-01-02T15:00:00.000Z" represents Jan 3 00:00 in KST (UTC+9)
  if (date.includes('T')) {
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // If it's a simple date string like "1990-01-03", parse as local
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Get next birthday date (handling lunar if needed)
const getNextBirthdayDate = (birthDate: Date, isLunar: boolean, today: Date): Date => {
  const thisYear = today.getFullYear();

  if (isLunar) {
    // For lunar birthday, convert this year's lunar date to solar
    const birthMonth = birthDate.getMonth() + 1;
    const birthDay = birthDate.getDate();

    // Get this year's solar equivalent of the lunar birthday
    let solarBirthday = lunarToSolar(thisYear, birthMonth, birthDay);

    // If already passed, get next year's
    if (solarBirthday < today) {
      solarBirthday = lunarToSolar(thisYear + 1, birthMonth, birthDay);
    }
    return solarBirthday;
  } else {
    // For solar birthday, simple calculation
    const birthdayThisYear = new Date(thisYear, birthDate.getMonth(), birthDate.getDate());
    if (birthdayThisYear < today) {
      return new Date(thisYear + 1, birthDate.getMonth(), birthDate.getDate());
    }
    return birthdayThisYear;
  }
};

// Use responsive screen dimensions from design
const width = SCREEN_WIDTH;
const height = SCREEN_HEIGHT;
const screenHeight = SCREEN_HEIGHT;

// Anniversary type definition (local display type, extends service type)
interface Anniversary {
  id: string | number; // string for custom (DB/local), number for default system anniversaries
  label: string;
  targetDate: Date;
  icon: string;
  bgColor: string;
  gradientColors: readonly [string, string];
  isYearly?: boolean; // Whether this anniversary repeats yearly
  isCustom?: boolean; // true for user-created anniversaries
}

// Swipeable Anniversary Card Component
interface SwipeableCardProps {
  anniversary: Anniversary & { date: string; dDay: string };
  onEdit: () => void;
  onDelete: () => void;
  isCustom: boolean;
  t: (key: string) => string;
}

function SwipeableAnniversaryCard({ anniversary, onEdit, onDelete, isCustom, t }: SwipeableCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const [isOpen, setIsOpen] = useState(false);

  const closeSwipe = () => {
    swipeableRef.current?.close();
  };

  const handleSwipeOpen = () => {
    setIsOpen(true);
  };

  const handleSwipeClose = () => {
    setIsOpen(false);
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    _dragX: Animated.AnimatedInterpolation<number>
  ) => {
    if (!isCustom) return null;

    // Animate opacity based on progress (0 = closed, 1 = fully open)
    const animOpacity = progress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0, 1],
      extrapolate: 'clamp',
    });

    // Animate scale for a nice pop effect
    const animScale = progress.interpolate({
      inputRange: [0, 0.8, 1],
      outputRange: [0.5, 0.8, 1],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[swipeStyles.actionsContainer, { opacity: animOpacity, transform: [{ scale: animScale }] }]}>
        <Pressable
          style={swipeStyles.editButton}
          onPress={() => {
            closeSwipe();
            onEdit();
          }}
        >
          <Edit2 color="#000000" size={rs(20)} />
          <Text style={swipeStyles.editActionText}>{t('common.edit')}</Text>
        </Pressable>
        <Pressable
          style={swipeStyles.deleteButton}
          onPress={() => {
            closeSwipe();
            onDelete();
          }}
        >
          <Trash2 color="#FFFFFF" size={rs(20)} />
          <Text style={swipeStyles.actionText}>{t('common.delete')}</Text>
        </Pressable>
      </Animated.View>
    );
  };

  // Calculate dynamic font size for long labels (EN, ES tend to be longer)
  const getLabelFontSize = (label: string) => {
    const length = label.length;
    if (length > 25) return fp(12);
    if (length > 20) return fp(13);
    if (length > 15) return fp(14);
    return fp(15);
  };

  const labelFontSize = getLabelFontSize(anniversary.label);

  const cardContent = (
    <View style={[swipeStyles.card, { backgroundColor: anniversary.bgColor }]}>
      <View style={swipeStyles.cardContent}>
        <View style={swipeStyles.cardLeft}>
          <Text style={swipeStyles.icon}>{anniversary.icon}</Text>
          <View style={swipeStyles.labelContainer}>
            <Text style={[swipeStyles.label, { fontSize: labelFontSize }]} numberOfLines={1}>
              {anniversary.label}
            </Text>
            <Text style={swipeStyles.date}>{anniversary.date}</Text>
          </View>
        </View>
        <LinearGradient
          colors={anniversary.gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={swipeStyles.badge}
        >
          <Text style={swipeStyles.dDay}>{anniversary.dDay}</Text>
        </LinearGradient>
      </View>
    </View>
  );

  // Non-custom anniversaries don't need swipe
  if (!isCustom) {
    return <View style={swipeStyles.container}>{cardContent}</View>;
  }

  return (
    <View style={swipeStyles.container}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={60}
        overshootRight={false}
        friction={1.5}
        onSwipeableOpen={handleSwipeOpen}
        onSwipeableClose={handleSwipeClose}
        containerStyle={swipeStyles.swipeableContainer}
      >
        {cardContent}
      </Swipeable>
    </View>
  );
}

const swipeStyles = StyleSheet.create({
  container: {
    marginBottom: rs(8),
    borderRadius: rs(20),
    overflow: 'hidden',
  },
  swipeableContainer: {
    borderRadius: rs(20),
    overflow: 'hidden',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: rs(12),
    gap: rs(8),
  },
  editButton: {
    width: rs(50),
    height: rs(50),
    backgroundColor: '#FFFFFF',
    borderRadius: rs(25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  editActionText: {
    color: '#000000',
    fontSize: fp(10),
    fontWeight: '600',
    marginTop: rs(2),
  },
  deleteButton: {
    width: rs(50),
    height: rs(50),
    backgroundColor: '#EF4444',
    borderRadius: rs(25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: fp(10),
    fontWeight: '600',
    marginTop: rs(2),
  },
  card: {
    borderRadius: rs(20),
    paddingVertical: rs(12),
    paddingHorizontal: rs(16),
    width: '100%',
    minHeight: rs(70),
    justifyContent: 'center',
  },
  cardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    flex: 1,
    marginRight: rs(8),
  },
  labelContainer: {
    flex: 1,
  },
  icon: {
    fontSize: fp(28),
  },
  label: {
    fontSize: fp(15),
    fontWeight: '600',
    color: '#FFFFFF',
  },
  date: {
    fontSize: fp(12),
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: rs(2),
  },
  badge: {
    paddingHorizontal: rs(14),
    paddingVertical: rs(8),
    borderRadius: rs(20),
  },
  dDay: {
    fontSize: fp(14),
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const { backgroundImage, setBackgroundImage, resetToDefault } = useBackground();
  const { data: onboardingData } = useOnboardingStore();
  const { user, partner, couple, setPartner, setCouple } = useAuthStore();
  const { getEffectiveTimezone } = useTimezoneStore();
  const { coupleId, heartLikedBy, updateHeartLiked } = useCoupleSyncStore();
  const bannerAdBottom = useBannerAdBottom();
  const premiumContentPadding = usePremiumContentPadding();

  // Determine nicknames - always show "나 ❤️ 파트너" from current user's perspective
  const isCurrentUserCoupleUser1 = user?.id === couple?.user1Id;
  const myNickname = user?.nickname || onboardingData.nickname || t('common.me');
  const partnerNickname = partner?.nickname || t('common.partner');

  // For couple-order display (used in birthday labels etc.)
  const user1Nickname = isCurrentUserCoupleUser1 ? myNickname : partnerNickname;
  const user2Nickname = isCurrentUserCoupleUser1 ? partnerNickname : myNickname;

  const [showAnniversaryModal, setShowAnniversaryModal] = useState(false);
  const [anniversaryModalStep, setAnniversaryModalStep] = useState<'list' | 'add' | 'addDatePicker' | 'edit' | 'editDatePicker'>('list');
  const [showImagePickerModal, setShowImagePickerModal] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [isSavingShare, setIsSavingShare] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [newAnniversaryIcon, setNewAnniversaryIcon] = useState('💝');
  const [newAnniversaryName, setNewAnniversaryName] = useState('');
  const [newAnniversaryDate, setNewAnniversaryDate] = useState(new Date());

  // Custom anniversaries added by user (yearly repeating) - loaded from DB/local storage
  const [customAnniversaries, setCustomAnniversaries] = useState<Anniversary[]>([]);
  const [isLoadingAnniversaries, setIsLoadingAnniversaries] = useState(true);

  // Heart like state (synced with partner via coupleSyncStore)
  const isHeartLiked = !!heartLikedBy; // Heart is liked if any user has liked it
  const heartScale = useRef(new Animated.Value(1)).current;

  const handleHeartPress = useCallback(() => {
    // Toggle heart liked state and sync with partner
    updateHeartLiked(!isHeartLiked);

    // Instagram-style bounce animation (spring, fast)
    Animated.sequence([
      Animated.timing(heartScale, {
        toValue: 0.8,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 1.15,
        friction: 5,
        tension: 400,
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        friction: 6,
        tension: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [heartScale, isHeartLiked, updateHeartLiked]);

  // Handle share button press - capture from top line to bottom line with Daydate branding
  const handleSharePress = useCallback(async () => {
    // Prevent double execution
    if (isSavingShare) return;
    setIsSavingShare(true);

    try {
      // Measure top line and bottom line positions
      if (!topLineRef.current || !bottomLineRef.current) {
        setIsSavingShare(false);
        return;
      }

      const topMeasurement = await new Promise<{ x: number; y: number; width: number; height: number }>((resolve) => {
        topLineRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
          resolve({ x, y, width, height });
        });
      });

      const bottomMeasurement = await new Promise<{ x: number; y: number; width: number; height: number }>((resolve) => {
        bottomLineRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => {
          resolve({ x, y, width, height });
        });
      });

      // Calculate responsive padding based on content height, not screen height
      // This ensures consistent visual appearance across all device sizes
      const contentHeight = (bottomMeasurement.y + bottomMeasurement.height) - topMeasurement.y;

      // Padding = 10% of content height, with min 30px and max 50px
      const basePadding = Math.round(contentHeight * 0.10);
      const topPadding = Math.min(50, Math.max(30, basePadding));

      // Bottom padding should be limited to avoid capturing ad area
      // Safe zone: at least 120px from bottom of screen (tab bar + ad height)
      const safeBottomY = SCREEN_HEIGHT - 120;
      const bottomLineY = bottomMeasurement.y + bottomMeasurement.height;
      const maxBottomPadding = Math.max(20, safeBottomY - bottomLineY - 10);
      const bottomPadding = Math.min(topPadding, maxBottomPadding);

      const pixelScale = PixelRatio.get();

      // Capture the full screen
      const fullScreenUri = await captureScreen({
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      // Calculate crop area from top line to bottom line (full screen width, convert points to pixels)
      // Add offset to move capture area down slightly (matching content position adjustment)
      // Android needs more offset to move capture area further down
      const captureOffsetY = Platform.OS === 'android' ? rh(50) : rh(15); // Responsive offset to shift capture down
      const cropX = 0;
      const cropY = Math.max(0, Math.round((topMeasurement.y - topPadding + captureOffsetY) * pixelScale));
      const cropWidth = Math.round(SCREEN_WIDTH * pixelScale);
      const cropHeight = Math.round((contentHeight + topPadding + bottomPadding) * pixelScale);

      const croppedImage = await ImageManipulator.manipulateAsync(
        fullScreenUri,
        [{ crop: { originX: cropX, originY: cropY, width: cropWidth, height: cropHeight } }],
        { format: ImageManipulator.SaveFormat.PNG, compress: 1 }
      );

      // Step 2: Set the captured content to state to render the branded container
      const contentWidth = cropWidth / pixelScale;
      const contentHeightPts = cropHeight / pixelScale;

      // Create a promise that resolves when the branded image loads
      const imageLoadPromise = new Promise<void>((resolve) => {
        brandedImageLoadedRef.current = resolve;
      });

      setCapturedContentUri(croppedImage.uri);
      setCapturedContentSize({ width: contentWidth, height: contentHeightPts });

      // Wait for the branded container image to load (with 3 second timeout)
      await Promise.race([
        imageLoadPromise,
        new Promise<void>(resolve => setTimeout(resolve, 3000)),
      ]);

      // Additional small delay to ensure render is complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Step 3: Capture the branded container
      if (!brandedContainerRef.current) {
        // Fallback to original image if branding container not available
        throw new Error('Branded container not ready');
      }

      const brandedImage = await captureRef(brandedContainerRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      // Clear the state after capture
      setCapturedContentUri(null);
      setCapturedContentSize(null);

      if (Platform.OS === 'ios') {
        // iOS: Share directly using file URI
        await Share.share({
          url: brandedImage,
        });
      } else {
        // Android: Use expo-sharing to show native share sheet (dynamic import to avoid iOS crash)
        try {
          const Sharing = await import('expo-sharing');
          const isAvailable = await Sharing.isAvailableAsync();
          if (isAvailable) {
            await Sharing.shareAsync(brandedImage, {
              mimeType: 'image/png',
              dialogTitle: t('home.share.dialogTitle'),
            });
          } else {
            throw new Error('Sharing not available');
          }
        } catch {
          // Fallback: Save to gallery if sharing is not available
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert(t('common.error'), t('home.share.permissionDenied'));
            return;
          }
          await MediaLibrary.createAssetAsync(brandedImage);
          Alert.alert(
            t('home.share.savedTitle'),
            t('home.share.savedAndShareFromGallery')
          );
        }
      }
    } catch (error) {
      console.error('Error sharing:', error);
      // Clear state on error
      setCapturedContentUri(null);
      setCapturedContentSize(null);
      Alert.alert(t('common.error'), t('home.shareError'));
    } finally {
      setIsSavingShare(false);
    }
  }, [t, isSavingShare]);

  // Track if navigation/interaction is complete for deferred rendering
  const [isInteractionComplete, setIsInteractionComplete] = useState(false);

  // Defer heavy operations until after navigation completes
  // This prevents the black screen flash on Android
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsInteractionComplete(true);
    });
    return () => handle.cancel();
  }, []);

  // Fetch latest partner and couple data on mount for real-time sync
  // Only run after interaction is complete to avoid blocking navigation
  useEffect(() => {
    if (!isInteractionComplete) return;

    const fetchLatestData = async () => {
      if (!couple?.id || !user?.id) return;

      try {
        // Fetch latest couple data
        const { data: coupleData } = await db.couples.get(couple.id);
        if (coupleData) {
          const currentCouple = useAuthStore.getState().couple;
          if (currentCouple) {
            setCouple({
              ...currentCouple,
              anniversaryDate: coupleData.dating_start_date ? parseDateAsLocal(coupleData.dating_start_date) : undefined,
              datingStartDate: coupleData.dating_start_date ? parseDateAsLocal(coupleData.dating_start_date) : undefined,
              weddingDate: coupleData.wedding_date ? parseDateAsLocal(coupleData.wedding_date) : undefined,
              relationshipType: coupleData.wedding_date ? 'married' : 'dating',
            });
          }
        }

        // Fetch latest partner data
        const partnerId = couple.user1Id === user.id ? couple.user2Id : couple.user1Id;
        if (partnerId) {
          const { data: partnerData } = await db.profiles.get(partnerId);
          if (partnerData) {
            const prefs = partnerData.preferences as Record<string, unknown> || {};
            const birthDateCalendarType = prefs.birthDateCalendarType as 'solar' | 'lunar' | undefined;
            setPartner({
              id: partnerData.id,
              email: partnerData.email || '',
              nickname: partnerData.nickname || '',
              inviteCode: partnerData.invite_code || '',
              preferences: prefs as unknown as import('@/types').UserPreferences,
              birthDate: partnerData.birth_date ? parseDateAsLocal(partnerData.birth_date) : undefined,
              birthDateCalendarType: birthDateCalendarType || 'solar',
              createdAt: partnerData.created_at ? new Date(partnerData.created_at) : new Date(),
            });
          }
        }
      } catch (error) {
        console.error('[HomeScreen] Error fetching latest data:', error);
      }
    };

    fetchLatestData();
  }, [couple?.id, user?.id, couple?.user1Id, couple?.user2Id, setCouple, setPartner]);

  // Load custom anniversaries from service on mount
  // Only run after interaction is complete to avoid blocking navigation
  useEffect(() => {
    if (!isInteractionComplete) return;

    const loadAnniversaries = async () => {
      if (!coupleId) {
        setIsLoadingAnniversaries(false);
        return;
      }

      try {
        const loaded = await anniversaryService.load(coupleId);
        // Convert service anniversaries to local format
        const converted: Anniversary[] = loaded.map((a) => ({
          id: a.id,
          label: a.label,
          targetDate: a.targetDate,
          icon: a.icon,
          bgColor: a.bgColor,
          gradientColors: a.gradientColors,
          isYearly: a.isYearly,
          isCustom: true,
        }));
        setCustomAnniversaries(converted);
      } catch (error) {
        console.error('[HomeScreen] Failed to load anniversaries:', error);
      } finally {
        setIsLoadingAnniversaries(false);
      }
    };

    loadAnniversaries();

    // Subscribe to real-time updates
    const unsubscribe = coupleId
      ? anniversaryService.subscribe(coupleId, (anniversaries) => {
        const converted: Anniversary[] = anniversaries.map((a) => ({
          id: a.id,
          label: a.label,
          targetDate: a.targetDate,
          icon: a.icon,
          bgColor: a.bgColor,
          gradientColors: a.gradientColors,
          isYearly: a.isYearly,
          isCustom: true,
        }));
        setCustomAnniversaries(converted);
      })
      : null;

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [coupleId, isInteractionComplete]);

  // Sync pending changes when coming online
  // Only run after interaction is complete to avoid blocking navigation
  useEffect(() => {
    if (!isInteractionComplete) return;

    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (state.isConnected && coupleId) {
        const { synced, failed } = await anniversaryService.syncPending(coupleId);
        if (synced > 0) {
          console.log(`[HomeScreen] Synced ${synced} anniversaries, ${failed} failed`);
          // Reload to get updated IDs from DB
          const loaded = await anniversaryService.load(coupleId);
          const converted: Anniversary[] = loaded.map((a) => ({
            id: a.id,
            label: a.label,
            targetDate: a.targetDate,
            icon: a.icon,
            bgColor: a.bgColor,
            gradientColors: a.gradientColors,
            isYearly: a.isYearly,
            isCustom: true,
          }));
          setCustomAnniversaries(converted);
        }
      }
    });

    return () => unsubscribe();
  }, [coupleId, isInteractionComplete]);

  // Tutorial overlay state
  const [showTutorial, setShowTutorial] = useState(false);
  const [buttonPosition, setButtonPosition] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const imageButtonRef = useRef<View>(null);
  const topLineRef = useRef<View>(null);
  const bottomLineRef = useRef<View>(null);

  // Branding container for share capture (hidden off-screen)
  const brandedContainerRef = useRef<View>(null);
  const [capturedContentUri, setCapturedContentUri] = useState<string | null>(null);
  const [capturedContentSize, setCapturedContentSize] = useState<{ width: number; height: number } | null>(null);
  const brandedImageLoadedRef = useRef<(() => void) | null>(null);

  // TextInput refs for emoji picker behavior
  const nameInputRef = useRef<TextInput>(null);
  const editNameInputRef = useRef<TextInput>(null);


  // Measure the image change button position for tutorial overlay
  const measureButton = useCallback(() => {
    if (imageButtonRef.current) {
      imageButtonRef.current.measureInWindow((x, y, buttonWidth, buttonHeight) => {
        // On Android, Modal renders from screen top, but measureInWindow measures from content area
        // Add status bar height to correct the y position
        const statusBarOffset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;
        setButtonPosition({ x, y: y + statusBarOffset, width: buttonWidth, height: buttonHeight });
      });
    }
  }, []);

  // Edit anniversary states
  const [editingAnniversary, setEditingAnniversary] = useState<Anniversary | null>(null);
  const [editAnniversaryIcon, setEditAnniversaryIcon] = useState('💝');
  const [editAnniversaryName, setEditAnniversaryName] = useState('');
  const [editAnniversaryDate, setEditAnniversaryDate] = useState(new Date());
  const [showEditEmojiPicker, setShowEditEmojiPicker] = useState(false);

  // Emoji options for anniversary icons
  const emojiOptions = ['💝', '❤️', '💕', '💗', '🤍', '🎉', '🎂', '🎄', '✨', '🌹', '💐', '💍', '👶', '💋'];

  // Date picker calendar states
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [editPickerMonth, setEditPickerMonth] = useState(new Date());

  // Helper function to generate days array for picker calendar
  const getPickerDaysArray = (month: Date): (number | null)[] => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstDay = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  // Helper function to check if a day is selected
  const isPickerDateSelected = (day: number, selectedDate: Date, month: Date): boolean => {
    return (
      selectedDate.getDate() === day &&
      selectedDate.getMonth() === month.getMonth() &&
      selectedDate.getFullYear() === month.getFullYear()
    );
  };

  // Check for tutorial flag (only shows when user completes onboarding)
  useEffect(() => {
    const checkTutorialFlag = async () => {
      try {
        const shouldShow = await AsyncStorage.getItem('shouldShowHomeTutorial');
        if (shouldShow === 'true') {
          // Measure button position first, then show tutorial
          setTimeout(() => {
            measureButton();
            setTimeout(() => {
              setShowTutorial(true);
            }, 100);
          }, 500);
        }
      } catch {
        // If error, don't show tutorial
      }
    };
    checkTutorialFlag();
  }, [measureButton]);

  // Close tutorial and remove flag from AsyncStorage
  const closeTutorial = async () => {
    setShowTutorial(false);
    try {
      await AsyncStorage.removeItem('shouldShowHomeTutorial');
    } catch {
      // Ignore storage errors
    }
  };

  // Anniversary modal animation (scale + opacity like album modal, iOS only)
  const anniversaryModalOpacity = useRef(new Animated.Value(Platform.OS === 'android' ? 1 : 0)).current;
  const anniversaryModalScale = useRef(new Animated.Value(Platform.OS === 'android' ? 1 : 0.9)).current;

  const openAnniversaryModal = () => {
    // Android: Skip animation
    if (Platform.OS === 'android') {
      anniversaryModalOpacity.setValue(1);
      anniversaryModalScale.setValue(1);
      setShowAnniversaryModal(true);
      return;
    }
    anniversaryModalOpacity.setValue(0);
    anniversaryModalScale.setValue(0.9);
    setShowAnniversaryModal(true);
    Animated.parallel([
      Animated.spring(anniversaryModalScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }),
      Animated.timing(anniversaryModalOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeAnniversaryModal = () => {
    // Android: Close immediately
    if (Platform.OS === 'android') {
      setShowAnniversaryModal(false);
      return;
    }
    Animated.parallel([
      Animated.timing(anniversaryModalScale, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(anniversaryModalOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowAnniversaryModal(false);
    });
  };

  // Step transition functions for anniversary modal
  const goToAddStep = () => {
    // Reset form states
    setNewAnniversaryIcon('💝');
    setNewAnniversaryName('');
    setNewAnniversaryDate(new Date());
    setShowEmojiPicker(false);
    setAnniversaryModalStep('add');
  };

  const goToListStep = () => {
    setShowEmojiPicker(false);
    setShowEditEmojiPicker(false);
    setAnniversaryModalStep('list');
  };

  const goToAddDatePickerStep = () => {
    setPickerMonth(new Date(newAnniversaryDate.getFullYear(), newAnniversaryDate.getMonth(), 1));
    setAnniversaryModalStep('addDatePicker');
  };

  const goToAddFromDatePicker = (selectedDate?: Date) => {
    if (selectedDate) {
      setNewAnniversaryDate(selectedDate);
    }
    setAnniversaryModalStep('add');
  };

  const goToEditStep = (anniversary: Anniversary) => {
    setEditingAnniversary(anniversary);
    setEditAnniversaryIcon(anniversary.icon);
    setEditAnniversaryName(anniversary.label);
    setEditAnniversaryDate(anniversary.targetDate);
    setShowEditEmojiPicker(false);
    setAnniversaryModalStep('edit');
  };

  const goToEditDatePickerStep = () => {
    setEditPickerMonth(new Date(editAnniversaryDate.getFullYear(), editAnniversaryDate.getMonth(), 1));
    setAnniversaryModalStep('editDatePicker');
  };

  const goToEditFromDatePicker = (selectedDate?: Date) => {
    if (selectedDate) {
      setEditAnniversaryDate(selectedDate);
    }
    setAnniversaryModalStep('edit');
  };

  // Calculate D-day using couple's datingStartDate (synced from DB)
  // When a new couple is formed and anniversary date is not yet set, show "-" instead of old data
  // This ensures user A doesn't see the old partner's day count when pairing with new person B
  const anniversaryDate = couple?.datingStartDate
    ? new Date(couple.datingStartDate)
    : null;

  // Get today's date in the selected timezone
  const getTodayInSelectedTimezone = useMemo(() => {
    const timezone = getEffectiveTimezone();
    const now = new Date();
    try {
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      };
      const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(now);
      const year = parseInt(parts.find(p => p.type === 'year')?.value || '0');
      const month = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1;
      const day = parseInt(parts.find(p => p.type === 'day')?.value || '1');
      return new Date(year, month, day);
    } catch (e) {
      // Fallback to local date
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
  }, [getEffectiveTimezone]);

  const today = getTodayInSelectedTimezone;
  const diffDays = anniversaryDate
    ? Math.floor((today.getTime() - anniversaryDate.getTime()) / (1000 * 60 * 60 * 24)) + 1 // +1 to count from day 1
    : null;

  // Detect text language and return appropriate font
  const getFontByText = useCallback((text: string) => {
    if (!text) return 'LoraSemiBold';

    // Check for Korean characters
    if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) {
      return 'Jua';
    }
    // Check for Japanese characters (Hiragana, Katakana)
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
      return 'MochiyPopOne';
    }
    // Check for Chinese characters (CJK Unified Ideographs, but not already matched as Japanese/Korean)
    if (/[\u4E00-\u9FFF]/.test(text)) {
      return 'ChironGoRoundTC';
    }
    // Default to Lora for English/Spanish/other Latin scripts
    return 'LoraSemiBold';
  }, []);

  // Get font for D-Day text based on app language
  const getDDayFont = useMemo(() => {
    const lang = i18n.language;
    switch (lang) {
      case 'en':
      case 'es':
        return { primary: 'LoraBold', secondary: 'LoraSemiBold' };
      case 'ja':
        return { primary: 'MochiyPopOne', secondary: 'MochiyPopOne' };
      case 'zh-TW':
        return { primary: 'ChironGoRoundTC', secondary: 'ChironGoRoundTC' };
      case 'ko':
      default:
        return { primary: 'Jua', secondary: 'Jua' };
    }
  }, [i18n.language]);

  // Helper function to calculate D-day (compare dates without time)
  const calculateDDay = (targetDate: Date) => {
    // Normalize to start of day to avoid time zone issues
    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diff = Math.round((target.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0) return `D-${diff}`;
    if (diff < 0) return `D+${Math.abs(diff)}`;
    return 'D-Day';
  };

  // Helper function to format date based on locale
  const formatDateLocalized = (date: Date) => {
    if (i18n.language === 'ko') {
      return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
    }
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Helper function to get next occurrence of a yearly anniversary
  const getNextYearlyDate = (originalDate: Date) => {
    const thisYear = today.getFullYear();
    const anniversaryThisYear = new Date(thisYear, originalDate.getMonth(), originalDate.getDate());

    // Normalize today to start of day for comparison
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    // If this year's anniversary has passed (not including today), return next year's date
    if (anniversaryThisYear.getTime() < todayStart.getTime()) {
      return new Date(thisYear + 1, originalDate.getMonth(), originalDate.getDate());
    }
    return anniversaryThisYear;
  };

  // Generate dynamic anniversaries based on relationship type
  const generateDefaultAnniversaries = (): Anniversary[] => {
    const baseAnniversaries: Anniversary[] = [];
    // Use couple.relationshipType from DB, fallback to onboardingData for local-only data
    const isMarried = couple?.relationshipType === 'married' ||
      (!couple?.relationshipType && onboardingData.relationshipType === 'married') ||
      !!couple?.weddingDate;
    let idCounter = 1;

    if (isMarried) {
      // For married couples: use wedding date for anniversary calculation
      const weddingDate = couple?.weddingDate
        ? new Date(couple.weddingDate)
        : anniversaryDate; // Fallback to anniversary date (can be null)

      // Only show the nearest upcoming wedding anniversary if we have a valid date
      if (weddingDate) {
        for (let year = 1; year <= 50; year++) {
          const yearlyDate = new Date(weddingDate);
          yearlyDate.setFullYear(weddingDate.getFullYear() + year);
          if (yearlyDate > today) {
            const weddingLabel = i18n.language === 'ko'
              ? `${t('home.anniversary.weddingAnniversary')} ${year}주년`
              : `${year}${year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th'} ${t('home.anniversary.weddingAnniversary')}`;
            baseAnniversaries.push({
              id: idCounter++,
              label: weddingLabel,
              targetDate: yearlyDate,
              icon: year === 1 ? '💍' : '💖',
              bgColor: 'rgba(168, 85, 247, 0.25)',
              gradientColors: ['#A855F7', '#EC4899'] as const,
              isYearly: true,
            });
            break; // Only add the nearest upcoming anniversary
          }
        }
      }
    } else if (anniversaryDate) {
      // For dating: 100-day intervals up to 1000, then 500-day intervals
      // Only calculate when anniversaryDate is set (not null)
      // Calculate days passed since anniversary
      const daysPassed = Math.floor((today.getTime() - anniversaryDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;

      let nextMilestone: number;

      if (daysPassed < 1000) {
        // 100-day intervals: 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000
        nextMilestone = Math.ceil(daysPassed / 100) * 100;
        if (nextMilestone === 0) nextMilestone = 100;
      } else {
        // 500-day intervals: 1000, 1500, 2000, 2500, 3000, ...
        if (daysPassed < 1500) {
          nextMilestone = 1500;
        } else {
          nextMilestone = Math.ceil(daysPassed / 500) * 500;
        }
      }

      // Only add the next milestone
      const milestoneDate = new Date(anniversaryDate.getTime() + (nextMilestone - 1) * 24 * 60 * 60 * 1000);
      if (milestoneDate > today) {
        const milestoneLabel = i18n.language === 'ko'
          ? `${nextMilestone}일`
          : `${nextMilestone} ${t('common.days')}`;
        baseAnniversaries.push({
          id: idCounter++,
          label: milestoneLabel,
          targetDate: milestoneDate,
          icon: nextMilestone >= 1000 ? '🎉' : '✨',
          bgColor: nextMilestone >= 1000 ? 'rgba(236, 72, 153, 0.25)' : 'rgba(251, 191, 36, 0.25)',
          gradientColors: nextMilestone >= 1000 ? ['#A855F7', '#EC4899'] as const : ['#FBBF24', '#F59E0B'] as const,
        });
      }

      // Add yearly dating anniversary (연애 n주년)
      for (let year = 1; year <= 50; year++) {
        const yearlyDate = new Date(anniversaryDate);
        yearlyDate.setFullYear(anniversaryDate.getFullYear() + year);
        if (yearlyDate > today) {
          const datingLabel = (() => {
            switch (i18n.language) {
              case 'ko':
                return `${t('home.anniversary.datingAnniversary')} ${year}주년`;
              case 'ja':
                return `${t('home.anniversary.datingAnniversary')} ${year}周年`;
              case 'zh-TW':
                return `${t('home.anniversary.datingAnniversary')} ${year}週年`;
              case 'es':
                return `${year}º Aniversario`;
              default: // 'en' and others
                return `${year}${year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th'} Anniversary`;
            }
          })();
          baseAnniversaries.push({
            id: idCounter++,
            label: datingLabel,
            targetDate: yearlyDate,
            icon: year === 1 ? '💕' : '💖',
            bgColor: 'rgba(236, 72, 153, 0.25)',
            gradientColors: ['#EC4899', '#F43F5E'] as const,
            isYearly: true,
          });
          break; // Only add the nearest upcoming anniversary
        }
      }
    }
    // When anniversaryDate is null (new pairing, anniversary not yet set), skip milestone calculations

    // Add birthday if birthDate exists (current user)
    if (onboardingData.birthDate) {
      const birthDate = parseDateAsLocal(onboardingData.birthDate);
      const isLunar = onboardingData.birthDateCalendarType === 'lunar';
      const nextBirthday = getNextBirthdayDate(birthDate, isLunar, today);

      baseAnniversaries.push({
        id: idCounter++,
        label: `${t('home.anniversary.birthdayWithName', { name: myNickname })}${isLunar ? ` ${t('home.anniversary.lunar')}` : ''}`,
        targetDate: nextBirthday,
        icon: '🎂',
        bgColor: 'rgba(251, 191, 36, 0.25)',
        gradientColors: ['#FBBF24', '#F59E0B'] as const,
        isYearly: true,
      });
    }

    // Add partner's birthday if exists
    if (partner?.birthDate) {
      const partnerBirthDate = parseDateAsLocal(partner.birthDate);
      // Use partner's birthDateCalendarType (default to solar if not set)
      const isPartnerLunar = partner.birthDateCalendarType === 'lunar';
      const nextPartnerBirthday = getNextBirthdayDate(partnerBirthDate, isPartnerLunar, today);

      baseAnniversaries.push({
        id: idCounter++,
        label: `${t('home.anniversary.birthdayWithName', { name: partnerNickname })}${isPartnerLunar ? ` ${t('home.anniversary.lunar')}` : ''}`,
        targetDate: nextPartnerBirthday,
        icon: '🎂',
        bgColor: 'rgba(251, 191, 36, 0.25)',
        gradientColors: ['#F59E0B', '#FBBF24'] as const,
        isYearly: true,
      });
    }

    // Add common yearly holidays
    baseAnniversaries.push(
      {
        id: idCounter++,
        label: t('home.anniversary.christmas'),
        targetDate: new Date(today.getFullYear(), 11, 25),
        icon: '🎄',
        bgColor: 'rgba(239, 68, 68, 0.25)',
        gradientColors: ['#EF4444', '#22C55E'] as const,
        isYearly: true,
      },
      {
        id: idCounter++,
        label: t('home.anniversary.valentinesDay'),
        targetDate: new Date(today.getFullYear(), 1, 14),
        icon: '💝',
        bgColor: 'rgba(236, 72, 153, 0.25)',
        gradientColors: ['#EC4899', '#F43F5E'] as const,
        isYearly: true,
      },
      {
        id: idCounter++,
        label: t('home.anniversary.whiteDay'),
        targetDate: new Date(today.getFullYear(), 2, 14),
        icon: '🤍',
        bgColor: 'rgba(59, 130, 246, 0.25)',
        gradientColors: ['#3B82F6', '#06B6D4'] as const,
        isYearly: true,
      }
    );

    return baseAnniversaries;
  };

  const defaultAnniversaries = generateDefaultAnniversaries();

  // Combine default and custom anniversaries (custom ones already have isCustom: true)
  const allAnniversaries = [
    ...defaultAnniversaries.map(a => ({ ...a, isCustom: false })),
    ...customAnniversaries,
  ];

  // Process anniversaries: apply yearly logic and filter/sort
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const anniversaries = allAnniversaries
    .map((ann) => {
      // For yearly anniversaries, calculate the next occurrence
      const effectiveDate = ann.isYearly ? getNextYearlyDate(ann.targetDate) : ann.targetDate;
      return {
        ...ann,
        targetDate: effectiveDate,
        date: formatDateLocalized(effectiveDate),
        dDay: calculateDDay(effectiveDate),
      };
    })
    .filter((ann) => {
      // Include today and future dates (normalize to compare dates only)
      const annDate = new Date(ann.targetDate.getFullYear(), ann.targetDate.getMonth(), ann.targetDate.getDate());
      return annDate.getTime() >= todayStart.getTime();
    })
    .sort((a, b) => {
      // Check if either is D-Day (today)
      const aIsToday = a.dDay === 'D-Day';
      const bIsToday = b.dDay === 'D-Day';

      // D-Day items come first
      if (aIsToday && !bIsToday) return -1;
      if (!aIsToday && bIsToday) return 1;

      // Otherwise sort by date (closest first)
      return a.targetDate.getTime() - b.targetDate.getTime();
    });

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8, // Reduced from 1.0 for faster upload (still good quality)
    });

    if (!result.canceled && result.assets[0]) {
      const localUri = result.assets[0].uri;

      // Close modal and show local image IMMEDIATELY (no await)
      setShowImagePickerModal(false);
      setBackgroundImage({ uri: localUri }, true); // Fire-and-forget for instant display

      // Upload to Supabase Storage in background (non-blocking)
      if (coupleId) {
        setIsUploadingBackground(true);
        // Don't await - let upload happen in background
        db.storage.uploadBackground(coupleId, localUri)
          .then((uploadedUrl) => {
            if (uploadedUrl) {
              // Update with remote URL for syncing (silent update)
              setBackgroundImage({ uri: uploadedUrl }, false);
            } else {
              Alert.alert(t('home.background.uploadFailed'), t('home.background.uploadFailedMessage'));
            }
          })
          .catch((error) => {
            console.error('Background upload error:', error);
            Alert.alert(t('home.background.uploadFailed'), t('home.background.uploadError'));
          })
          .finally(() => {
            setIsUploadingBackground(false);
          });
      }
    }
  };

  const handleResetBackground = () => {
    resetToDefault();
    setShowImagePickerModal(false);
  };

  // Color options for new anniversaries (purple, red, blue)
  const colorOptions: { bgColor: string; gradientColors: readonly [string, string] }[] = [
    { bgColor: 'rgba(168, 85, 247, 0.25)', gradientColors: ['#A855F7', '#EC4899'] as const }, // Purple
    { bgColor: 'rgba(239, 68, 68, 0.25)', gradientColors: ['#EF4444', '#F97316'] as const },   // Red
    { bgColor: 'rgba(59, 130, 246, 0.25)', gradientColors: ['#3B82F6', '#06B6D4'] as const },  // Blue
  ];

  // Handle add anniversary form submission
  const handleAddAnniversary = async () => {
    if (newAnniversaryName.trim() && coupleId) {
      // Randomly select color from purple, red, blue
      const randomColor = colorOptions[Math.floor(Math.random() * colorOptions.length)];

      // Create new anniversary with yearly repeat via service
      const newAnniversary = await anniversaryService.create(coupleId, {
        label: newAnniversaryName.trim(),
        targetDate: newAnniversaryDate,
        icon: newAnniversaryIcon,
        bgColor: randomColor.bgColor,
        gradientColors: randomColor.gradientColors,
        isYearly: true,
      });

      if (newAnniversary) {
        // Add to local state
        setCustomAnniversaries((prev) => [...prev, {
          id: newAnniversary.id,
          label: newAnniversary.label,
          targetDate: newAnniversary.targetDate,
          icon: newAnniversary.icon,
          bgColor: newAnniversary.bgColor,
          gradientColors: newAnniversary.gradientColors,
          isYearly: newAnniversary.isYearly,
          isCustom: true,
        }]);
      }

      // Reset form and go back to list
      setNewAnniversaryIcon('💝');
      setNewAnniversaryName('');
      setNewAnniversaryDate(new Date());
      goToListStep();
    }
  };

  // Handle edit anniversary - now uses step transition
  const handleEditAnniversary = (anniversary: Anniversary) => {
    goToEditStep(anniversary);
  };

  // Handle save edited anniversary
  const handleSaveEditAnniversary = async () => {
    if (editingAnniversary && editAnniversaryName.trim() && coupleId) {
      const updatedAnniversary: Anniversary = {
        ...editingAnniversary,
        label: editAnniversaryName.trim(),
        icon: editAnniversaryIcon,
        targetDate: editAnniversaryDate,
      };

      // Update via service (only for custom anniversaries with string IDs)
      if (typeof editingAnniversary.id === 'string') {
        await anniversaryService.update(coupleId, {
          id: editingAnniversary.id,
          label: updatedAnniversary.label,
          targetDate: updatedAnniversary.targetDate,
          icon: updatedAnniversary.icon,
          bgColor: updatedAnniversary.bgColor,
          gradientColors: updatedAnniversary.gradientColors,
          isYearly: updatedAnniversary.isYearly,
        });
      }

      // Update local state
      setCustomAnniversaries((prev) =>
        prev.map((ann) =>
          ann.id === editingAnniversary.id ? updatedAnniversary : ann
        )
      );

      setEditingAnniversary(null);
      goToListStep();
    }
  };

  // Handle delete anniversary
  const handleDeleteAnniversary = (anniversary: Anniversary) => {
    Alert.alert(
      t('home.anniversary.delete'),
      t('home.anniversary.deleteConfirm', { name: anniversary.label }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            // Delete via service (only for custom anniversaries with string IDs)
            if (typeof anniversary.id === 'string' && coupleId) {
              await anniversaryService.delete(coupleId, anniversary.id);
            }

            // Update local state
            setCustomAnniversaries((prev) =>
              prev.filter((ann) => ann.id !== anniversary.id)
            );
          },
        },
      ]
    );
  };

  // Format date for display in date picker
  const formatDisplayDate = (date: Date) => {
    if (i18n.language === 'ko') {
      return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
    }
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Render Anniversary Modal Content - extracted for Platform conditional
  const renderAnniversaryModalContent = () => (
    <>
      <TouchableWithoutFeedback onPress={() => {
        if (anniversaryModalStep === 'list') {
          closeAnniversaryModal();
        }
      }}>
        <View style={styles.modalBackdrop} />
      </TouchableWithoutFeedback>

      {/* Step: List */}
      {anniversaryModalStep === 'list' && (
        <View style={styles.anniversaryModalContent}>
          <View style={styles.anniversaryModalHeader}>
            <Text style={styles.anniversaryModalTitle}>{t('home.anniversary.title')}</Text>
            <Pressable
              onPress={closeAnniversaryModal}
              style={styles.modalCloseButton}
            >
              <X color="rgba(255,255,255,0.8)" size={rs(20)} />
            </Pressable>
          </View>
          <View style={styles.anniversaryHeaderDivider} />
          <ScrollView
            style={styles.anniversaryListContainer}
            contentContainerStyle={styles.anniversaryListContent}
            showsVerticalScrollIndicator={false}
            bounces={true}
          >
            {anniversaries.map((anniversary) => (
              <SwipeableAnniversaryCard
                key={String(anniversary.id)}
                anniversary={anniversary}
                isCustom={anniversary.isCustom === true}
                onEdit={() => handleEditAnniversary(anniversary)}
                onDelete={() => handleDeleteAnniversary(anniversary)}
                t={t}
              />
            ))}
          </ScrollView>
          <View style={styles.anniversaryFooterDivider} />
          <View style={styles.anniversaryFooter}>
            <Pressable
              style={styles.addAnniversaryButton}
              onPress={goToAddStep}
            >
              <Text style={styles.addAnniversaryText}>{t('home.anniversary.add')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Step: Add */}
      {anniversaryModalStep === 'add' && (
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.keyboardAvoidingView}
        >
          <View style={styles.addAnniversaryModalContent}>
            <View style={styles.addAnniversaryHeader}>
              <Text style={styles.addAnniversaryTitle}>{t('home.anniversary.add')}</Text>
              <Pressable
                onPress={goToListStep}
                style={styles.modalCloseButton}
              >
                <X color="rgba(255,255,255,0.8)" size={rs(20)} />
              </Pressable>
            </View>
            <View style={styles.anniversaryHeaderDivider} />

            <ScrollView
              style={styles.addAnniversaryForm}
              contentContainerStyle={styles.addAnniversaryFormContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={styles.formSection}
                onPress={() => showEmojiPicker && setShowEmojiPicker(false)}
              >
                <Text style={styles.formLabel}>{t('home.anniversary.name')}</Text>
                <View style={styles.iconNameRow}>
                  <Pressable
                    style={styles.iconButton}
                    onPress={() => setShowEmojiPicker(!showEmojiPicker)}
                  >
                    <Text style={styles.selectedIconSmall}>{newAnniversaryIcon}</Text>
                  </Pressable>
                  {showEmojiPicker ? (
                    <Pressable
                      style={styles.nameInput}
                      onPress={() => setShowEmojiPicker(false)}
                    >
                      <Text style={[
                        { color: newAnniversaryName ? COLORS.white : 'rgba(255,255,255,0.4)', fontSize: fp(15) }
                      ]}>
                        {newAnniversaryName || t('home.anniversary.namePlaceholder')}
                      </Text>
                    </Pressable>
                  ) : (
                    <TextInput
                      ref={nameInputRef}
                      style={styles.nameInput}
                      placeholder={t('home.anniversary.namePlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={newAnniversaryName}
                      onChangeText={setNewAnniversaryName}
                    />
                  )}
                </View>

                {showEmojiPicker && (
                  <View style={styles.emojiPickerContainer}>
                    <View style={styles.emojiGrid}>
                      {emojiOptions.map((emoji, index) => (
                        <Pressable
                          key={index}
                          style={[
                            styles.emojiOption,
                            newAnniversaryIcon === emoji && styles.emojiOptionSelected,
                          ]}
                          onPress={() => {
                            setNewAnniversaryIcon(emoji);
                            setShowEmojiPicker(false);
                          }}
                        >
                          <Text style={styles.emojiOptionText}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </Pressable>

              <Pressable style={styles.formSection} onPress={() => setShowEmojiPicker(false)}>
                <Text style={styles.formLabel}>{t('home.anniversary.date')}</Text>
                <Pressable
                  style={styles.datePickerButton}
                  onPress={() => {
                    setShowEmojiPicker(false);
                    goToAddDatePickerStep();
                  }}
                >
                  <Text style={styles.datePickerButtonText}>
                    {formatDisplayDate(newAnniversaryDate)}
                  </Text>
                </Pressable>
              </Pressable>
            </ScrollView>

            <View style={styles.anniversaryFooterDivider} />
            <View style={styles.addAnniversaryFooter}>
              <Pressable
                style={[
                  styles.submitButton,
                  !newAnniversaryName.trim() && styles.submitButtonDisabled,
                ]}
                onPress={handleAddAnniversary}
                disabled={!newAnniversaryName.trim()}
              >
                <View style={styles.submitButtonInner}>
                  <Text style={styles.submitButtonText}>{t('common.done')}</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Step: Add Date Picker */}
      {anniversaryModalStep === 'addDatePicker' && (
        <View style={styles.datePickerModalContent}>
          <View style={styles.datePickerModalHeader}>
            <Text style={styles.datePickerModalTitle}>{t('home.anniversary.selectDate') || '날짜 선택'}</Text>
            <Pressable
              onPress={() => goToAddFromDatePicker()}
              style={styles.modalCloseButton}
            >
              <X color="rgba(255,255,255,0.8)" size={rs(20)} />
            </Pressable>
          </View>
          <View style={styles.anniversaryHeaderDivider} />

          <View style={styles.datePickerModalBody}>
            <View style={styles.pickerMonthNav}>
              <Pressable
                onPress={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}
                style={styles.pickerNavButton}
              >
                <ChevronLeft color={COLORS.white} size={rs(18)} />
              </Pressable>
              <Text style={styles.pickerMonthText}>
                {i18n.language === 'ko'
                  ? `${pickerMonth.getFullYear()}년 ${pickerMonth.getMonth() + 1}월`
                  : pickerMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
              </Text>
              <Pressable
                onPress={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))}
                style={styles.pickerNavButton}
              >
                <ChevronRight color={COLORS.white} size={rs(18)} />
              </Pressable>
            </View>

            <View style={styles.pickerDayNames}>
              {(t('calendar.dayNames', { returnObjects: true }) as string[]).map((day: string, idx: number) => (
                <Text
                  key={day}
                  style={[
                    styles.pickerDayName,
                    idx === 0 && { color: '#ef4444' },
                  ]}
                >
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.pickerGrid}>
              {getPickerDaysArray(pickerMonth).map((day, index) => {
                if (day === null) {
                  return <View key={`empty-${index}`} style={styles.pickerDayCell} />;
                }

                const isSelected = isPickerDateSelected(day, newAnniversaryDate, pickerMonth);
                const dayOfWeek = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), day).getDay();
                const isSunday = dayOfWeek === 0;

                return (
                  <Pressable
                    key={day}
                    style={styles.pickerDayCell}
                    onPress={() => {
                      const selectedDate = new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), day);
                      goToAddFromDatePicker(selectedDate);
                    }}
                  >
                    {isSelected ? (
                      <View style={styles.pickerDayCellInnerSelected}>
                        <Text style={styles.pickerDayTextSelected}>{day}</Text>
                      </View>
                    ) : (
                      <View style={styles.pickerDayCellInner}>
                        <Text style={[styles.pickerDayText, isSunday && { color: '#ef4444' }]}>
                          {day}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Step: Edit */}
      {anniversaryModalStep === 'edit' && (
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.keyboardAvoidingView}
        >
          <View style={styles.addAnniversaryModalContent}>
            <View style={styles.addAnniversaryHeader}>
              <Text style={styles.addAnniversaryTitle}>{t('home.anniversary.edit')}</Text>
              <Pressable
                onPress={() => {
                  setEditingAnniversary(null);
                  goToListStep();
                }}
                style={styles.modalCloseButton}
              >
                <X color="rgba(255,255,255,0.8)" size={rs(20)} />
              </Pressable>
            </View>
            <View style={styles.anniversaryHeaderDivider} />

            <ScrollView
              style={styles.addAnniversaryForm}
              contentContainerStyle={styles.addAnniversaryFormContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                style={styles.formSection}
                onPress={() => showEditEmojiPicker && setShowEditEmojiPicker(false)}
              >
                <Text style={styles.formLabel}>{t('home.anniversary.name')}</Text>
                <View style={styles.iconNameRow}>
                  <Pressable
                    style={styles.iconButton}
                    onPress={() => setShowEditEmojiPicker(!showEditEmojiPicker)}
                  >
                    <Text style={styles.selectedIconSmall}>{editAnniversaryIcon}</Text>
                  </Pressable>
                  {showEditEmojiPicker ? (
                    <Pressable
                      style={styles.nameInput}
                      onPress={() => setShowEditEmojiPicker(false)}
                    >
                      <Text style={[
                        { color: editAnniversaryName ? COLORS.white : 'rgba(255,255,255,0.4)', fontSize: fp(15) }
                      ]}>
                        {editAnniversaryName || t('home.anniversary.namePlaceholder')}
                      </Text>
                    </Pressable>
                  ) : (
                    <TextInput
                      ref={editNameInputRef}
                      style={styles.nameInput}
                      placeholder={t('home.anniversary.namePlaceholder')}
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={editAnniversaryName}
                      onChangeText={setEditAnniversaryName}
                    />
                  )}
                </View>

                {showEditEmojiPicker && (
                  <View style={styles.emojiPickerContainer}>
                    <View style={styles.emojiGrid}>
                      {emojiOptions.map((emoji, index) => (
                        <Pressable
                          key={index}
                          style={[
                            styles.emojiOption,
                            editAnniversaryIcon === emoji && styles.emojiOptionSelected,
                          ]}
                          onPress={() => {
                            setEditAnniversaryIcon(emoji);
                            setShowEditEmojiPicker(false);
                          }}
                        >
                          <Text style={styles.emojiOptionText}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                )}
              </Pressable>

              <Pressable style={styles.formSection} onPress={() => setShowEditEmojiPicker(false)}>
                <Text style={styles.formLabel}>{t('home.anniversary.date')}</Text>
                <Pressable
                  style={styles.datePickerButton}
                  onPress={() => {
                    setShowEditEmojiPicker(false);
                    goToEditDatePickerStep();
                  }}
                >
                  <Text style={styles.datePickerButtonText}>
                    {formatDisplayDate(editAnniversaryDate)}
                  </Text>
                </Pressable>
              </Pressable>
            </ScrollView>

            <View style={styles.anniversaryFooterDivider} />
            <View style={styles.addAnniversaryFooter}>
              <Pressable
                style={[
                  styles.submitButton,
                  !editAnniversaryName.trim() && styles.submitButtonDisabled,
                ]}
                onPress={handleSaveEditAnniversary}
                disabled={!editAnniversaryName.trim()}
              >
                <View style={styles.submitButtonInner}>
                  <Text style={styles.submitButtonText}>{t('common.confirm')}</Text>
                </View>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Step: Edit Date Picker */}
      {anniversaryModalStep === 'editDatePicker' && (
        <View style={styles.datePickerModalContent}>
          <View style={styles.datePickerModalHeader}>
            <Text style={styles.datePickerModalTitle}>{t('home.anniversary.selectDate') || '날짜 선택'}</Text>
            <Pressable
              onPress={() => goToEditFromDatePicker()}
              style={styles.modalCloseButton}
            >
              <X color="rgba(255,255,255,0.8)" size={rs(20)} />
            </Pressable>
          </View>
          <View style={styles.anniversaryHeaderDivider} />

          <View style={styles.datePickerModalBody}>
            <View style={styles.pickerMonthNav}>
              <Pressable
                onPress={() => setEditPickerMonth(new Date(editPickerMonth.getFullYear(), editPickerMonth.getMonth() - 1, 1))}
                style={styles.pickerNavButton}
              >
                <ChevronLeft color={COLORS.white} size={rs(18)} />
              </Pressable>
              <Text style={styles.pickerMonthText}>
                {i18n.language === 'ko'
                  ? `${editPickerMonth.getFullYear()}년 ${editPickerMonth.getMonth() + 1}월`
                  : editPickerMonth.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
              </Text>
              <Pressable
                onPress={() => setEditPickerMonth(new Date(editPickerMonth.getFullYear(), editPickerMonth.getMonth() + 1, 1))}
                style={styles.pickerNavButton}
              >
                <ChevronRight color={COLORS.white} size={rs(18)} />
              </Pressable>
            </View>

            <View style={styles.pickerDayNames}>
              {(t('calendar.dayNames', { returnObjects: true }) as string[]).map((day: string, idx: number) => (
                <Text
                  key={day}
                  style={[
                    styles.pickerDayName,
                    idx === 0 && { color: '#ef4444' },
                  ]}
                >
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.pickerGrid}>
              {getPickerDaysArray(editPickerMonth).map((day, index) => {
                if (day === null) {
                  return <View key={`empty-${index}`} style={styles.pickerDayCell} />;
                }

                const isSelected = isPickerDateSelected(day, editAnniversaryDate, editPickerMonth);
                const dayOfWeek = new Date(editPickerMonth.getFullYear(), editPickerMonth.getMonth(), day).getDay();
                const isSunday = dayOfWeek === 0;

                return (
                  <Pressable
                    key={day}
                    style={styles.pickerDayCell}
                    onPress={() => {
                      const selectedDate = new Date(editPickerMonth.getFullYear(), editPickerMonth.getMonth(), day);
                      goToEditFromDatePicker(selectedDate);
                    }}
                  >
                    {isSelected ? (
                      <View style={styles.pickerDayCellInnerSelected}>
                        <Text style={styles.pickerDayTextSelected}>{day}</Text>
                      </View>
                    ) : (
                      <View style={styles.pickerDayCellInner}>
                        <Text style={[styles.pickerDayText, isSunday && { color: '#ef4444' }]}>
                          {day}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {/* Background Image */}
      <ExpoImage
        source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
        placeholder="L6PZfSi_.AyE_3t7t7R**0LTIpIp"
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        style={[styles.backgroundImage, styles.backgroundImageStyle]}
      />
      <BlurView
        experimentalBlurMethod="dimezisBlurView"
        intensity={Platform.OS === 'ios' ? 90 : 50}
        tint={Platform.OS === 'ios' ? 'light' : 'default'}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.overlay, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)' }]} />

      {/* Content - 프리미엄 사용자는 배너 광고 높이만큼 추가 패딩 */}
      <View style={[styles.content, premiumContentPadding > 0 && { paddingBottom: premiumContentPadding }]}>
        {/* Photo centered */}
        <View style={styles.polaroidContainer}>
          {/* Top section: line + user icon/names (line matches names width) */}
          <View style={styles.frameTopSection}>
            {/* Top line - hidden */}
            <View ref={topLineRef} style={styles.frameTopLine} />

            {/* User icon and couple names */}
            <View style={styles.frameUserIconRow}>
              <View style={styles.frameUserIcon}>
                <Users color="#fff" size={polaroidScale(15)} strokeWidth={3} />
              </View>
              <View style={styles.coupleNamesInline}>
                <Text style={[styles.coupleNameInline, { fontFamily: getFontByText(user1Nickname) }]} numberOfLines={1}>
                  {user1Nickname}
                </Text>
                <Heart
                  color="#FF3B30"
                  fill="#FF3B30"
                  size={Platform.OS === 'android' ? Math.max(polaroidScale(16), 14) : polaroidScale(16)}
                  style={styles.coupleIconInline}
                />
                <Text style={[styles.coupleNameInline, { fontFamily: getFontByText(user2Nickname) }]} numberOfLines={1}>
                  {user2Nickname}
                </Text>
              </View>
            </View>
          </View>

          {/* Photo frame with border */}
          <View style={styles.frameOuter}>
            <View style={styles.polaroid}>
              {/* Photo area */}
              <View style={styles.polaroidImageContainer}>
                <ExpoImage
                  source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
                  style={styles.polaroidImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={100}
                />
                {/* Subtle vignette overlay */}
                <View style={styles.vignetteOverlay} />
              </View>
            </View>
          </View>

          {/* Instagram-style action icons row */}
          <View style={styles.frameIconsRow}>
            <View style={styles.frameIconsLeft}>
              <Pressable onPress={handleHeartPress}>
                <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                  <Heart
                    color={isHeartLiked ? '#FF3B30' : '#fff'}
                    fill={isHeartLiked ? '#FF3B30' : 'none'}
                    size={polaroidScale(26)}
                    strokeWidth={isHeartLiked ? 0 : 1.8}
                  />
                </Animated.View>
              </Pressable>
              <Pressable onPress={openAnniversaryModal} style={styles.frameIconSpacing}>
                <Calendar color="#fff" size={polaroidScale(22)} strokeWidth={1.8} />
              </Pressable>
              <Pressable onPress={handleSharePress} style={styles.frameIconSpacing}>
                <Send color="#fff" size={polaroidScale(22)} strokeWidth={1.8} />
              </Pressable>
            </View>
            <Pressable
              ref={imageButtonRef}
              onPress={() => setShowImagePickerModal(true)}
              onLayout={measureButton}
            >
              <ImageIcon color="#fff" size={polaroidScale(22)} strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* Section between frame and bottom line */}
          <View style={styles.frameDDaySection}>
            {/* D-Day text - bottom left (no press action) */}
            <View style={styles.frameDDayTextRow}>
              <Text style={[styles.frameDDayNumber, { fontFamily: getDDayFont.primary }]}>
                {diffDays !== null ? diffDays : '-'}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.frameDDayUnit, { fontFamily: getDDayFont.secondary }]}>
                  {t('home.dDay.suffix')}
                </Text>
                <Heart color="#FFFFFF" fill="#FFFFFF" size={polaroidScale(16)} style={{ marginLeft: polaroidScale(6) }} />
              </View>
            </View>
          </View>

          {/* Bottom line */}
          <View ref={bottomLineRef} style={styles.frameBottomLine} />
        </View>
      </View>

      {/* Banner Ad - positioned above tab bar */}
      <BannerAdView placement="home" style={[styles.bannerAd, { bottom: bannerAdBottom }]} />

      {/* Anniversary Modal with Blur - Single modal with step-based content */}
      <Modal
        visible={showAnniversaryModal}
        transparent
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => {
          if (anniversaryModalStep === 'list') {
            closeAnniversaryModal();
          } else if (anniversaryModalStep === 'addDatePicker') {
            goToAddFromDatePicker();
          } else if (anniversaryModalStep === 'editDatePicker') {
            goToEditFromDatePicker();
          } else {
            goToListStep();
          }
        }}
      >
        <View style={styles.blurContainer}>
          <BlurView experimentalBlurMethod="dimezisBlurView" intensity={80} tint="dark" style={styles.blurOverlay}>
            {renderAnniversaryModalContent()}
          </BlurView>
        </View>
      </Modal>

      {/* Image Picker Modal with Blur */}
      <Modal
        visible={showImagePickerModal}
        transparent
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setShowImagePickerModal(false)}
      >
        <View style={styles.blurContainer}>
          <BlurView experimentalBlurMethod="dimezisBlurView" intensity={60} tint="dark" style={styles.blurOverlay}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setShowImagePickerModal(false)}
            >
              <View style={styles.imagePickerModalCenterWrapper}>
                <Pressable onPress={(e) => e.stopPropagation()}>
                  <View style={styles.imagePickerModal}>
                    <View style={styles.imagePickerHeader}>
                      <Text style={styles.imagePickerTitle}>{t('home.background.title')}</Text>
                      <Pressable
                        onPress={() => setShowImagePickerModal(false)}
                        style={styles.modalCloseButton}
                      >
                        <X color={COLORS.white} size={rs(18)} />
                      </Pressable>
                    </View>

                    <Text style={styles.imagePickerDescription}>
                      {t('home.background.description')}
                    </Text>

                    <View style={styles.imagePickerButtons}>
                      <Pressable
                        style={styles.imagePickerButtonPrimary}
                        onPress={handlePickImage}
                      >
                        <Text style={styles.imagePickerButtonPrimaryText}>
                          {t('home.background.selectFromGallery')}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.imagePickerButtonSecondary}
                        onPress={handleResetBackground}
                      >
                        <Text style={styles.imagePickerButtonSecondaryText}>
                          {t('home.background.resetToDefault')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              </View>
            </Pressable>
          </BlurView>
        </View>
      </Modal>

      {/* OLD MODALS REMOVED - Content moved to unified anniversary modal above */}

      {/* First-Time Tutorial Overlay */}
      <Modal
        visible={showTutorial && buttonPosition !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeTutorial}
      >
        <Pressable style={styles.tutorialOverlay} onPress={closeTutorial}>
          {buttonPosition && (
            <>
              {/* SVG overlay with circular hole - use screenHeight to cover Android nav bar */}
              <Svg width={width} height={screenHeight} style={styles.tutorialSvg}>
                <Defs>
                  <Mask id="holeMask">
                    {/* White = visible, Black = hidden */}
                    <Rect x="0" y="0" width={width} height={screenHeight} fill="white" />
                    <Circle
                      cx={buttonPosition.x + buttonPosition.width / 2}
                      cy={buttonPosition.y + buttonPosition.height / 2}
                      r={28}
                      fill="black"
                    />
                  </Mask>
                </Defs>
                <Rect
                  x="0"
                  y="0"
                  width={width}
                  height={screenHeight}
                  fill="rgba(0, 0, 0, 0.85)"
                  mask="url(#holeMask)"
                />
              </Svg>
              {/* Circular highlight ring */}
              <View
                style={[
                  styles.tutorialHole,
                  {
                    position: 'absolute',
                    left: buttonPosition.x + buttonPosition.width / 2 - 28,
                    top: buttonPosition.y + buttonPosition.height / 2 - 28,
                  },
                ]}
              />
              {/* Message box - right aligned with hole */}
              <View
                style={[
                  styles.tutorialMessageContainer,
                  {
                    position: 'absolute',
                    top: buttonPosition.y + buttonPosition.height / 2 + 40,
                    right: width - buttonPosition.x - buttonPosition.width - 8,
                  },
                ]}
              >
                <View style={styles.tutorialMessageBox}>
                  <Text style={styles.tutorialMessageTitle}>{t('home.tutorial.title')}</Text>
                  <Text style={styles.tutorialMessageText}>
                    {t('home.tutorial.description')}
                  </Text>
                </View>
              </View>
            </>
          )}
        </Pressable>
      </Modal>

      {/* Hidden branded container for share capture - rendered off-screen but within layout */}
      {capturedContentUri && capturedContentSize && (
        <View
          style={styles.brandedContainerWrapper}
          pointerEvents="none"
          collapsable={false}
        >
          <View
            ref={brandedContainerRef}
            style={[
              styles.brandedContainer,
              {
                width: capturedContentSize.width,
                height: capturedContentSize.height,
              },
            ]}
            collapsable={false}
          >
            {/* Captured content as background */}
            <ExpoImage
              source={{ uri: capturedContentUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory"
              onLoad={() => {
                // Signal that the branded image is loaded and ready for capture
                if (brandedImageLoadedRef.current) {
                  brandedImageLoadedRef.current();
                  brandedImageLoadedRef.current = null;
                }
              }}
            />

            {/* Bottom: handle */}
            <Text style={styles.brandedTextBottom}>@Daydate</Text>
          </View>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  bannerAd: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
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
    transform: [{ scale: 1.0 }],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rs(SPACING.lg),
    // Android: shift content up with negative marginTop (responsive to screen height)
    // Tall screens (Galaxy S24 etc.): -50px, Normal Android: -35px, Compact: -25px
    marginTop: Platform.OS === 'android'
      ? (SCREEN_HEIGHT < 700
        ? rh(-25)
        : isTallAndroidScreen
          ? rh(-50)  // More shift for tall screens
          : rh(-35))
      : 0,
    // Account for banner ad + tab bar at bottom - responsive padding
    // Small screens (< 700px): 100px, Medium (700-800): 110px, Large: 120px
    // Tall Android screens (Galaxy S24 etc.): 95px for more vertical space
    paddingBottom: Platform.OS === 'android'
      ? (SCREEN_HEIGHT < 700
        ? rh(100)
        : isTallAndroidScreen
          ? rh(95)  // Reduced for tall screens
          : SCREEN_HEIGHT < 800 ? rh(110) : rh(120))
      : SCREEN_HEIGHT < 700 ? rh(100) : SCREEN_HEIGHT < 800 ? rh(110) : rh(120),
  },
  anniversarySection: {
    paddingTop: Platform.OS === 'android'
      ? (SCREEN_HEIGHT < 700
        ? Math.max(rh(60), 50)  // Compact screens
        : isTallAndroidScreen
          ? Math.max(rh(65), 55)  // Tall screens (Galaxy S24 etc.)
          : Math.max(rh(90), 70))
      : Math.max(rh(90), 70),
    paddingBottom: Math.max(rh(SPACING.sm), 6),
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  coupleNamesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'android'
      ? (SCREEN_HEIGHT < 700
        ? Math.max(rh(SPACING.md), 8)
        : isTallAndroidScreen
          ? Math.max(rh(SPACING.md), 10)  // Reduced for tall screens
          : Math.max(rh(SPACING.xl), 16))
      : Math.max(rh(SPACING.xl), 16),
  },
  coupleNameText: {
    fontSize: Platform.OS === 'android'
      ? (isTallAndroidScreen ? Math.max(fp(17), 15) : Math.max(fp(20), 17))  // Smaller for tall screens
      : Math.max(fp(18), 15),
    color: COLORS.white,
    fontFamily: 'Jua', // Use Jua directly for better Android compatibility
    letterSpacing: rs(0.5),
    opacity: 0.95,
    backgroundColor: 'transparent',
    includeFontPadding: false, // Android: remove extra padding
  },
  coupleNameLeft: {
    flex: 1,
    textAlign: 'right',
    marginRight: rs(SPACING.sm),
  },
  coupleNameRight: {
    flex: 1,
    textAlign: 'left',
    marginLeft: rs(SPACING.sm),
  },
  heartEmoji: {
    fontFamily: 'System',
    fontSize: fp(18),
  },
  anniversaryButton: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingVertical: 8,
  },
  dDayRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    minHeight: 50,
  },
  dDayNumber: {
    fontSize: Platform.OS === 'android'
      ? (isTallAndroidScreen ? Math.max(rw(44), 38) : Math.max(rw(52), 44))  // Smaller for tall screens
      : fp(52),
    color: '#FFFFFF',
    fontFamily: 'Jua',
    letterSpacing: 1,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  dDayUnit: {
    fontSize: Platform.OS === 'android'
      ? (isTallAndroidScreen ? Math.max(rw(20), 18) : Math.max(rw(24), 20))  // Smaller for tall screens
      : fp(24),
    color: '#FFFFFF',
    fontFamily: 'Jua',
    letterSpacing: 0.5,
    marginLeft: 6,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  polaroidContainer: {
    alignItems: 'center', // Shift content slightly upward
  },
  frameTopSection: {
    alignItems: 'center',
    marginBottom: polaroidScale(isTallAndroidScreen ? 6 : 10),
    gap: polaroidScale(isTallAndroidScreen ? 4 : 6),
  },
  frameUserIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: polaroidScale(11),
  },
  frameCalendarRow: {
    width: POLAROID_WIDTH + polaroidScale(22),
    flexDirection: 'row',
    alignItems: 'center',
  },
  frameUserIcon: {
    width: polaroidScale(28),
    height: polaroidScale(28),
    borderRadius: polaroidScale(14),
    borderWidth: polaroidScale(2),
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameCalendarIcon: {
    width: polaroidScale(28),
    height: polaroidScale(28),
    borderRadius: polaroidScale(14),
    borderWidth: polaroidScale(2),
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coupleNamesInline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: polaroidScale(10),
  },
  coupleNameInline: {
    fontSize: Platform.OS === 'android'
      ? (isTallAndroidScreen ? Math.max(fp(15), 14) : Math.max(fp(18), 16))  // Smaller for tall screens
      : fp(18),
    color: '#FFFFFF',
    maxWidth: polaroidScale(isTallAndroidScreen ? 85 : 100),  // Narrower for tall screens
    includeFontPadding: false,
  },
  coupleIconInline: {
    marginHorizontal: polaroidScale(6),
  },
  frameDDaySection: {
    width: POLAROID_WIDTH + polaroidScale(22),
  },
  frameIconsRow: {
    width: POLAROID_WIDTH,
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: polaroidScale(isTallAndroidScreen ? 6 : 10),
  },
  frameIconsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  frameIconSpacing: {
    marginLeft: polaroidScale(14),
  },
  frameTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: polaroidScale(8),
  },
  frameDaydateText: {
    fontSize: Platform.OS === 'android'
      ? (isTallAndroidScreen ? Math.max(fp(17), 15) : Math.max(fp(20), 18))  // Smaller for tall screens
      : fp(20),
    fontFamily: 'Jua',
    color: '#FFFFFF',
    includeFontPadding: false,
  },
  frameDDayTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    alignSelf: 'flex-end',
    marginRight: polaroidScale(11),
    marginTop: Platform.OS === 'android'
      ? (SCREEN_HEIGHT < 700
        ? polaroidScale(20)
        : isTallAndroidScreen
          ? polaroidScale(16)  // Reduced for tall screens
          : polaroidScale(22))
      : polaroidScale(20),
  },
  frameDDayInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: polaroidScale(10),
  },
  frameDDayPrefix: {
    fontSize: Platform.OS === 'android'
      ? (isTallAndroidScreen ? Math.max(fp(17), 15) : Math.max(fp(20), 18))  // Smaller for tall screens
      : fp(20),
    color: '#FFFFFF',
    fontFamily: 'Jua',
    includeFontPadding: false,
    marginRight: polaroidScale(4),
  },
  frameDDayNumber: {
    fontSize: Platform.OS === 'android'
      ? (isTallAndroidScreen ? Math.max(fp(34), 30) : Math.max(fp(40), 36))  // Smaller for tall screens
      : fp(40),
    color: '#FFFFFF',
    letterSpacing: 0.5,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  frameDDayUnit: {
    fontSize: Platform.OS === 'android'
      ? (isTallAndroidScreen ? Math.max(fp(17), 15) : Math.max(fp(20), 18))  // Smaller for tall screens
      : fp(20),
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginLeft: polaroidScale(4),
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  frameTopLine: {
    width: POLAROID_WIDTH + polaroidScale(22),
    height: 0,
    backgroundColor: 'transparent',
    marginBottom: polaroidScale(12),
  },
  frameBottomLine: {
    width: POLAROID_WIDTH + polaroidScale(22),
    height: polaroidScale(3),
    backgroundColor: '#FFFFFF',
    marginTop: 0,
  },
  frameOuter: {
    padding: polaroidScale(8),
    borderWidth: polaroidScale(3),
    borderColor: '#FFFFFF',
  },
  polaroid: {
    width: POLAROID_WIDTH,
    position: 'relative',
  },
  polaroidImageContainer: {
    aspectRatio: 1 / 1.15,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderRadius: 0,
  },
  polaroidImage: {
    width: '100%',
    height: '100%',
  },
  vignetteOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  polaroidBottom: {
    position: 'absolute',
    bottom: polaroidScale(-2),
    left: polaroidScale(16),
    right: polaroidScale(12),
    height: polaroidScale(72),
    justifyContent: 'flex-end',
  },
  sloganStrip: {
    position: 'relative',
    paddingHorizontal: polaroidScale(6),
    paddingVertical: polaroidScale(3),
    alignSelf: 'flex-start',
    marginBottom: polaroidScale(-17),
    marginLeft: polaroidScale(4),
  },
  sloganWords: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  word1: {
    transform: [{ rotate: '-4deg' }],
  },
  word2: {
    transform: [{ rotate: '5deg' }],
  },
  word3: {
    transform: [{ rotate: '3deg' }],
  },
  word4: {
    transform: [{ rotate: '4deg' }],
  },
  highlighterSlogan: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: polaroidScale(14),
    height: polaroidScale(12),
    backgroundColor: '#DFD3C3',
    opacity: 0.7,
    transform: [{ rotate: '1deg' }],
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  polaroidLogo: {
    width: polaroidScale(110),
    height: polaroidScale(40),
    marginLeft: polaroidScale(5),
    marginBottom: polaroidScale(7)
  },
  brandStrip: {
    position: 'relative',
    paddingHorizontal: polaroidScale(6),
    paddingVertical: polaroidScale(3),
    transform: [{ rotate: '1deg' }],
    marginLeft: polaroidScale(8),
  },
  highlighter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: polaroidScale(14),
    height: polaroidScale(12),
    backgroundColor: '#DFD3C3',
    opacity: 0.7,
    transform: [{ rotate: '-1deg' }],
  },
  polaroidSlogan: {
    fontSize: polaroidScale(26),
    color: '#4A4440',
    fontFamily: 'JustMeAgainDownHere',
    fontWeight: '500',
    letterSpacing: polaroidScale(0.5),
  },
  polaroidBrand: {
    fontSize: polaroidScale(26),
    color: '#4A4440',
    fontFamily: 'JustMeAgainDownHere',
    fontWeight: '500',
    letterSpacing: polaroidScale(0.5),
  },
  imageChangeButton: {
    padding: polaroidScale(6),
    marginRight: polaroidScale(-4),
  },
  imageChangeButtonOverlay: {
    position: 'absolute',
    bottom: polaroidScale(4),
    right: polaroidScale(4),
    padding: polaroidScale(2),
  },
  edgeHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: rs(2),
    // Top-left light edge (light source simulation)
    borderTopWidth: rs(1),
    borderLeftWidth: rs(1),
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'rgba(255, 255, 255, 0.4)',
    // Bottom-right shadow edge
    borderBottomWidth: rs(1),
    borderRightWidth: rs(1),
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    borderRightColor: 'rgba(0, 0, 0, 0.03)',
  },
  innerShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: rs(2),
    // Simulate inner shadow with gradient-like border
    borderWidth: rs(3),
    borderColor: 'transparent',
    borderTopColor: 'rgba(0, 0, 0, 0.02)',
    borderLeftColor: 'rgba(0, 0, 0, 0.015)',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  blurOverlay: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rs(SPACING.lg),
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  anniversaryModalContent: {
    width: width - rs(48),
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: rs(32),
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  anniversaryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: rs(24),
    paddingVertical: rs(20),
  },
  anniversaryHeaderDivider: {
    height: rs(1),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: rs(24),
  },
  anniversaryModalTitle: {
    fontSize: fp(20),
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: rs(28),
  },
  modalCloseButton: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  anniversaryListContainer: {
    maxHeight: rs(300),
    overflow: 'hidden',
  },
  anniversaryListContent: {
    paddingHorizontal: rs(24),
    paddingTop: rs(20),
    paddingBottom: rs(16),
  },
  anniversaryFooterDivider: {
    height: rs(1),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: rs(24),
  },
  anniversaryFooter: {
    paddingHorizontal: rs(24),
    paddingTop: rs(16),
    paddingBottom: rs(24),
  },
  addAnniversaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(SPACING.sm),
    backgroundColor: COLORS.white,
    paddingVertical: rs(14),
    borderRadius: rs(100),
  },
  addAnniversaryText: {
    fontSize: fp(15),
    color: COLORS.black,
    fontWeight: '500',
  },
  imagePickerModalCenterWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rs(SPACING.lg),
  },
  imagePickerModal: {
    width: width - rs(48),
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: rs(32),
    padding: rs(SPACING.xl),
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  imagePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rs(SPACING.md),
  },
  imagePickerTitle: {
    fontSize: fp(18),
    color: COLORS.white,
    fontWeight: '600',
  },
  imagePickerDescription: {
    fontSize: fp(14),
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: rs(SPACING.lg),
  },
  imagePickerButtons: {
    gap: rs(SPACING.sm),
  },
  imagePickerButtonPrimary: {
    width: '100%',
    paddingVertical: rs(14),
    borderRadius: rs(24),
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
  },
  imagePickerButtonPrimaryText: {
    fontSize: fp(15),
    color: '#000',
    fontWeight: '500',
  },
  imagePickerButtonSecondary: {
    width: '100%',
    paddingVertical: rs(14),
    borderRadius: rs(24),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  imagePickerButtonSecondaryText: {
    fontSize: fp(15),
    color: COLORS.white,
    fontWeight: '500',
  },
  // Add Anniversary Modal Styles
  keyboardAvoidingView: {
    width: '100%',
    alignItems: 'center',
  },
  addAnniversaryModalContent: {
    width: width - rs(48),
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: rs(32),
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    maxHeight: height * 0.7,
  },
  addAnniversaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: rs(24),
    paddingVertical: rs(20),
  },
  addAnniversaryTitle: {
    fontSize: fp(20),
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: rs(28),
  },
  addAnniversaryForm: {
    maxHeight: rs(320),
  },
  addAnniversaryFormContent: {
    paddingHorizontal: rs(24),
    paddingTop: rs(20),
    paddingBottom: rs(16),
  },
  formSection: {
    marginBottom: rs(24),
  },
  formLabel: {
    fontSize: fp(14),
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: rs(12),
    fontWeight: '500',
  },
  iconSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: rs(16),
    paddingVertical: rs(12),
    paddingHorizontal: rs(16),
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedIcon: {
    fontSize: fp(32),
  },
  iconSelectorHint: {
    fontSize: fp(14),
    color: 'rgba(255, 255, 255, 0.5)',
  },
  emojiPickerContainer: {
    marginTop: rs(12),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: rs(16),
    padding: rs(12),
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rs(8),
    justifyContent: 'center',
  },
  emojiOption: {
    width: rs(44),
    height: rs(44),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rs(12),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  emojiOptionSelected: {
    backgroundColor: 'rgba(168, 85, 247, 0.4)',
    borderWidth: rs(2),
    borderColor: '#A855F7',
  },
  emojiOptionText: {
    fontSize: fp(24),
  },
  iconNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(12),
  },
  iconButton: {
    width: rs(52),
    height: rs(52),
    borderRadius: rs(16),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedIconSmall: {
    fontSize: fp(28),
  },
  nameInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: rs(16),
    paddingVertical: rs(14),
    paddingHorizontal: rs(16),
    fontSize: fp(16),
    color: COLORS.white,
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  datePickerButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: rs(16),
    paddingVertical: rs(14),
    paddingHorizontal: rs(16),
    alignItems: 'center',
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  datePickerButtonText: {
    fontSize: fp(16),
    color: COLORS.white,
    fontWeight: '500',
  },
  addAnniversaryFooter: {
    paddingHorizontal: rs(24),
    paddingTop: rs(16),
    paddingBottom: rs(24),
  },
  submitButton: {
    borderRadius: rs(100),
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonInner: {
    backgroundColor: COLORS.white,
    paddingVertical: rs(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: fp(16),
    color: COLORS.black,
    fontWeight: '600',
  },
  // Tutorial overlay styles - SVG with circular hole
  tutorialOverlay: {
    flex: 1,
  },
  tutorialSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  tutorialHole: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'transparent',
    // Glowing border to highlight the button
    borderWidth: rs(3),
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: rs(20),
    elevation: 10,
  },
  tutorialMessageContainer: {
    alignItems: 'flex-end',
  },
  tutorialMessageBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: rs(16),
    paddingVertical: rs(16),
    paddingHorizontal: rs(20),
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tutorialMessageTitle: {
    fontSize: fp(16),
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: rs(6),
    textAlign: 'right',
  },
  tutorialMessageText: {
    fontSize: fp(13),
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
    lineHeight: rs(18),
  },
  // DatePicker Confirm Button
  datePickerConfirmWrapper: {
    alignItems: 'center',
    marginBottom: rs(8),
  },
  datePickerConfirmButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: rs(10),
    paddingHorizontal: rs(32),
    borderRadius: rs(20),
  },
  datePickerConfirmText: {
    fontSize: fp(15),
    color: COLORS.white,
    fontWeight: '600',
  },
  // Date Picker Modal Styles
  datePickerModalContent: {
    width: width - rs(48),
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: rs(32),
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  datePickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: rs(24),
    paddingVertical: rs(20),
  },
  datePickerModalTitle: {
    fontSize: fp(20),
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: rs(28),
  },
  datePickerModalBody: {
    paddingHorizontal: rs(24),
    paddingTop: rs(20),
    paddingBottom: rs(24),
  },
  pickerMonthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: rs(20),
  },
  pickerNavButton: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerMonthText: {
    fontSize: fp(16),
    color: COLORS.white,
    fontWeight: '600',
  },
  pickerDayNames: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: rs(12),
  },
  pickerDayName: {
    width: rs(36),
    textAlign: 'center',
    fontSize: fp(12),
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  pickerDayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rs(2),
  },
  pickerDayCellInner: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerDayCellInnerSelected: {
    width: rs(36),
    height: rs(36),
    borderRadius: rs(18),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: rs(1),
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  pickerDayText: {
    fontSize: fp(14),
    color: COLORS.white,
    fontWeight: '500',
  },
  pickerDayTextSelected: {
    fontSize: fp(14),
    color: COLORS.white,
    fontWeight: '700',
  },
  // Wrapper to position branded container off-screen but still render it
  brandedContainerWrapper: {
    position: 'absolute',
    top: -9999,
    left: 0,
    opacity: 1, // Must be visible for capture
  },
  // Branded container for share capture (no background, just overlay text)
  brandedContainer: {
    overflow: 'visible',
  },
  // Bottom: handle text
  brandedTextBottom: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    fontSize: 16,
    fontFamily: 'InstrumentSerif',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 0.5,
  },
});