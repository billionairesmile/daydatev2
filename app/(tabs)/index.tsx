import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  Modal,
  ScrollView,
  TouchableWithoutFeedback,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  StatusBar,
  InteractionManager,
  ActivityIndicator,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import Svg, { Rect, Circle, Defs, Mask } from 'react-native-svg';
import { Image as ImageIcon, X, Edit2, Trash2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Swipeable } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { useTranslation } from 'react-i18next';

// Pre-load static images (outside component to avoid re-creation)
const LOGO_IMAGE = require('@/assets/images/daydate-logo.png');
const DEFAULT_BACKGROUND_IMAGE = require('@/assets/images/backgroundimage.jpg');

// Preload images at module level
Asset.fromModule(LOGO_IMAGE).downloadAsync();
Asset.fromModule(DEFAULT_BACKGROUND_IMAGE).downloadAsync();

import { COLORS, SPACING, RADIUS, scale, scaleFont, IS_TABLET } from '@/constants/design';

// Responsive Polaroid sizing
// Base: iPhone 16 (393px width) with 280px polaroid = 71.2% ratio
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const POLAROID_BASE_WIDTH = 280;

// Responsive height scaling for Android
// Base height: 844 (iPhone 14 Pro / standard modern phone)
const BASE_HEIGHT = 844;
const HEIGHT_SCALE = Platform.OS === 'android'
  ? Math.max(Math.min(SCREEN_HEIGHT / BASE_HEIGHT, 1), 0.75)
  : 1; // iOS uses fixed sizes

// Android width-based scaling for horizontal elements
const BASE_WIDTH = 393; // iPhone 14 Pro width
const WIDTH_SCALE = Platform.OS === 'android'
  ? Math.max(Math.min(SCREEN_WIDTH / BASE_WIDTH, 1.1), 0.75)
  : 1;

// Helper function for responsive height scaling (Android only)
const rh = (size: number): number => {
  if (Platform.OS !== 'android') return size;
  return Math.round(size * HEIGHT_SCALE);
};

// Helper function for responsive width scaling (Android only)
const rw = (size: number): number => {
  if (Platform.OS !== 'android') return size;
  return Math.round(size * WIDTH_SCALE);
};

// Calculate responsive polaroid width and scale factor
// For compact screens (height < 700), use smaller ratio
const POLAROID_WIDTH_RATIO = Platform.OS === 'android' && SCREEN_HEIGHT < 700
  ? 0.55  // Smaller ratio for compact Android screens
  : 0.712;
const POLAROID_WIDTH = IS_TABLET
  ? Math.round(POLAROID_BASE_WIDTH * 0.75)
  : Platform.OS === 'android'
    ? Math.round(SCREEN_WIDTH * POLAROID_WIDTH_RATIO * HEIGHT_SCALE)
    : Math.round(SCREEN_WIDTH * POLAROID_WIDTH_RATIO);
const POLAROID_SCALE = POLAROID_WIDTH / POLAROID_BASE_WIDTH;

// Helper to scale polaroid-related values proportionally
const polaroidScale = (size: number): number => {
  if (IS_TABLET) {
    return Math.round(size * 0.75);
  }
  return Math.round(size * POLAROID_SCALE);
};
import { useBackground } from '@/contexts';
import { useOnboardingStore, useAuthStore, useTimezoneStore } from '@/stores';
import { BannerAdView } from '@/components/ads';
import { useBannerAdBottom } from '@/hooks/useConsistentBottomInset';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { db } from '@/lib/supabase';
import { anniversaryService } from '@/services/anniversaryService';
import NetInfo from '@react-native-community/netinfo';
import KoreanLunarCalendar from 'korean-lunar-calendar';

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

