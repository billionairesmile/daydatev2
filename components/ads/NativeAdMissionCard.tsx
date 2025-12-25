import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Constants from 'expo-constants';

import { COLORS, SPACING, RADIUS, SHADOWS } from '@/constants/design';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - SPACING.lg * 2;
const CARD_HEIGHT = CARD_WIDTH * 1.2; // Match mission card aspect ratio

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
}

export default function NativeAdMissionCard({
  onAdLoaded,
  onAdFailed,
}: NativeAdMissionCardProps) {
  const { shouldShowAds } = useSubscriptionStore();
  const [nativeAd, setNativeAd] = useState<any>(null);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adError, setAdError] = useState(false);

  // Required for iOS to handle app state changes
  // Only use if useForeground is available (not in Expo Go)
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

    // createForAdRequest returns a promise that resolves with the loaded ad
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
      style={styles.container}
    >
      <View style={styles.card}>
        {/* Ad Media/Image - mimics mission card image area */}
        <View style={styles.imageContainer}>
          <NativeMediaView style={styles.mediaView} />
          {/* Ad Badge */}
          <View style={styles.adBadge}>
            <Text style={styles.adBadgeText}>AD</Text>
          </View>
        </View>

        {/* Content Area - mimics mission card content */}
        <BlurView intensity={25} tint="dark" style={styles.contentContainer}>
          {/* Headline */}
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={styles.headline} numberOfLines={2} />
          </NativeAsset>

          {/* Body/Description */}
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text style={styles.body} numberOfLines={2} />
          </NativeAsset>

          {/* Call to Action Button */}
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <View style={styles.ctaButton}>
              <Text style={styles.ctaText} />
            </View>
          </NativeAsset>

          {/* Advertiser/Icon Row */}
          <View style={styles.advertiserRow}>
            <NativeAsset assetType={NativeAssetType.ICON}>
              <Image style={styles.icon} />
            </NativeAsset>
            <NativeAsset assetType={NativeAssetType.ADVERTISER}>
              <Text style={styles.advertiser} numberOfLines={1} />
            </NativeAsset>
          </View>
        </BlurView>
      </View>
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  card: {
    width: '100%',
    height: CARD_HEIGHT,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.glass.black40,
    ...SHADOWS.md,
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
  },
  mediaView: {
    width: '100%',
    height: '100%',
  },
  adBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#666',
  },
  contentContainer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.glass.white10,
  },
  headline: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  body: {
    fontSize: 14,
    color: COLORS.text.secondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  ctaButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  advertiserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  icon: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  advertiser: {
    fontSize: 12,
    color: COLORS.text.tertiary,
    flex: 1,
  },
});
