import React, { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MapPin, Calendar, ExternalLink, ChevronUp, CalendarPlus, CalendarCheck, Navigation, ChevronLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { SCREEN_WIDTH, SCREEN_HEIGHT, rs, fp, ANDROID_NAV_BAR_HEIGHT } from '@/constants/design';
import type { FeedPost } from '@/types';
import { ImageCarousel } from './ImageCarousel';
import { usePlanStore } from '@/stores/planStore';
import { AddPlanBottomSheet } from '../plan/AddPlanBottomSheet';
import { getUserCountryCode } from '@/lib/locationUtils';

interface FeedDetailModalProps {
  post: FeedPost | null;
  visible: boolean;
  isSaved?: boolean;
  onClose: () => void;
  onToggleSave?: () => void;
}

const CARD_RADIUS = rs(28);
const ACCENT = '#FF4B6E';

// Suppress Yes24 error alert/confirm dialogs inside inline WebView
const ALERT_SUPPRESSION = `
(function() {
  if (window.__alertSuppressed) return;
  window.__alertSuppressed = true;
  var origAlert = window.alert;
  var origConfirm = window.confirm;
  function suppressed(msg) {
    return typeof msg === 'string' && (msg.indexOf('에러') !== -1 || msg.indexOf('조회') !== -1);
  }
  try {
    Object.defineProperty(window, 'alert', {
      value: function(msg) { if (!suppressed(msg)) origAlert.call(window, msg); },
      writable: false, configurable: true
    });
    Object.defineProperty(window, 'confirm', {
      value: function(msg) { return suppressed(msg) ? true : origConfirm.call(window, msg); },
      writable: false, configurable: true
    });
  } catch(e) {
    window.alert = function(msg) { if (!suppressed(msg)) origAlert.call(window, msg); };
    window.confirm = function(msg) { return suppressed(msg) ? true : origConfirm.call(window, msg); };
  }
})();
true;
`;
const CARD_TOP_COLLAPSED = SCREEN_HEIGHT * 0.42;
const PEEK_HEIGHT = rs(56);
const SPRING_CONFIG = { damping: 20, stiffness: 200, mass: 0.8 };
const SPRING_CONFIG_SMOOTH = { damping: 22, stiffness: 120, mass: 0.8 };

function formatDateRange(startDate?: string, endDate?: string): string | null {
  if (!startDate) return null;
  const fmt = (dateStr: string) => {
    // Append T00:00:00 to parse as local timezone instead of UTC
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}.${d.getDate()}`;
  };
  const s = fmt(startDate);
  return endDate ? `${s} - ${fmt(endDate)}` : s;
}

export function FeedDetailModal({
  post,
  visible,
  isSaved,
  onClose,
  onToggleSave,
}: FeedDetailModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Android fullScreen Modal may report insets.bottom as 0; use nav bar constant as fallback
  const bottomInset = Platform.OS === 'android'
    ? Math.max(insets.bottom, ANDROID_NAV_BAR_HEIGHT)
    : insets.bottom;

  const dateRange = useMemo(
    () => (post ? formatDateRange(post.eventStartDate, post.eventEndDate) : null),
    [post?.eventStartDate, post?.eventEndDate],
  );

  const linkUrl = post?.affiliateLink || post?.externalLink;
  const isAlreadyAdded = usePlanStore((s) => post ? s.isAlreadyAdded(post.id) : false);
  const updateStatus = usePlanStore((s) => s.updateStatus);
  const addPlan = usePlanStore((s) => s.addPlan);
  const plans = usePlanStore((s) => s.plans);
  const [showAddPlanSheet, setShowAddPlanSheet] = useState(false);
  const [cardIsDown, setCardIsDown] = useState(false);
  const [showBookingConfirm, setShowBookingConfirm] = useState(false);
  const [inlineWebViewUrl, setInlineWebViewUrl] = useState<string | null>(null);
  const inlineWebViewRef = useRef<WebView>(null);
  const [webViewLoading, setWebViewLoading] = useState(true);

  // Reset inline WebView when modal closes
  useEffect(() => {
    if (!visible) {
      setInlineWebViewUrl(null);
      setShowBookingConfirm(false);
    }
  }, [visible]);

  const handleCloseWebView = useCallback(() => {
    setInlineWebViewUrl(null);
    setTimeout(() => setShowBookingConfirm(true), 300);
  }, []);

  const handleWebViewNavChange = useCallback((navState: WebViewNavigation) => {
    if (navState.url?.includes('yes24') || navState.url?.includes('ticket.')) {
      inlineWebViewRef.current?.injectJavaScript(ALERT_SUPPRESSION);
    }
  }, []);

  const handleOpenLink = useCallback(() => {
    if (linkUrl) {
      setWebViewLoading(true);
      setInlineWebViewUrl(linkUrl);
    }
  }, [linkUrl]);

  const handleAddPlan = useCallback(() => {
    if (!isAlreadyAdded) {
      setShowAddPlanSheet(true);
    }
  }, [isAlreadyAdded]);

  const handleGetDirections = useCallback(async () => {
    if (!post?.latitude || !post?.longitude) return;
    const lat = post.latitude;
    const lng = post.longitude;
    const label = encodeURIComponent(post.locationName || '');

    const countryCode = await getUserCountryCode();
    if (countryCode === 'KR') {
      // Naver Map
      const naverUrl = `nmap://route/public?dlat=${lat}&dlng=${lng}&dname=${label}&appname=com.daydate.app`;
      const canOpen = await Linking.canOpenURL(naverUrl);
      if (canOpen) {
        Linking.openURL(naverUrl);
      } else {
        Linking.openURL(`https://map.naver.com/p/directions/-/-/${lng},${lat},${label}/-/transit`);
      }
    } else {
      // Google Maps
      const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      Linking.openURL(googleUrl);
    }
  }, [post?.latitude, post?.longitude, post?.locationName]);

  // Card position: 0 = card showing (normal), positive = card pushed down
  const cardTranslateY = useSharedValue(0);
  const cardHeight = SCREEN_HEIGHT - CARD_TOP_COLLAPSED - bottomInset;
  const maxTranslate = cardHeight - PEEK_HEIGHT;

  // Pinch-to-zoom + pan
  const imageScale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const imageTranslateX = useSharedValue(0);
  const imageTranslateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      cardTranslateY.value = 0;
      imageScale.value = 1;
      savedScale.value = 1;
      imageTranslateX.value = 0;
      imageTranslateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [visible]);

  const panStartY = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .onStart(() => {
      panStartY.value = cardTranslateY.value;
    })
    .onUpdate((e) => {
      const newY = panStartY.value + e.translationY;
      cardTranslateY.value = Math.max(0, Math.min(maxTranslate, newY));
    })
    .onEnd((e) => {
      const currentY = cardTranslateY.value;
      const isSwipingDown = e.velocityY > 0;

      if (isSwipingDown && (currentY > maxTranslate * 0.3 || e.velocityY > 500)) {
        cardTranslateY.value = withSpring(maxTranslate, SPRING_CONFIG);
      } else if (!isSwipingDown && (currentY < maxTranslate * 0.7 || e.velocityY < -500)) {
        cardTranslateY.value = withSpring(0, SPRING_CONFIG_SMOOTH);
      } else if (isSwipingDown) {
        cardTranslateY.value = withSpring(maxTranslate, SPRING_CONFIG);
      } else {
        cardTranslateY.value = withSpring(0, SPRING_CONFIG_SMOOTH);
      }
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      imageScale.value = Math.min(Math.max(savedScale.value * e.scale, 1), 4);
    })
    .onEnd(() => {
      if (imageScale.value < 1.1) {
        imageScale.value = withSpring(1, SPRING_CONFIG);
        savedScale.value = 1;
        imageTranslateX.value = withSpring(0, SPRING_CONFIG);
        imageTranslateY.value = withSpring(0, SPRING_CONFIG);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedScale.value = imageScale.value;
      }
    });

  const imagePanGesture = Gesture.Pan()
    .minPointers(1)
    .maxPointers(2)
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        imageTranslateX.value = savedTranslateX.value + e.translationX;
        imageTranslateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = imageTranslateX.value;
      savedTranslateY.value = imageTranslateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (imageScale.value > 1) {
        imageScale.value = withSpring(1, SPRING_CONFIG);
        savedScale.value = 1;
        imageTranslateX.value = withSpring(0, SPRING_CONFIG);
        imageTranslateY.value = withSpring(0, SPRING_CONFIG);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        imageScale.value = withSpring(2.5, SPRING_CONFIG);
        savedScale.value = 2.5;
      }
    });

  // Exclude imagePanGesture for carousel to avoid blocking FlatList horizontal scroll on Android
  const hasMultipleImages = post?.images && post.images.length > 1;
  const imageGesture = hasMultipleImages
    ? Gesture.Simultaneous(pinchGesture, doubleTap)
    : Gesture.Simultaneous(pinchGesture, imagePanGesture, doubleTap);

  const imageAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: imageTranslateX.value },
      { translateY: imageTranslateY.value },
      { scale: imageScale.value },
    ],
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value }],
  }));

  // Swap between drag indicator and "swipe up" hint
  const dragIndicatorOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      cardTranslateY.value,
      [0, maxTranslate * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const peekHintOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      cardTranslateY.value,
      [maxTranslate * 0.5, maxTranslate],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  // Track whether card is pushed down to make peek hint tappable
  useAnimatedReaction(
    () => cardTranslateY.value > maxTranslate * 0.7,
    (isDown, prevIsDown) => {
      if (isDown !== prevIsDown) {
        runOnJS(setCardIsDown)(isDown);
      }
    },
  );

  const handlePeekTap = useCallback(() => {
    cardTranslateY.value = withSpring(0, SPRING_CONFIG_SMOOTH);
  }, [cardTranslateY]);

  // Hide scroll content when card is swiped down
  const scrollContentOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      cardTranslateY.value,
      [0, maxTranslate * 0.6],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // Bottom bar follows card movement
  const bottomBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: cardTranslateY.value }],
  }));

  if (!post) return null;

  const hasImage = post.images && post.images.length > 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={inlineWebViewUrl ? handleCloseWebView : onClose}
    >
      <StatusBar barStyle="light-content" />
      <GestureHandlerRootView style={styles.container}>
        {/* Full-screen image - zoomable */}
        <GestureDetector gesture={imageGesture}>
          <Animated.View style={[styles.imageSection, imageAnimatedStyle]}>
            {hasImage ? (
              post.images.length > 1 ? (
                <ImageCarousel images={post.images} height={SCREEN_HEIGHT} />
              ) : (
                <Image
                  source={{ uri: post.images[0] }}
                  style={styles.heroImage}
                  contentFit="contain"
                  transition={200}
                />
              )
            ) : (
              <View style={[styles.heroImage, styles.placeholder]} />
            )}
          </Animated.View>
        </GestureDetector>

        {/* Top gradient for button visibility */}
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'transparent']}
          style={styles.topGradient}
          pointerEvents="none"
        />

        {/* Back button - white background */}
        <Pressable
          onPress={onClose}
          style={[styles.navBtn, styles.backBtn, { top: insets.top + rs(8) }]}
          hitSlop={12}
        >
          <ArrowLeft size={rs(20)} color="#333" strokeWidth={2.5} />
        </Pressable>


        {/* Draggable White Content Card */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.cardContainer,
              { top: CARD_TOP_COLLAPSED, bottom: bottomInset },
              cardAnimatedStyle,
            ]}
          >
            {/* Drag indicator (visible when card is up) */}
            <Animated.View style={[styles.dragIndicatorWrapper, dragIndicatorOpacity]}>
              <View style={styles.dragIndicator} />
            </Animated.View>

            {/* Peek hint (visible when card is down, tappable to bring card back up) */}
            <Animated.View style={[styles.peekHintWrapper, peekHintOpacity]} pointerEvents={cardIsDown ? 'auto' : 'none'}>
              <Pressable onPress={handlePeekTap} style={styles.peekHintTouchable} hitSlop={16}>
                <ChevronUp size={rs(18)} color="#999" strokeWidth={2} />
                <Text style={styles.peekHintText}>{t('feed.detail.swipeUp', { defaultValue: '' })}</Text>
              </Pressable>
            </Animated.View>

            <Animated.View style={[{ flex: 1 }, scrollContentOpacity]}>
            <ScrollView
              style={styles.cardScroll}
              bounces={false}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <View style={styles.card}>
                {/* Title */}
                <Text style={styles.title}>{post.title}</Text>

                {/* Divider */}
                <View style={styles.divider} />

                {/* Description */}
                {post.caption ? (
                  <Text style={styles.caption}>{post.caption}</Text>
                ) : null}

                {/* Location */}
                {post.locationName ? (
                  <View style={styles.locationRow}>
                    <MapPin size={rs(14)} color={ACCENT} strokeWidth={2} />
                    <Text style={styles.locationText}>{post.locationName}</Text>
                    {post.latitude && post.longitude ? (
                      <Pressable style={styles.directionsButton} onPress={handleGetDirections} hitSlop={8}>
                        <Navigation size={rs(12)} color={ACCENT} strokeWidth={2} />
                        <Text style={styles.directionsButtonText}>{t('feed.getDirections', { defaultValue: '길찾기' })}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                {/* Schedule */}
                {dateRange ? (
                  <View style={styles.scheduleRow}>
                    <Calendar size={rs(14)} color={ACCENT} strokeWidth={2} />
                    <Text style={styles.scheduleText}>{dateRange}</Text>
                  </View>
                ) : null}

                {/* Price - at the bottom of description */}
                {post.price ? (
                  <View style={styles.priceRow}>
                    <Text style={styles.priceText}>{post.price}</Text>
                  </View>
                ) : null}


                {/* Bottom spacing for CTA + safe area (Android navigation bar) */}
                <View style={{ height: (linkUrl || post.eventStartDate) ? rs(80) : rs(24) }} />
              </View>
            </ScrollView>
            </Animated.View>
          </Animated.View>
        </GestureDetector>

        {/* Bottom CTA - moves with card */}
        {(linkUrl || post.eventStartDate) ? (
          <Animated.View style={[styles.bottomBar, { bottom: bottomInset, paddingBottom: rs(16) }, bottomBarAnimatedStyle]}>
            <View style={styles.bottomBarRow}>
              {/* Plan add button */}
              {post.eventStartDate ? (
                <Pressable
                  style={[styles.planButton, isAlreadyAdded && styles.planButtonAdded]}
                  onPress={handleAddPlan}
                  disabled={isAlreadyAdded}
                >
                  {isAlreadyAdded ? (
                    <CalendarCheck size={rs(18)} color={ACCENT} strokeWidth={2} />
                  ) : (
                    <CalendarPlus size={rs(18)} color={ACCENT} strokeWidth={2} />
                  )}
                </Pressable>
              ) : null}
              {/* External link button */}
              {linkUrl ? (
                <Pressable
                  style={[styles.bookButton, { flex: 1 }]}
                  onPress={handleOpenLink}
                >
                  <ExternalLink size={rs(16)} color="#fff" strokeWidth={2} />
                  <Text style={styles.bookButtonText}>{t('feed.viewMore')}</Text>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        ) : null}

        {/* Add Plan Bottom Sheet */}
        {post ? (
          <AddPlanBottomSheet
            visible={showAddPlanSheet}
            post={post}
            onClose={() => setShowAddPlanSheet(false)}
          />
        ) : null}

        {/* Inline WebView - renders on top of modal content */}
        {inlineWebViewUrl && (
          <View style={[styles.inlineWebViewContainer, { paddingTop: insets.top }]}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.inlineWebViewHeader}>
              <Pressable onPress={handleCloseWebView} style={styles.inlineWebViewBack}>
                <ChevronLeft color="#1a1a1a" size={24} />
              </Pressable>
              <Text style={styles.inlineWebViewTitle} numberOfLines={1}>
                {post?.title || ''}
              </Text>
              <View style={styles.inlineWebViewSpacer} />
            </View>
            {webViewLoading && (
              <View style={styles.inlineWebViewLoading}>
                <View style={styles.inlineWebViewLoadingInner}>
                  <Text style={{ color: '#999', fontSize: fp(14) }}>Loading...</Text>
                </View>
              </View>
            )}
            <WebView
              ref={inlineWebViewRef}
              source={{ uri: inlineWebViewUrl }}
              style={styles.inlineWebView}
              onLoadEnd={() => setWebViewLoading(false)}
              onLoadStart={() => setWebViewLoading(true)}
              injectedJavaScriptBeforeContentLoaded={ALERT_SUPPRESSION}
              injectedJavaScript={ALERT_SUPPRESSION}
              onNavigationStateChange={handleWebViewNavChange}
            />
          </View>
        )}

        {/* Booking Confirmation */}
        {showBookingConfirm && !inlineWebViewUrl && post && (
          <View style={styles.bookingConfirmOverlay}>
            <Pressable style={styles.bookingConfirmBackdrop} onPress={() => setShowBookingConfirm(false)} />
            <View style={styles.bookingConfirmSheet}>
              <Text style={styles.bookingConfirmTitle}>
                {t('planDetail.bookingConfirm.title')}
              </Text>
              <Text style={styles.bookingConfirmDesc}>
                {t('planDetail.bookingConfirm.desc')}
              </Text>
              <View style={styles.bookingConfirmButtons}>
                <Pressable
                  style={styles.bookingConfirmBtnSecondary}
                  onPress={() => setShowBookingConfirm(false)}
                >
                  <Text style={styles.bookingConfirmBtnSecondaryText}>
                    {t('planDetail.bookingConfirm.notYet')}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.bookingConfirmBtnPrimary}
                  onPress={async () => {
                    const existingPlan = plans.find((p) => p.feedPostId === post.id && (p.status === 'interested' || p.status === 'booked'));
                    if (existingPlan && existingPlan.status === 'interested') {
                      await updateStatus(existingPlan.id, 'booked');
                    } else if (!existingPlan) {
                      const newPlan = await addPlan(post);
                      if (newPlan) await updateStatus(newPlan.id, 'booked');
                    }
                    setShowBookingConfirm(false);
                  }}
                >
                  <Text style={styles.bookingConfirmBtnPrimaryText}>
                    {t('planDetail.bookingConfirm.yes')}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // --- Image (always full screen) ---
  imageSection: {
    ...StyleSheet.absoluteFillObject,
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  placeholder: {
    backgroundColor: '#222',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: rs(100),
  },
  // --- Nav buttons (both white bg) ---
  navBtn: {
    position: 'absolute',
    width: rs(38),
    height: rs(38),
    borderRadius: rs(19),
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 10,
  },
  backBtn: {
    left: rs(16),
  },
  // --- Card Container ---
  cardContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  dragIndicatorWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: rs(10),
    paddingBottom: rs(4),
    zIndex: 2,
  },
  dragIndicator: {
    width: rs(36),
    height: rs(4),
    borderRadius: rs(2),
    backgroundColor: '#ddd',
  },
  peekHintWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: rs(8),
    paddingBottom: rs(4),
    zIndex: 2,
  },
  peekHintTouchable: {
    alignItems: 'center',
    paddingHorizontal: rs(24),
    paddingVertical: rs(4),
  },
  peekHintText: {
    fontSize: fp(10),
    color: '#999',
    marginTop: rs(2),
  },
  cardScroll: {
    flex: 1,
    marginTop: rs(18),
  },
  card: {
    paddingHorizontal: rs(24),
    paddingTop: rs(8),
  },
  title: {
    fontSize: fp(22),
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: fp(28),
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: rs(16),
  },
  caption: {
    fontSize: fp(14),
    lineHeight: fp(22),
    color: '#666',
    marginBottom: rs(16),
  },
  // --- Location & Schedule ---
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    marginBottom: rs(10),
  },
  locationText: {
    fontSize: fp(13),
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
    paddingHorizontal: rs(10),
    paddingVertical: rs(4),
    borderRadius: rs(12),
    borderWidth: 1,
    borderColor: ACCENT,
  },
  directionsButtonText: {
    fontSize: fp(11),
    fontWeight: '600',
    color: ACCENT,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(6),
    marginBottom: rs(10),
  },
  scheduleText: {
    fontSize: fp(13),
    color: '#666',
    fontWeight: '500',
  },
  // --- Price ---
  priceRow: {
    marginTop: rs(8),
    marginBottom: rs(12),
  },
  priceText: {
    fontSize: fp(20),
    fontWeight: '700',
    color: ACCENT,
  },
  // --- Bottom Bar ---
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: rs(24),
    paddingTop: rs(12),
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    zIndex: 20,
  },
  bottomBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(10),
  },
  planButton: {
    width: rs(50),
    height: rs(50),
    borderRadius: rs(25),
    borderWidth: 2,
    borderColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  planButtonAdded: {
    opacity: 0.5,
    borderColor: '#ccc',
  },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rs(8),
    backgroundColor: ACCENT,
    paddingVertical: rs(14),
    borderRadius: rs(28),
  },
  bookButtonText: {
    fontSize: fp(16),
    fontWeight: '700',
    color: '#fff',
  },
  inlineWebViewContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    zIndex: 200,
  },
  inlineWebViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rs(12),
    paddingVertical: rs(12),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  inlineWebViewBack: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineWebViewTitle: {
    fontSize: fp(16),
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  inlineWebViewSpacer: {
    width: 40,
  },
  inlineWebView: {
    flex: 1,
  },
  inlineWebViewLoading: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  inlineWebViewLoadingInner: {
    padding: rs(16),
  },
  bookingConfirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  bookingConfirmBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bookingConfirmSheet: {
    backgroundColor: '#fff',
    borderRadius: rs(24),
    padding: rs(24),
    marginHorizontal: rs(32),
    width: '85%',
  },
  bookingConfirmTitle: {
    fontSize: fp(20),
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: rs(8),
  },
  bookingConfirmDesc: {
    fontSize: fp(14),
    color: '#888',
    textAlign: 'center',
    marginBottom: rs(24),
  },
  bookingConfirmButtons: {
    flexDirection: 'row',
    gap: rs(12),
  },
  bookingConfirmBtnSecondary: {
    flex: 1,
    paddingVertical: rs(14),
    borderRadius: rs(14),
    backgroundColor: '#f2f2f2',
    alignItems: 'center',
  },
  bookingConfirmBtnSecondaryText: {
    fontSize: fp(15),
    fontWeight: '600',
    color: '#666',
  },
  bookingConfirmBtnPrimary: {
    flex: 1,
    paddingVertical: rs(14),
    borderRadius: rs(14),
    backgroundColor: ACCENT,
    alignItems: 'center',
  },
  bookingConfirmBtnPrimaryText: {
    fontSize: fp(15),
    fontWeight: '700',
    color: '#fff',
  },
});
