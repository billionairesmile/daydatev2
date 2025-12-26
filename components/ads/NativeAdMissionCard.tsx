import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import Constants from 'expo-constants';

import { COLORS, SPACING } from '@/constants/design';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

// Check if we're running in Expo Go (not a development build)
const isExpoGo = Constants.appOwnership === 'expo';

// Only import Google Mobile Ads when NOT in Expo Go
let NativeAd: any = null;
let NativeAdView: any = null;
let NativeMediaView: any = null;
let NativeAsset: any = null;
let NativeAssetType: any = null;
let TestIds: any = null;
let useForeground: any = null;

if (!isExpoGo) {
  try {
    const ads = require('react-native-google-mobile-ads');
    NativeAd = ads.NativeAd;
    NativeAdView = ads.NativeAdView;
    NativeMediaView = ads.NativeMediaView;
    NativeAsset = ads.NativeAsset;
    NativeAssetType = ads.NativeAssetType;
    TestIds = ads.TestIds;
    useForeground = ads.useForeground;
  } catch (e) {
    console.log('[Ads] Google Mobile Ads not available');
  }
}

// Fixed card dimensions matching mission card
const CARD_HEIGHT = 468;
const CARD_MARGIN = 10;

// Ad unit ID - replace with actual ID in production
const getNativeAdUnitId = () => {
  if (!TestIds) return '';
  return Platform.select({
    ios: TestIds.NATIVE,
    android: TestIds.NATIVE,
  }) || TestIds.NATIVE;
};

interface NativeAdMissionCardProps {
  onAdLoaded?: () => void;
  onAdFailed?: () => void;
  cardWidth: number;
}

export default function NativeAdMissionCard({
  onAdLoaded,
  onAdFailed,
  cardWidth,
}: NativeAdMissionCardProps) {
  const { shouldShowAds } = useSubscriptionStore();
  const [nativeAd, setNativeAd] = useState<any>(null);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adError, setAdError] = useState(false);

  // Required for iOS to handle app state changes
  if (useForeground) {
    useForeground(() => {
      // Native ads handle foreground state internally
    });
  }

  useEffect(() => {
    // Don't load ads in Expo Go or if NativeAd is not available
    if (isExpoGo || !NativeAd) {
      return;
    }

    // Don't load ads for premium users
    if (!shouldShowAds()) {
      return;
    }

    const NATIVE_AD_UNIT_ID = getNativeAdUnitId();

    NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    })
      .then((ad: any) => {
        console.log('[Ads] Native ad loaded');
        setNativeAd(ad);
        setAdLoaded(true);
        setAdError(false);
        onAdLoaded?.();
      })
      .catch((error: any) => {
        console.error('[Ads] Native ad failed to load:', error);
        setAdError(true);
        setAdLoaded(false);
        onAdFailed?.();
      });

    return () => {
      nativeAd?.destroy();
    };
  }, [shouldShowAds]);

  // Don't show ads in Expo Go (native module not available)
  if (isExpoGo || !NativeAd || !NativeAdView) {
    return null;
  }

  // Don't show ads for premium users
  if (!shouldShowAds()) {
    return null;
  }

  // If ad failed to load, return null (no empty space)
  if (adError || !adLoaded || !nativeAd) {
    return null;
  }

  return (
    <NativeAdView
      nativeAd={nativeAd}
      style={[styles.nativeAdContainer, { width: cardWidth }]}
    >
      {/* AD Badge at top left */}
      <View style={styles.adBadge}>
        <Text style={styles.adBadgeText}>AD</Text>
      </View>

      {/* Media with contain mode - centered */}
      <View style={styles.mediaContainer}>
        <NativeMediaView
          style={styles.mediaView}
          resizeMode="contain"
        />
      </View>

      {/* Content section - centered */}
      <View style={styles.contentSection}>
        {/* Headline */}
        <NativeAsset assetType={NativeAssetType.HEADLINE}>
          <Text style={styles.headlineText} numberOfLines={2} />
        </NativeAsset>

        {/* Body */}
        <NativeAsset assetType={NativeAssetType.BODY}>
          <Text style={styles.bodyText} numberOfLines={3} />
        </NativeAsset>

        {/* Advertiser */}
        <NativeAsset assetType={NativeAssetType.ADVERTISER}>
          <Text style={styles.advertiserText} numberOfLines={1} />
        </NativeAsset>
      </View>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  nativeAdContainer: {
    height: CARD_HEIGHT,
    marginHorizontal: CARD_MARGIN,
    borderRadius: 45,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
    padding: 24,
    alignItems: 'center',
  },
  adBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 12,
  },
  adBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#666',
  },
  mediaContainer: {
    flex: 1,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#2a2a3e',
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaView: {
    width: '100%',
    height: '100%',
  },
  contentSection: {
    width: '100%',
    paddingBottom: 4,
  },
  headlineText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 22,
    textAlign: 'left',
  },
  bodyText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 16,
    marginBottom: 6,
    textAlign: 'left',
  },
  advertiserText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
    textAlign: 'left',
  },
});
