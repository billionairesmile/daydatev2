import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Pressable,
  Alert,
  Linking,
  Animated,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import * as Location from 'expo-location';
import KoreanLunarCalendar from 'korean-lunar-calendar';

import { getUserCountryCode } from '@/lib/locationUtils';
import { getLocales } from 'expo-localization';
import { CalendarHeart, MapPinOff } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { FeedCard, CategoryFilter, FeedDetailModal, CARD_WIDTH, GAP, PADDING } from '@/components/feed';
import { NativeFeedAd } from '@/components/ads';
import { FeedPost, FeedCategory } from '@/types';
import { db } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useBackground } from '@/contexts';
import { anniversaryService, type Anniversary } from '@/services/anniversaryService';
import { COLORS, SPACING, SP, FS, rs, fp } from '@/constants/design';

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
    sourceId: row.source_id,
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
const AD_ROW_INTERVAL = 4; // Insert a native ad every N post rows (= N*2 posts)

// ---------------------------------------------------------------------------
// Anniversary helper functions
// ---------------------------------------------------------------------------
const lunarToSolar = (lunarYear: number, lunarMonth: number, lunarDay: number): Date => {
  const calendar = new KoreanLunarCalendar();
  calendar.setLunarDate(lunarYear, lunarMonth, lunarDay, false);
  const solarDate = calendar.getSolarCalendar();
  return new Date(solarDate.year, solarDate.month - 1, solarDate.day);
};

