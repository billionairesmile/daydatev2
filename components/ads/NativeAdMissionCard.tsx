import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  LayoutChangeEvent,
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
  // Dimensions must be whole numbers to prevent SDK errors (GitHub issue #700)
  const [adViewDimensions, setAdViewDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Ref to track the current ad for cleanup
  const adRef = useRef<any>(null);

  // Required for iOS to handle app state changes
  if (useForeground) {
    useForeground(() => {
      // Native ads handle foreground state internally
    });
  }

  // Capture layout dimensions (must be whole numbers)
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && adViewDimensions.width === 0) {
      const roundedWidth = Math.floor(width);
      const roundedHeight = Math.ceil(height);
      setAdViewDimensions({ width: roundedWidth, height: roundedHeight });
    }
  }, [adViewDimensions.width]);

  // Load ad immediately
  useEffect(() => {
    if (isExpoGo || !NativeAd) return;
    if (!shouldShowAds()) return;

    console.log('[Ads] Requesting native ad...');
    const NATIVE_AD_UNIT_ID = getNativeAdUnitId();

    NativeAd.createForAdRequest(NATIVE_AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    })
      .then((ad: any) => {
        console.log('[Ads] Native ad loaded successfully');
        adRef.current = ad;
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
      if (adRef.current) {
        adRef.current.destroy();
        adRef.current = null;
      }
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

  // Calculate dimensions - larger media size
  const contentPadding = 20;
  const mediaSize = Math.min(adViewDimensions.width - contentPadding * 2, 240); // Increased from 200 to 240
  const contentWidth = adViewDimensions.width - contentPadding * 2;
  // Calculate media left position (media is centered)
  const mediaLeft = (adViewDimensions.width - mediaSize) / 2;

  return (
    <View style={styles.wrapper} onLayout={handleLayout}>
      {adViewDimensions.width > 0 && adViewDimensions.height > 0 ? (
        <NativeAdView
          nativeAd={nativeAd}
          style={{
            width: adViewDimensions.width,
            height: adViewDimensions.height,
          }}
        >
          {/* AD Badge - aligned with media left edge, AdChoices auto-added at top-right by SDK */}
          <View style={[styles.adBadge, { left: mediaLeft }]}>
            <Text style={styles.adBadgeText}>AD</Text>
          </View>

          {/* Main content */}
          <View style={[styles.content, { width: adViewDimensions.width, paddingHorizontal: contentPadding }]}>
            {/* Media - larger size */}
            <View style={[styles.mediaContainer, { width: mediaSize, height: mediaSize }]}>
              <NativeMediaView style={{ width: mediaSize, height: mediaSize }} resizeMode="contain" />
            </View>

            {/* Icon + Headline */}
            <View style={[styles.row, { width: contentWidth }]}>
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
              <Text style={[styles.body, { width: contentWidth }]} numberOfLines={2} />
            </NativeAsset>

            {/* CTA Button */}
            <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
              <View style={[styles.ctaContainer, { width: contentWidth }]}>
                <Text style={styles.ctaText} />
              </View>
            </NativeAsset>
          </View>
        </NativeAdView>
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 45,
    overflow: 'hidden', // Clip content to rounded corners
  },
  content: {
    paddingTop: 54, // Space for AD badge (moved down +10)
    paddingBottom: 24,
    alignItems: 'center',
  },
  // AD Badge - left position set dynamically to align with media
  adBadge: {
    position: 'absolute',
    top: 26, // Moved down +10
    // left is set inline to align with media container
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    zIndex: 100,
  },
  adBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#333',
  },
  mediaContainer: {
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden', // Clip landscape images to container bounds
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
  ctaContainer: {
    backgroundColor: '#4285F4',
    paddingVertical: 12,
    marginTop: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 45,
  },
});
