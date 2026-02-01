import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Platform, LayoutChangeEvent } from 'react-native';
import Constants from 'expo-constants';

import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUIStore } from '@/stores/uiStore';

// Check if we're running in Expo Go (not a development build)
const isExpoGo = Constants.appOwnership === 'expo';

// Only import Google Mobile Ads when NOT in Expo Go
let BannerAd: any = null;
let BannerAdSize: any = null;
let TestIds: any = null;
let useForeground: any = null;
let mobileAds: any = null;

if (!isExpoGo) {
  try {
    const ads = require('react-native-google-mobile-ads');
    BannerAd = ads.BannerAd;
    BannerAdSize = ads.BannerAdSize;
    TestIds = ads.TestIds;
    useForeground = ads.useForeground;
    mobileAds = ads.default;

    // Initialize the SDK
    if (mobileAds) {
      mobileAds()
        .initialize()
        .catch((error: any) => {
          console.error('[Ads] Failed to initialize Google Mobile Ads SDK:', error);
        });
    }
  } catch (e) {
    console.log('[Ads] Google Mobile Ads not available');
  }
}

// Set to true to use test ads for debugging
const USE_TEST_ADS = __DEV__; // Use test ads only in development

// Ad unit IDs for iOS and Android
// iOS: 미션, 더보기 화면에는 배너 광고 없음 (Android만 표시)
const getAdUnitIds = () => {
  const isIOS = Platform.OS === 'ios';

  // Use test ads when flag is enabled
  if (USE_TEST_ADS && TestIds?.BANNER) {
    return {
      HOME_BANNER: TestIds.BANNER,
      MISSION_BANNER: isIOS ? '' : TestIds.BANNER, // iOS: 미션 배너 없음
      CALENDAR_BANNER: TestIds.BANNER,
      MEMORIES_BANNER: TestIds.BANNER,
      MORE_BANNER: isIOS ? '' : TestIds.BANNER, // iOS: 더보기 배너 없음
    };
  }

  return {
    HOME_BANNER: isIOS
      ? 'ca-app-pub-9357146388578422/7136705590'
      : 'ca-app-pub-9357146388578422/5678501308',
    MISSION_BANNER: isIOS
      ? '' // iOS: 미션 화면 배너 없음
      : 'ca-app-pub-9357146388578422/3746356935',
    CALENDAR_BANNER: isIOS
      ? 'ca-app-pub-9357146388578422/5280698445'
      : 'ca-app-pub-9357146388578422/4832501107',
    MEMORIES_BANNER: isIOS
      ? 'ca-app-pub-9357146388578422/7906861781'
      : 'ca-app-pub-9357146388578422/3215989496',
    MORE_BANNER: isIOS
      ? '' // iOS: 더보기 화면 배너 없음
      : 'ca-app-pub-9357146388578422/6840198213',
  };
};

export type BannerAdPlacement = 'home' | 'mission' | 'calendar' | 'memories' | 'more';

interface BannerAdViewProps {
  placement: BannerAdPlacement;
  style?: StyleProp<ViewStyle>;
  size?: any; // BannerAdSize when available
}

export default function BannerAdView({
  placement,
  style,
  size,
}: BannerAdViewProps) {
  const { shouldShowAds } = useSubscriptionStore();
  const setBannerAdHeight = useUIStore((state) => state.setBannerAdHeight);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adError, setAdError] = useState(false);
  const bannerRef = useRef<any>(null);

  // Track actual banner height for responsive tab bar positioning
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0 && adLoaded) {
      setBannerAdHeight(height);
    }
  }, [adLoaded, setBannerAdHeight]);

  // Required for iOS to handle app state changes - reload ad when app returns to foreground
  // Only use if useForeground is available (not in Expo Go)
  if (useForeground) {
    useForeground(() => {
      Platform.OS === 'ios' && bannerRef.current?.load();
    });
  }

  // Don't show ads in Expo Go (native module not available)
  if (isExpoGo || !BannerAd) {
    return null;
  }

  // Don't show ads for premium users
  if (!shouldShowAds()) {
    return null;
  }

  const AD_UNIT_IDS = getAdUnitIds();

  // Get ad unit ID based on placement
  const getAdUnitId = (): string => {
    switch (placement) {
      case 'home':
        return AD_UNIT_IDS.HOME_BANNER;
      case 'mission':
        return AD_UNIT_IDS.MISSION_BANNER;
      case 'calendar':
        return AD_UNIT_IDS.CALENDAR_BANNER;
      case 'memories':
        return AD_UNIT_IDS.MEMORIES_BANNER;
      case 'more':
        return AD_UNIT_IDS.MORE_BANNER;
      default:
        return TestIds?.BANNER || '';
    }
  };

  // If ad failed to load, return null (no empty space)
  if (adError) {
    return null;
  }

  // Don't render if ad unit ID is empty (iOS mission/more screens)
  const adUnitId = getAdUnitId();
  if (!adUnitId) {
    return null;
  }

  // Get the banner size, default to ANCHORED_ADAPTIVE_BANNER if available
  const bannerSize = size || (BannerAdSize?.ANCHORED_ADAPTIVE_BANNER);

  return (
    <View style={[styles.container, !adLoaded && styles.hidden, style]} onLayout={handleLayout}>
      <BannerAd
        ref={bannerRef}
        unitId={adUnitId}
        size={bannerSize}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          setAdLoaded(true);
          setAdError(false);
        }}
        onAdFailedToLoad={() => {
          setAdError(true);
          setAdLoaded(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    // zIndex higher than tab bar (100) to appear above it on Android
    zIndex: 150,
    elevation: 150, // Android shadow/layering
  },
  hidden: {
    // Use minHeight instead of height: 0 to allow ad to load
    // height: 0 can prevent ad from loading on some platforms
    minHeight: 1,
    opacity: 0,
  },
});