const parseDateAsLocal = (date: Date | string): Date => {
  if (date instanceof Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  if (date.includes('T')) {
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getNextBirthdayDate = (birthDate: Date, isLunar: boolean, today: Date): Date => {
  const thisYear = today.getFullYear();
  if (isLunar) {
    const birthMonth = birthDate.getMonth() + 1;
    const birthDay = birthDate.getDate();
    let solarBirthday = lunarToSolar(thisYear, birthMonth, birthDay);
    if (solarBirthday < today) {
      solarBirthday = lunarToSolar(thisYear + 1, birthMonth, birthDay);
    }
    return solarBirthday;
  } else {
    const birthdayThisYear = new Date(thisYear, birthDate.getMonth(), birthDate.getDate());
    if (birthdayThisYear < today) {
      return new Date(thisYear + 1, birthDate.getMonth(), birthDate.getDate());
    }
    return birthdayThisYear;
  }
};

const getNextYearlyDate = (originalDate: Date, today: Date): Date => {
  const thisYear = today.getFullYear();
  const anniversaryThisYear = new Date(thisYear, originalDate.getMonth(), originalDate.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (anniversaryThisYear.getTime() < todayStart.getTime()) {
    return new Date(thisYear + 1, originalDate.getMonth(), originalDate.getDate());
  }
  return anniversaryThisYear;
};

// Row-based layout: each row is either a pair of posts or a full-width ad
type FeedRow =
  | { type: 'posts'; items: FeedPost[]; id: string }
  | { type: 'ad'; id: string };

// ---------------------------------------------------------------------------
// Feed Screen
// ---------------------------------------------------------------------------
export default function FeedScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const couple = useAuthStore((s) => s.couple);
  const partner = useAuthStore((s) => s.partner);
  const { data: onboardingData } = useOnboardingStore();
  const userId = user?.id;
  const coupleId = couple?.id;
  const { backgroundImage } = useBackground();
  const myNickname = user?.nickname || onboardingData.nickname || t('common.me');
  const partnerNickname = partner?.nickname || t('common.partner');

  // State
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState<FeedCategory>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [isKoreaUser, setIsKoreaUser] = useState(false);

  const offsetRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const categoryRef = useRef(category);
  categoryRef.current = category;
  const hasInitialDataRef = useRef(false);
  const isInitialMountRef = useRef(true);

  // -------------------------------------------------------------------
  // Upcoming anniversary (all anniversaries: default + custom)
  // -------------------------------------------------------------------
  const [customAnniversaries, setCustomAnniversaries] = useState<Anniversary[]>([]);

  // Load custom anniversaries + subscribe for real-time updates
  useEffect(() => {
    if (!coupleId) return;
    (async () => {
      try {
        const loaded = await anniversaryService.load(coupleId);
        setCustomAnniversaries(loaded);
      } catch (e) {
        // Silently fail
      }
    })();

    const unsubscribe = anniversaryService.subscribe(coupleId, (anniversaries) => {
      setCustomAnniversaries(anniversaries);
    }, 'feed');

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [coupleId]);

  // Check if user is in Korea (for gift link visibility)
  // Primary: GPS location, Fallback: device region setting
  useEffect(() => {
    (async () => {
      const code = await getUserCountryCode();
      if (code) {
        setIsKoreaUser(code === 'KR');
      } else {
        // GPS unavailable (no permission or error) → fallback to device region
        const regionCode = getLocales()[0]?.regionCode;
        setIsKoreaUser(regionCode === 'KR');
      }
    })();
  }, []);

  // Generate all default anniversaries (dating milestones, birthdays, holidays)
  const upcomingAnniversary = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const allAnniversaries: { label: string; icon: string; targetDate: Date; gradientColors: readonly [string, string]; isYearly?: boolean }[] = [];

    // Dating anniversary / wedding anniversary
    const isMarried = couple?.relationshipType === 'married' || !!couple?.weddingDate;
    const anniversaryDate = couple?.datingStartDate ? parseDateAsLocal(couple.datingStartDate) : null;

    if (isMarried) {
      const weddingDate = couple?.weddingDate ? parseDateAsLocal(couple.weddingDate) : anniversaryDate;
      if (weddingDate) {
        for (let year = 1; year <= 50; year++) {
          const yearlyDate = new Date(weddingDate);
          yearlyDate.setFullYear(weddingDate.getFullYear() + year);
          if (yearlyDate > now) {
            const label = i18n.language === 'ko'
              ? `${t('home.anniversary.weddingAnniversary')} ${year}주년`
              : `${year}${year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th'} ${t('home.anniversary.weddingAnniversary')}`;
            allAnniversaries.push({ label, icon: year === 1 ? '💍' : '💖', targetDate: yearlyDate, gradientColors: ['#A855F7', '#EC4899'], isYearly: true });
            break;
          }
        }
      }
    } else if (anniversaryDate) {
      // Dating milestones (100-day intervals)
      const daysPassed = Math.floor((now.getTime() - anniversaryDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      let nextMilestone: number;
      if (daysPassed < 1000) {
        nextMilestone = Math.ceil(daysPassed / 100) * 100;
        if (nextMilestone === 0) nextMilestone = 100;
      } else {
        nextMilestone = daysPassed < 1500 ? 1500 : Math.ceil(daysPassed / 500) * 500;
      }
      const milestoneDate = new Date(anniversaryDate.getTime() + (nextMilestone - 1) * 24 * 60 * 60 * 1000);
      if (milestoneDate > now) {
        const label = i18n.language === 'ko' ? `${nextMilestone}일` : `${nextMilestone} ${t('common.days')}`;
        allAnniversaries.push({
          label, icon: nextMilestone >= 1000 ? '🎉' : '✨', targetDate: milestoneDate,
          gradientColors: nextMilestone >= 1000 ? ['#A855F7', '#EC4899'] : ['#FBBF24', '#F59E0B'],
        });
      }

      // Yearly dating anniversary
      for (let year = 1; year <= 50; year++) {
        const yearlyDate = new Date(anniversaryDate);
        yearlyDate.setFullYear(anniversaryDate.getFullYear() + year);
        if (yearlyDate > now) {
          const label = (() => {
            switch (i18n.language) {
              case 'ko': return `${t('home.anniversary.datingAnniversary')} ${year}주년`;
              case 'ja': return `${t('home.anniversary.datingAnniversary')} ${year}周年`;
              case 'zh-TW': return `${t('home.anniversary.datingAnniversary')} ${year}週年`;
              case 'es': return `${year}º Aniversario`;
              default: return `${year}${year === 1 ? 'st' : year === 2 ? 'nd' : year === 3 ? 'rd' : 'th'} Anniversary`;
            }
          })();
          allAnniversaries.push({ label, icon: year === 1 ? '💕' : '💖', targetDate: yearlyDate, gradientColors: ['#EC4899', '#F43F5E'], isYearly: true });
          break;
        }
      }
    }

    // My birthday
    if (onboardingData.birthDate) {
      const birthDate = parseDateAsLocal(onboardingData.birthDate);
      const isLunar = onboardingData.birthDateCalendarType === 'lunar';
      const nextBirthday = getNextBirthdayDate(birthDate, isLunar, now);
      allAnniversaries.push({
        label: `${t('home.anniversary.birthdayWithName', { name: myNickname })}${isLunar ? ` ${t('home.anniversary.lunar')}` : ''}`,
        icon: '🎂', targetDate: nextBirthday, gradientColors: ['#FBBF24', '#F59E0B'], isYearly: true,
      });
    }

    // Partner birthday
    if (partner?.birthDate) {
      const partnerBirthDate = parseDateAsLocal(partner.birthDate);
      const isPartnerLunar = partner.birthDateCalendarType === 'lunar';
      const nextPartnerBirthday = getNextBirthdayDate(partnerBirthDate, isPartnerLunar, now);
      allAnniversaries.push({
        label: `${t('home.anniversary.birthdayWithName', { name: partnerNickname })}${isPartnerLunar ? ` ${t('home.anniversary.lunar')}` : ''}`,
        icon: '🎂', targetDate: nextPartnerBirthday, gradientColors: ['#F59E0B', '#FBBF24'], isYearly: true,
      });
    }

    // Holidays
    allAnniversaries.push(
      { label: t('home.anniversary.christmas'), icon: '🎄', targetDate: new Date(now.getFullYear(), 11, 25), gradientColors: ['#EF4444', '#22C55E'], isYearly: true },
      { label: t('home.anniversary.valentinesDay'), icon: '💝', targetDate: new Date(now.getFullYear(), 1, 14), gradientColors: ['#EC4899', '#F43F5E'], isYearly: true },
      { label: t('home.anniversary.whiteDay'), icon: '🤍', targetDate: new Date(now.getFullYear(), 2, 14), gradientColors: ['#3B82F6', '#06B6D4'], isYearly: true },
    );

    // Custom anniversaries from service
    for (const ann of customAnniversaries) {
      allAnniversaries.push({
        label: ann.label, icon: ann.icon, targetDate: ann.targetDate,
        gradientColors: ann.gradientColors, isYearly: ann.isYearly,
      });
    }

    // Find nearest within 14 days
    let nearest: { label: string; icon: string; daysLeft: number; gradientColors: readonly [string, string] } | null = null;

    for (const ann of allAnniversaries) {
      const effectiveDate = ann.isYearly ? getNextYearlyDate(ann.targetDate, now) : ann.targetDate;
      const annDate = new Date(effectiveDate.getFullYear(), effectiveDate.getMonth(), effectiveDate.getDate());
      const diffMs = annDate.getTime() - todayStart.getTime();
      const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (daysLeft >= 0 && daysLeft <= 14) {
        if (!nearest || daysLeft < nearest.daysLeft) {
          nearest = { label: ann.label, icon: ann.icon, daysLeft, gradientColors: ann.gradientColors };
        }
      }
    }

    return nearest;
  }, [customAnniversaries, couple, partner, onboardingData, myNickname, partnerNickname, t, i18n.language]);

  // Gift emoji shake animation
  const giftShakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shake = Animated.sequence([
      Animated.timing(giftShakeAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(giftShakeAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(giftShakeAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(giftShakeAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(giftShakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
      Animated.delay(2500),
    ]);
    const loop = Animated.loop(shake);
    loop.start();
    return () => loop.stop();
  }, [giftShakeAnim]);

  const giftShakeStyle = {
    transform: [{
      rotate: giftShakeAnim.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: ['-15deg', '0deg', '15deg'],
      }),
    }],
  };

  // -------------------------------------------------------------------
  // Fetch saved post IDs
  // -------------------------------------------------------------------
  const fetchSavedIds = useCallback(async () => {
    if (!userId) return;
    const { data } = await db.feedSaves.getSavedPostIds(userId);
    setSavedIds(new Set(data));
  }, [userId]);

  // -------------------------------------------------------------------
  // Shuffle helper (Fisher-Yates)
  // -------------------------------------------------------------------
  const shuffleArray = useCallback(<T,>(arr: T[]): T[] => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  // -------------------------------------------------------------------
  // Fetch posts (initial or after category change)
  // -------------------------------------------------------------------
  const fetchPosts = useCallback(
    async (reset = true, shuffle = false) => {
      const offset = reset ? 0 : offsetRef.current;
      const currentCategory = categoryRef.current;

      // Only show full loading spinner on initial load (no data yet)
      if (reset && !isRefreshingRef.current && !hasInitialDataRef.current) {
        setIsLoading(true);
      }

      // Use personalized feed when user/couple is available, otherwise fallback
      const { data, error } = userId && coupleId
        ? await db.feedPosts.getPersonalized({
            userId,
            coupleId,
            category: currentCategory === 'all' ? undefined : currentCategory,
            limit: PAGE_SIZE,
            offset,
          })
        : await db.feedPosts.getPublished({
            category: currentCategory === 'all' ? undefined : currentCategory,
            limit: PAGE_SIZE,
            offset,
          });

      if (!error && data) {
        const mapped = data.map(dbRowToFeedPost);
        const result = shuffle ? shuffleArray(mapped) : mapped;

        if (reset) {
          setPosts(result);
          offsetRef.current = result.length;
        } else {
          setPosts((prev) => [...prev, ...result]);
          offsetRef.current += result.length;
        }

        setHasMore(mapped.length >= PAGE_SIZE);
        hasInitialDataRef.current = true;
      }

      setIsLoading(false);
      setIsRefreshing(false);
      isRefreshingRef.current = false;
      setIsLoadingMore(false);
    },
    [userId, coupleId, shuffleArray],
  );

  // -------------------------------------------------------------------
  // Location permission check
  // -------------------------------------------------------------------
  const checkLocation = useCallback(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    const granted = status === 'granted';
    setLocationGranted(granted);
    if (!granted) {
      setIsLoading(false);
    }
    return granted;
  }, []);

  useEffect(() => {
    checkLocation();
  }, [checkLocation]);

  // -------------------------------------------------------------------
  // Initial load (only when location is granted)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (locationGranted !== true) return;
    fetchPosts(true);
    fetchSavedIds();
  }, [fetchPosts, fetchSavedIds, locationGranted]);

  // -------------------------------------------------------------------
  // Category change: reload without full loading spinner (prevents scroll reset)
  // -------------------------------------------------------------------
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    if (locationGranted !== true) return;
    fetchPosts(true);
  }, [category]);

  // -------------------------------------------------------------------
  // Pull to refresh
  // -------------------------------------------------------------------
  const handleRefresh = useCallback(async () => {
    const granted = await checkLocation();
    if (!granted) {
      setIsRefreshing(false);
      return;
    }
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    await Promise.all([fetchPosts(true, true), fetchSavedIds()]);
  }, [fetchPosts, fetchSavedIds, checkLocation]);

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
  // Group posts into rows and interleave ads
  // -------------------------------------------------------------------
  const feedRows = useMemo((): FeedRow[] => {
    if (posts.length === 0) return [];
    const rows: FeedRow[] = [];
    let adIndex = 0;
    let postRowCount = 0;

    for (let i = 0; i < posts.length; i += 2) {
      const rowPosts = posts.slice(i, Math.min(i + 2, posts.length));
      rows.push({ type: 'posts', items: rowPosts, id: `row-${i}` });
      postRowCount++;

      if (postRowCount % AD_ROW_INTERVAL === 0) {
        rows.push({ type: 'ad', id: `ad-${adIndex++}` });
      }
    }

    return rows;
  }, [posts]);

  // -------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------
  const renderItem = useCallback(
    ({ item }: { item: FeedRow }) => {
      if (item.type === 'ad') {
        return <NativeFeedAd />;
      }
      return (
        <View style={styles.postRow}>
          {item.items.map((post) => (
            <FeedCard
              key={post.id}
              post={post}
              isSaved={savedIds.has(post.id)}
              onPress={() => setSelectedPost(post)}
            />
          ))}
          {item.items.length === 1 && <View style={{ width: CARD_WIDTH }} />}
        </View>
      );
    },
    [savedIds],
  );

  const keyExtractor = useCallback((item: FeedRow) => item.id, []);

  const renderFooter = useCallback(() => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#FF4B6E" />
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

  const renderListHeader = useCallback(
    () => (
      <View style={styles.listHeaderWrapper}>
        {upcomingAnniversary ? (
          <View style={styles.anniversaryBanner}>
            <LinearGradient
              colors={[upcomingAnniversary.gradientColors[0], upcomingAnniversary.gradientColors[1]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.anniversaryGradient}
            >
              <View style={styles.anniversaryContent}>
                <View style={styles.anniversaryLeft}>
                  <Text style={styles.anniversaryIcon}>{upcomingAnniversary.icon}</Text>
                  <View style={styles.anniversaryTextWrap}>
                    <Text style={styles.anniversaryLabel} numberOfLines={1}>
                      {upcomingAnniversary.daysLeft === 0
                        ? `${upcomingAnniversary.label} ${t('feed.anniversaryToday', { defaultValue: '바로 오늘이에요!' })}`
                        : `${upcomingAnniversary.label} D-${upcomingAnniversary.daysLeft}`}
                    </Text>
                    <Text style={styles.anniversaryHint}>
                      {t('feed.anniversaryHint', { defaultValue: '이런 데이트로 특별하게 보내보세요' })}
                    </Text>
                  </View>
                </View>
                {isKoreaUser ? (
                  <Pressable onPress={() => WebBrowser.openBrowserAsync('https://link.inpock.co.kr/daydate')} hitSlop={8}>
                    <Animated.View style={giftShakeStyle}>
                      <Text style={styles.giftEmoji}>🎁</Text>
                    </Animated.View>
                  </Pressable>
                ) : (
                  <Animated.View style={giftShakeStyle}>
                    <Text style={styles.giftEmoji}>🎁</Text>
                  </Animated.View>
                )}
              </View>
            </LinearGradient>
          </View>
        ) : null}
      </View>
    ),
    [upcomingAnniversary, t, giftShakeStyle, isKoreaUser],
  );


  // -------------------------------------------------------------------
  // Location permission handler
  // -------------------------------------------------------------------
  const handleEnableLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      setLocationGranted(true);
    } else {
      Alert.alert(
        t('feed.locationRequired', { defaultValue: '위치 권한 필요' }),
        t('feed.locationRequiredDesc', { defaultValue: '주변 데이트 스팟을 보려면 위치 권한을 허용해주세요.' }),
        [
          { text: t('common.cancel', { defaultValue: '취소' }), style: 'cancel' },
          { text: t('feed.goToSettings', { defaultValue: '설정으로 이동' }), onPress: () => Linking.openSettings() },
        ],
      );
    }
  }, [t]);

  // -------------------------------------------------------------------
  // Location denied state
  // -------------------------------------------------------------------
  if (locationGranted === false) {
    return (
      <View style={styles.container}>
        <View style={styles.backgroundImage}>
          <ExpoImage
            source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={styles.backgroundImageStyle}
          />
          <BlurView experimentalBlurMethod="dimezisBlurView" intensity={Platform.OS === 'ios' ? 90 : 50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={StyleSheet.absoluteFill} />
        </View>
        <View style={[styles.overlay, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)' }]} />
        <View style={styles.locationDeniedContainer}>
          <MapPinOff size={rs(48)} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
          <Text style={styles.locationDeniedTitle}>
            {t('feed.locationRequired', { defaultValue: '위치 권한 필요' })}
          </Text>
          <Text style={styles.locationDeniedDesc}>
            {t('feed.locationRequiredDesc', { defaultValue: '주변 데이트 스팟을 보려면 위치 권한을 허용해주세요.' })}
          </Text>
          <Pressable style={styles.locationEnableButton} onPress={handleEnableLocation}>
            <Text style={styles.locationEnableButtonText}>
              {t('feed.enableLocation', { defaultValue: '위치 권한 허용하기' })}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------
  // Initial loading state
  // -------------------------------------------------------------------
  if (isLoading && posts.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.backgroundImage}>
          <ExpoImage
            source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            style={styles.backgroundImageStyle}
          />
          <BlurView experimentalBlurMethod="dimezisBlurView" intensity={Platform.OS === 'ios' ? 90 : 50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={StyleSheet.absoluteFill} />
        </View>
        <View style={[styles.overlay, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)' }]} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF4B6E" />
          <Text style={styles.loadingText}>{t('feed.loading')}</Text>
        </View>
      </View>
    );
  }

  // -------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <View style={styles.backgroundImage}>
        <ExpoImage
          source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          style={styles.backgroundImageStyle}
        />
        <BlurView experimentalBlurMethod="dimezisBlurView" intensity={Platform.OS === 'ios' ? 90 : 50} tint={Platform.OS === 'ios' ? 'light' : 'default'} style={StyleSheet.absoluteFill} />
      </View>
      <View style={[styles.overlay, { backgroundColor: Platform.OS === 'ios' ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.2)' }]} />

      {/* Fixed Header - stays on top while content scrolls behind */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleSection}>
            <Text style={styles.headerTitle}>{t('feed.title')}</Text>
            <Text style={styles.headerSubtitle}>{t('feed.subtitle')}</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/more/plans')}
              style={styles.savedToggle}
              hitSlop={8}
            >
              <CalendarHeart
                size={rs(18)}
                color={COLORS.white}
                strokeWidth={2}
              />
            </Pressable>
          </View>
        </View>
        <CategoryFilter selected={category} onSelect={setCategory} />
      </View>

      <FlatList
        key="feed-grid"
        data={feedRows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={renderListHeader}
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
        bounces={true}
        overScrollMode="always"
        contentContainerStyle={styles.listContent}
      />

      {/* Detail Modal */}
      <FeedDetailModal
        post={selectedPost}
        visible={!!selectedPost}
        isSaved={selectedPost ? savedIds.has(selectedPost.id) : false}
        onClose={() => setSelectedPost(null)}
        onToggleSave={() => {
          if (selectedPost) handleToggleSave(selectedPost.id);
        }}
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
    backgroundColor: COLORS.black,
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
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: 1.0 }],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  listHeaderWrapper: {
  },
  anniversaryBanner: {
    marginHorizontal: PADDING,
    marginBottom: rs(12),
    borderRadius: rs(16),
    overflow: 'hidden',
  },
  anniversaryGradient: {
    paddingHorizontal: rs(16),
    paddingVertical: rs(14),
  },
  anniversaryContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  anniversaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: rs(10),
  },
  anniversaryIcon: {
    fontSize: fp(22),
  },
  anniversaryTextWrap: {
    flex: 1,
  },
  anniversaryLabel: {
    fontSize: fp(14),
    fontWeight: '700',
    color: '#fff',
  },
  anniversaryHint: {
    fontSize: fp(11),
    color: 'rgba(255,255,255,0.8)',
    marginTop: rs(2),
  },
  giftEmoji: {
    fontSize: fp(18),
  },
  header: {
    paddingTop: rs(64),
    paddingHorizontal: rs(SPACING.lg),
    paddingBottom: rs(SPACING.lg),
    zIndex: 20,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitleSection: {
    flex: 1,
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
    color: COLORS.mutedForeground,
    fontWeight: '400',
    marginTop: rs(4),
  },
  headerActions: {
    flexDirection: 'row',
    gap: rs(8),
    alignItems: 'center',
    marginTop: rs(4),
  },
  savedToggle: {
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postRow: {
    flexDirection: 'row',
    paddingHorizontal: PADDING,
    gap: GAP,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: SP.xxxl * 4,
  },
  locationDeniedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: rs(32),
    gap: rs(12),
  },
  locationDeniedTitle: {
    fontSize: fp(18),
    fontWeight: '700',
    color: COLORS.white,
    marginTop: rs(8),
  },
  locationDeniedDesc: {
    fontSize: fp(14),
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: fp(20),
  },
  locationEnableButton: {
    marginTop: rs(8),
    backgroundColor: '#FF4B6E',
    paddingHorizontal: rs(24),
    paddingVertical: rs(12),
    borderRadius: rs(24),
  },
  locationEnableButtonText: {
    fontSize: fp(15),
    fontWeight: '600',
    color: COLORS.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingTop: SP.xxxl,
  },
  emptyText: {
    fontSize: fp(18),
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    paddingVertical: SP.xl,
    alignItems: 'center',
  },
});
