import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import Constants from 'expo-constants';

import { COLORS } from '@/constants/design';
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
    <View style={styles.wrapper}>
      <NativeAdView nativeAd={nativeAd} style={styles.nativeAdView}>
        {/* AD Badge */}
        <View style={styles.adBadge}>
          <Text style={styles.adBadgeText}>AD</Text>
        </View>

        {/* Content Container with safe padding */}
        <View style={styles.content}>
          {/* Media */}
          <View style={styles.media}>
            <NativeMediaView style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          </View>

          {/* Icon + Headline */}
          <View style={styles.row}>
            <NativeAsset assetType={NativeAssetType.ICON}>
              <View style={styles.icon} />
            </NativeAsset>
            <View style={styles.textWrap}>
              <NativeAsset assetType={NativeAssetType.HEADLINE}>
                <Text style={styles.headline} numberOfLines={1} />
              </NativeAsset>
              <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                <Text style={styles.advertiser} numberOfLines={1} />
              </NativeAsset>
            </View>
          </View>

          {/* Body */}
          <NativeAsset assetType={NativeAssetType.BODY}>
            <Text style={styles.body} numberOfLines={2} />
          </NativeAsset>

          {/* CTA Button */}
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Text style={styles.cta} />
          </NativeAsset>
        </View>
      </NativeAdView>
    </View>
  );
}

// Card dimensions: 468px height, ~300px width, borderRadius 45
// Safe area padding to avoid corner clipping
const SAFE_PADDING = 20;

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#000000',
  },
  nativeAdView: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    padding: SAFE_PADDING,
  },
  adBadge: {
    position: 'absolute',
    top: SAFE_PADDING + 4,
    left: SAFE_PADDING + 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    zIndex: 10,
  },
  adBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#555',
  },
  media: {
    flex: 1,
    maxHeight: 300,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  icon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  textWrap: {
    flex: 1,
  },
  headline: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: '600',
  },
  advertiser: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
  body: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 14,
    marginTop: 6,
  },
  cta: {
    backgroundColor: '#4285F4',
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 12,
    marginTop: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
