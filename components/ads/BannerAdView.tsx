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

if (!isExpoGo) {
  try {
    const ads = require('react-native-google-mobile-ads');
    BannerAd = ads.BannerAd;
    BannerAdSize = ads.BannerAdSize;
    TestIds = ads.TestIds;
    useForeground = ads.useForeground;
  } catch (e) {
    console.log('[Ads] Google Mobile Ads not available');
  }
}

// Ad unit IDs (iOS: production, Android: test until approved)
const getAdUnitIds = () => {
  const isIOS = Platform.OS === 'ios';
  return {
    HOME_BANNER: isIOS
      ? 'ca-app-pub-9357146388578422/7136705590'
      : TestIds?.BANNER || '',
    CALENDAR_BANNER: isIOS
      ? 'ca-app-pub-9357146388578422/5280698445'
      : TestIds?.BANNER || '',
    MEMORIES_BANNER: isIOS
      ? 'ca-app-pub-9357146388578422/7906861781'
      : TestIds?.BANNER || '',
  };
};

export type BannerAdPlacement = 'home' | 'calendar' | 'memories';

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
  // Temporarily disable ads on Android for production release
  if (isExpoGo || !BannerAd || Platform.OS === 'android') {
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
      case 'calendar':
        return AD_UNIT_IDS.CALENDAR_BANNER;
      case 'memories':
        return AD_UNIT_IDS.MEMORIES_BANNER;
      default:
        return TestIds?.BANNER || '';
    }
  };

  // If ad failed to load, return null (no empty space)
  if (adError) {
    return null;
  }

  // Get the banner size, default to ANCHORED_ADAPTIVE_BANNER if available
  const bannerSize = size || (BannerAdSize?.ANCHORED_ADAPTIVE_BANNER);

  return (
    <View style={[styles.container, !adLoaded && styles.hidden, style]} onLayout={handleLayout}>
      <BannerAd
        ref={bannerRef}
        unitId={getAdUnitId()}
        size={bannerSize}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => {
          console.log(`[Ads] Banner loaded for ${placement}`);
          setAdLoaded(true);
          setAdError(false);
        }}
        onAdFailedToLoad={(error: any) => {
          console.log(`[Ads] Banner failed to load for ${placement}:`, error);
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
  },
  hidden: {
    height: 0,
    opacity: 0,
  },
});