const { width, height } = Dimensions.get('window');
const { height: screenHeight } = Dimensions.get('screen');

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
          <Edit2 color="#000000" size={scale(20)} />
          <Text style={swipeStyles.editActionText}>{t('common.edit')}</Text>
        </Pressable>
        <Pressable
          style={swipeStyles.deleteButton}
          onPress={() => {
            closeSwipe();
            onDelete();
          }}
        >
          <Trash2 color="#FFFFFF" size={scale(20)} />
          <Text style={swipeStyles.actionText}>{t('common.delete')}</Text>
        </Pressable>
      </Animated.View>
    );
  };

  // Calculate dynamic font size for long labels (EN, ES tend to be longer)
  const getLabelFontSize = (label: string) => {
    const length = label.length;
    if (length > 25) return scaleFont(12);
    if (length > 20) return scaleFont(13);
    if (length > 15) return scaleFont(14);
    return scaleFont(15);
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
    marginBottom: scale(8),
    borderRadius: scale(20),
    overflow: 'hidden',
  },
  swipeableContainer: {
    borderRadius: scale(20),
    overflow: 'hidden',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: scale(12),
    gap: scale(8),
  },
  editButton: {
    width: scale(50),
    height: scale(50),
    backgroundColor: '#FFFFFF',
    borderRadius: scale(25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  editActionText: {
    color: '#000000',
    fontSize: scaleFont(10),
    fontWeight: '600',
    marginTop: scale(2),
  },
  deleteButton: {
    width: scale(50),
    height: scale(50),
    backgroundColor: '#EF4444',
    borderRadius: scale(25),
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: scaleFont(10),
    fontWeight: '600',
    marginTop: scale(2),
  },
  card: {
    borderRadius: scale(20),
    paddingVertical: scale(12),
    paddingHorizontal: scale(16),
    width: '100%',
    minHeight: scale(70),
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
    gap: scale(12),
    flex: 1,
    marginRight: scale(8),
  },
  labelContainer: {
    flex: 1,
  },
  icon: {
    fontSize: scaleFont(28),
  },
  label: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    color: '#FFFFFF',
  },
  date: {
    fontSize: scaleFont(12),
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: scale(2),
  },
  badge: {
    paddingHorizontal: scale(14),
    paddingVertical: scale(8),
    borderRadius: scale(20),
  },
  dDay: {
    fontSize: scaleFont(14),
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
  const { coupleId } = useCoupleSyncStore();
  const bannerAdBottom = useBannerAdBottom();

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [newAnniversaryIcon, setNewAnniversaryIcon] = useState('💝');
  const [newAnniversaryName, setNewAnniversaryName] = useState('');
  const [newAnniversaryDate, setNewAnniversaryDate] = useState(new Date());

  // Custom anniversaries added by user (yearly repeating) - loaded from DB/local storage
  const [customAnniversaries, setCustomAnniversaries] = useState<Anniversary[]>([]);
  const [isLoadingAnniversaries, setIsLoadingAnniversaries] = useState(true);

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

  // Check for first-time tutorial
  useEffect(() => {
    const checkFirstTimeVisit = async () => {
      try {
        const hasSeenTutorial = await AsyncStorage.getItem('hasSeenHomeTutorial');
        if (!hasSeenTutorial) {
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
    checkFirstTimeVisit();
  }, [measureButton]);

  // Close tutorial and save to AsyncStorage
  const closeTutorial = async () => {
    setShowTutorial(false);
    try {
      await AsyncStorage.setItem('hasSeenHomeTutorial', 'true');
    } catch {
      // Ignore storage errors
    }
  };

  // Anniversary modal animation (scale + opacity like album modal)
  const anniversaryModalOpacity = useRef(new Animated.Value(0)).current;
  const anniversaryModalScale = useRef(new Animated.Value(0.9)).current;

  const openAnniversaryModal = () => {
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
        label: `${myNickname} ${t('home.anniversary.birthday')}${isLunar ? ` ${t('home.anniversary.lunar')}` : ''}`,
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
        label: `${partnerNickname} ${t('home.anniversary.birthday')}${isPartnerLunar ? ` ${t('home.anniversary.lunar')}` : ''}`,
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

      {/* Content */}
      <View style={styles.content}>
        {/* Anniversary Info - Top Section */}
        <View style={styles.anniversarySection}>
          <View style={styles.coupleNamesRow}>
            <Text style={[styles.coupleNameText, styles.coupleNameLeft]} numberOfLines={1}>
              {user1Nickname}
            </Text>
            <Text style={styles.heartEmoji}>❤️</Text>
            <Text style={[styles.coupleNameText, styles.coupleNameRight]} numberOfLines={1}>
              {user2Nickname}
            </Text>
          </View>
          <TouchableOpacity
            onPress={openAnniversaryModal}
            style={styles.anniversaryButton}
            activeOpacity={0.7}
          >
            <View style={styles.dDayRow}>
              <Text style={styles.dDayNumber}>
                {diffDays !== null ? diffDays : '-'}
              </Text>
              <Text style={styles.dDayUnit}>
                {t('common.daysCount')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Polaroid centered */}
        <View style={styles.polaroidContainer}>
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

            {/* Bottom area with logo */}
            <View style={styles.polaroidBottom}>
              <View style={styles.brandRow}>
                <ExpoImage
                  source={LOGO_IMAGE}
                  style={styles.polaroidLogo}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  priority="high"
                />
                {/* Image Change Button */}
                <Pressable
                  ref={imageButtonRef}
                  onPress={() => setShowImagePickerModal(true)}
                  onLayout={measureButton}
                  style={styles.imageChangeButton}
                >
                  <ImageIcon color="#333" size={polaroidScale(20)} />
                </Pressable>
              </View>
            </View>

            {/* Edge highlight for 3D effect */}
            <View style={styles.edgeHighlight} pointerEvents="none" />

            {/* Inner shadow for depth */}
            <View style={styles.innerShadow} pointerEvents="none" />
          </View>
        </View>
      </View>

      {/* Banner Ad - Fixed at bottom, dynamically positioned above tab bar */}
      <BannerAdView placement="home" style={[styles.bannerAd, { bottom: bannerAdBottom }]} />

      {/* Anniversary Modal with Blur - Single modal with step-based content */}
      <Modal
        visible={showAnniversaryModal}
        transparent
        animationType="none"
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
        <Animated.View style={[styles.blurContainer, { opacity: anniversaryModalOpacity }]}>
          <BlurView experimentalBlurMethod="dimezisBlurView" intensity={80} tint="dark" style={styles.blurOverlay}>
            <TouchableWithoutFeedback onPress={() => {
              if (anniversaryModalStep === 'list') {
                closeAnniversaryModal();
              }
            }}>
              <View style={styles.modalBackdrop} />
            </TouchableWithoutFeedback>

            {/* Step: List */}
            {anniversaryModalStep === 'list' && (
              <Animated.View style={[
                styles.anniversaryModalContent,
                { transform: [{ scale: anniversaryModalScale }] }
              ]}>
                <View style={styles.anniversaryModalHeader}>
                  <Text style={styles.anniversaryModalTitle}>{t('home.anniversary.title')}</Text>
                  <Pressable
                    onPress={closeAnniversaryModal}
                    style={styles.modalCloseButton}
                  >
                    <X color="rgba(255,255,255,0.8)" size={scale(20)} />
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
              </Animated.View>
            )}

            {/* Step: Add */}
            {anniversaryModalStep === 'add' && (
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardAvoidingView}
              >
                <View style={styles.addAnniversaryModalContent}>
                  <View style={styles.addAnniversaryHeader}>
                    <Text style={styles.addAnniversaryTitle}>{t('home.anniversary.add')}</Text>
                    <Pressable
                      onPress={goToListStep}
                      style={styles.modalCloseButton}
                    >
                      <X color="rgba(255,255,255,0.8)" size={scale(20)} />
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
                              { color: newAnniversaryName ? COLORS.white : 'rgba(255,255,255,0.4)', fontSize: scaleFont(15) }
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
                    <X color="rgba(255,255,255,0.8)" size={scale(20)} />
                  </Pressable>
                </View>
                <View style={styles.anniversaryHeaderDivider} />

                <View style={styles.datePickerModalBody}>
                  <View style={styles.pickerMonthNav}>
                    <Pressable
                      onPress={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))}
                      style={styles.pickerNavButton}
                    >
                      <ChevronLeft color={COLORS.white} size={scale(18)} />
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
                      <ChevronRight color={COLORS.white} size={scale(18)} />
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
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                      <X color="rgba(255,255,255,0.8)" size={scale(20)} />
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
                              { color: editAnniversaryName ? COLORS.white : 'rgba(255,255,255,0.4)', fontSize: scaleFont(15) }
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
                    <X color="rgba(255,255,255,0.8)" size={scale(20)} />
                  </Pressable>
                </View>
                <View style={styles.anniversaryHeaderDivider} />

                <View style={styles.datePickerModalBody}>
                  <View style={styles.pickerMonthNav}>
                    <Pressable
                      onPress={() => setEditPickerMonth(new Date(editPickerMonth.getFullYear(), editPickerMonth.getMonth() - 1, 1))}
                      style={styles.pickerNavButton}
                    >
                      <ChevronLeft color={COLORS.white} size={scale(18)} />
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
                      <ChevronRight color={COLORS.white} size={scale(18)} />
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
          </BlurView>
        </Animated.View>
      </Modal>

      {/* Image Picker Modal with Blur */}
      <Modal
        visible={showImagePickerModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowImagePickerModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowImagePickerModal(false)}
        >
          <BlurView experimentalBlurMethod="dimezisBlurView" intensity={60} tint="dark" style={styles.blurOverlay}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.imagePickerModal}>
                <View style={styles.imagePickerHeader}>
                  <Text style={styles.imagePickerTitle}>{t('home.background.title')}</Text>
                  <Pressable
                    onPress={() => setShowImagePickerModal(false)}
                    style={styles.modalCloseButton}
                  >
                    <X color={COLORS.white} size={scale(18)} />
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
          </BlurView>
        </Pressable>
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
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  content: {
    flex: 1,
    paddingHorizontal: scale(SPACING.lg),
  },
  anniversarySection: {
    paddingTop: Platform.OS === 'android' && SCREEN_HEIGHT < 700
      ? Math.max(scale(60) * HEIGHT_SCALE, 50)  // Smaller padding for compact screens
      : Math.max(scale(90) * HEIGHT_SCALE, 70),
    paddingBottom: Math.max(scale(SPACING.md) * HEIGHT_SCALE, 8),
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  coupleNamesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'android' && SCREEN_HEIGHT < 700
      ? Math.max(scale(SPACING.md) * HEIGHT_SCALE, 8)
      : Math.max(scale(SPACING.xl) * HEIGHT_SCALE, 16),
  },
  coupleNameText: {
    fontSize: Math.max(scaleFont(18) * HEIGHT_SCALE, 15), // Min 15pt for readability
    color: COLORS.white,
    fontFamily: 'Jua', // Use Jua directly for better Android compatibility
    letterSpacing: scale(0.5),
    opacity: 0.95,
    backgroundColor: 'transparent',
    includeFontPadding: false, // Android: remove extra padding
  },
  coupleNameLeft: {
    flex: 1,
    textAlign: 'right',
    marginRight: scale(SPACING.sm),
  },
  coupleNameRight: {
    flex: 1,
    textAlign: 'left',
    marginLeft: scale(SPACING.sm),
  },
  heartEmoji: {
    fontFamily: 'System',
    fontSize: scaleFont(18) * HEIGHT_SCALE,
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
    fontSize: Platform.OS === 'android' ? Math.max(rw(44), 36) : scaleFont(52),
    color: '#FFFFFF',
    fontFamily: 'Jua',
    letterSpacing: 1,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  dDayUnit: {
    fontSize: Platform.OS === 'android' ? Math.max(rw(20), 16) : scaleFont(24),
    color: '#FFFFFF',
    fontFamily: 'Jua',
    letterSpacing: 0.5,
    marginLeft: 6,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  polaroidContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Platform.OS === 'android' && SCREEN_HEIGHT < 700
      ? scale(180) * HEIGHT_SCALE  // Less padding for compact screens
      : scale(240) * HEIGHT_SCALE,
  },
  polaroid: {
    width: POLAROID_WIDTH,
    backgroundColor: '#F8F6F1',
    padding: polaroidScale(16),
    paddingBottom: polaroidScale(60),
    borderRadius: polaroidScale(2),
    // Multi-layer shadow for realistic depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: polaroidScale(12) },
    shadowOpacity: 0.25,
    shadowRadius: polaroidScale(20),
    elevation: 15,
    position: 'relative',
    // Subtle border for paper edge effect
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  polaroidImageContainer: {
    aspectRatio: 1 / 1.15,
    overflow: 'hidden',
    backgroundColor: '#000',
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
  edgeHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: scale(2),
    // Top-left light edge (light source simulation)
    borderTopWidth: scale(1),
    borderLeftWidth: scale(1),
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'rgba(255, 255, 255, 0.4)',
    // Bottom-right shadow edge
    borderBottomWidth: scale(1),
    borderRightWidth: scale(1),
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    borderRightColor: 'rgba(0, 0, 0, 0.03)',
  },
  innerShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: scale(2),
    // Simulate inner shadow with gradient-like border
    borderWidth: scale(3),
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
    flex: 1,
    width: '100%',
  },
  blurOverlay: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(SPACING.lg),
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  anniversaryModalContent: {
    width: width - scale(48),
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: scale(32),
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  anniversaryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(24),
    paddingVertical: scale(20),
  },
  anniversaryHeaderDivider: {
    height: scale(1),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: scale(24),
  },
  anniversaryModalTitle: {
    fontSize: scaleFont(20),
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: scale(28),
  },
  modalCloseButton: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  anniversaryListContainer: {
    maxHeight: scale(300),
    overflow: 'hidden',
  },
  anniversaryListContent: {
    paddingHorizontal: scale(24),
    paddingTop: scale(20),
    paddingBottom: scale(16),
  },
  anniversaryFooterDivider: {
    height: scale(1),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginHorizontal: scale(24),
  },
  anniversaryFooter: {
    paddingHorizontal: scale(24),
    paddingTop: scale(16),
    paddingBottom: scale(24),
  },
  addAnniversaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(SPACING.sm),
    backgroundColor: COLORS.white,
    paddingVertical: scale(14),
    borderRadius: scale(100),
  },
  addAnniversaryText: {
    fontSize: scaleFont(15),
    color: COLORS.black,
    fontWeight: '500',
  },
  imagePickerModal: {
    width: width - scale(48),
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: scale(32),
    padding: scale(SPACING.xl),
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  imagePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(SPACING.md),
  },
  imagePickerTitle: {
    fontSize: scaleFont(18),
    color: COLORS.white,
    fontWeight: '600',
  },
  imagePickerDescription: {
    fontSize: scaleFont(14),
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: scale(SPACING.lg),
  },
  imagePickerButtons: {
    gap: scale(SPACING.sm),
  },
  imagePickerButtonPrimary: {
    width: '100%',
    paddingVertical: scale(14),
    borderRadius: scale(24),
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
  },
  imagePickerButtonPrimaryText: {
    fontSize: scaleFont(15),
    color: '#000',
    fontWeight: '500',
  },
  imagePickerButtonSecondary: {
    width: '100%',
    paddingVertical: scale(14),
    borderRadius: scale(24),
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  imagePickerButtonSecondaryText: {
    fontSize: scaleFont(15),
    color: COLORS.white,
    fontWeight: '500',
  },
  // Add Anniversary Modal Styles
  keyboardAvoidingView: {
    width: '100%',
    alignItems: 'center',
  },
  addAnniversaryModalContent: {
    width: width - scale(48),
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: scale(32),
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
    maxHeight: height * 0.7,
  },
  addAnniversaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(24),
    paddingVertical: scale(20),
  },
  addAnniversaryTitle: {
    fontSize: scaleFont(20),
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: scale(28),
  },
  addAnniversaryForm: {
    maxHeight: scale(320),
  },
  addAnniversaryFormContent: {
    paddingHorizontal: scale(24),
    paddingTop: scale(20),
    paddingBottom: scale(16),
  },
  formSection: {
    marginBottom: scale(24),
  },
  formLabel: {
    fontSize: scaleFont(14),
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: scale(12),
    fontWeight: '500',
  },
  iconSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: scale(16),
    paddingVertical: scale(12),
    paddingHorizontal: scale(16),
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedIcon: {
    fontSize: scaleFont(32),
  },
  iconSelectorHint: {
    fontSize: scaleFont(14),
    color: 'rgba(255, 255, 255, 0.5)',
  },
  emojiPickerContainer: {
    marginTop: scale(12),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: scale(16),
    padding: scale(12),
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
    justifyContent: 'center',
  },
  emojiOption: {
    width: scale(44),
    height: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: scale(12),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  emojiOptionSelected: {
    backgroundColor: 'rgba(168, 85, 247, 0.4)',
    borderWidth: scale(2),
    borderColor: '#A855F7',
  },
  emojiOptionText: {
    fontSize: scaleFont(24),
  },
  iconNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  iconButton: {
    width: scale(52),
    height: scale(52),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedIconSmall: {
    fontSize: scaleFont(28),
  },
  nameInput: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: scale(16),
    paddingVertical: scale(14),
    paddingHorizontal: scale(16),
    fontSize: scaleFont(16),
    color: COLORS.white,
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  datePickerButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: scale(16),
    paddingVertical: scale(14),
    paddingHorizontal: scale(16),
    alignItems: 'center',
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  datePickerButtonText: {
    fontSize: scaleFont(16),
    color: COLORS.white,
    fontWeight: '500',
  },
  addAnniversaryFooter: {
    paddingHorizontal: scale(24),
    paddingTop: scale(16),
    paddingBottom: scale(24),
  },
  submitButton: {
    borderRadius: scale(100),
    overflow: 'hidden',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonInner: {
    backgroundColor: COLORS.white,
    paddingVertical: scale(14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    fontSize: scaleFont(16),
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
    borderWidth: IS_TABLET ? 3 * 0.75 : scale(3),
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: IS_TABLET ? 20 * 0.75 : scale(20),
    elevation: 10,
  },
  tutorialMessageContainer: {
    alignItems: 'flex-end',
  },
  tutorialMessageBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: IS_TABLET ? 16 * 0.75 : scale(16),
    paddingVertical: IS_TABLET ? 16 * 0.75 : scale(16),
    paddingHorizontal: IS_TABLET ? 20 * 0.75 : scale(20),
    borderWidth: IS_TABLET ? 1 : scale(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  tutorialMessageTitle: {
    fontSize: IS_TABLET ? 16 * 0.75 : scaleFont(16),
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: IS_TABLET ? 6 * 0.75 : scale(6),
    textAlign: 'right',
  },
  tutorialMessageText: {
    fontSize: IS_TABLET ? 13 * 0.75 : scaleFont(13),
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
    lineHeight: IS_TABLET ? 18 * 0.75 : scale(18),
  },
  // DatePicker Confirm Button
  datePickerConfirmWrapper: {
    alignItems: 'center',
    marginBottom: scale(8),
  },
  datePickerConfirmButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: scale(10),
    paddingHorizontal: scale(32),
    borderRadius: scale(20),
  },
  datePickerConfirmText: {
    fontSize: scaleFont(15),
    color: COLORS.white,
    fontWeight: '600',
  },
  // Date Picker Modal Styles
  datePickerModalContent: {
    width: width - scale(48),
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: scale(32),
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  datePickerModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: scale(24),
    paddingVertical: scale(20),
  },
  datePickerModalTitle: {
    fontSize: scaleFont(20),
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: scale(28),
  },
  datePickerModalBody: {
    paddingHorizontal: scale(24),
    paddingTop: scale(20),
    paddingBottom: scale(24),
  },
  pickerMonthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(20),
  },
  pickerNavButton: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerMonthText: {
    fontSize: scaleFont(16),
    color: COLORS.white,
    fontWeight: '600',
  },
  pickerDayNames: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: scale(12),
  },
  pickerDayName: {
    width: scale(36),
    textAlign: 'center',
    fontSize: scaleFont(12),
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
    padding: scale(2),
  },
  pickerDayCellInner: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerDayCellInnerSelected: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: scale(1),
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  pickerDayText: {
    fontSize: scaleFont(14),
    color: COLORS.white,
    fontWeight: '500',
  },
  pickerDayTextSelected: {
    fontSize: scaleFont(14),
    color: COLORS.white,
    fontWeight: '700',
  },
});