import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
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

// Ad unit ID (iOS: production, Android: test until approved)
const getNativeAdUnitId = () => {
  return Platform.OS === 'ios'
    ? 'ca-app-pub-9357146388578422/7715290092'
    : TestIds?.NATIVE || '';
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
  // Temporarily disable ads on Android for production release
  if (isExpoGo || !NativeAd || !NativeAdView || Platform.OS === 'android') {
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

  // Calculate dimensions - full width media for landscape ads
  const contentPadding = 16;
  const contentWidth = adViewDimensions.width - contentPadding * 2;
  // Media container dimensions
  const mediaWidth = contentWidth;
  // Reserve space for: paddingTop + row + body + cta + paddingBottom
  // Android: increased to ensure CTA button is visible in smaller card
  const reservedSpace = Platform.OS === 'android' ? 200 : 200;
  const minMediaHeight = Platform.OS === 'android' ? 120 : 180;
  const mediaHeight = Math.max(Math.floor(adViewDimensions.height - reservedSpace), minMediaHeight);

  // Calculate optimal NativeMediaView size based on ad's aspect ratio
  // This ensures the entire ad image is visible within the container
  const adAspectRatio = nativeAd.mediaContent?.aspectRatio || 1.91; // Default to 1.91:1 (common ad ratio)
  const containerAspectRatio = mediaWidth / mediaHeight;

  let scaledMediaWidth: number;
  let scaledMediaHeight: number;

  if (adAspectRatio > containerAspectRatio) {
    // Ad is wider than container - fit by width
    scaledMediaWidth = Math.floor(mediaWidth);
    scaledMediaHeight = Math.floor(mediaWidth / adAspectRatio);
  } else {
    // Ad is taller than container - fit by height
    scaledMediaHeight = Math.floor(mediaHeight);
    scaledMediaWidth = Math.floor(mediaHeight * adAspectRatio);
  }

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
          {/* AD Badge - top left */}
          <View style={[styles.adBadge, { left: contentPadding + 8 }]}>
            <Text style={styles.adBadgeText}>AD</Text>
          </View>

          {/* Main content */}
          <View style={[styles.content, { width: adViewDimensions.width, paddingHorizontal: contentPadding }]}>
            {/* Media - full width, landscape friendly with centered content */}
            <View style={[styles.mediaContainer, { width: mediaWidth, height: mediaHeight }]}>
              <NativeMediaView
                style={{ width: scaledMediaWidth, height: scaledMediaHeight }}
                resizeMode="contain"
              />
            </View>

            {/* Icon + Headline */}
            <View style={[styles.row, { width: contentWidth }]}>
              {nativeAd.icon && (
                <NativeAsset assetType={NativeAssetType.ICON}>
                  <Image
                    source={{ uri: nativeAd.icon.url }}
                    style={styles.icon}
                  />
                </NativeAsset>
              )}
              <View style={styles.textWrap}>
                <NativeAsset assetType={NativeAssetType.HEADLINE}>
                  <Text style={styles.headline} numberOfLines={1}>
                    {nativeAd.headline}
                  </Text>
                </NativeAsset>
                {nativeAd.advertiser && (
                  <NativeAsset assetType={NativeAssetType.ADVERTISER}>
                    <Text style={styles.advertiser} numberOfLines={1}>
                      {nativeAd.advertiser}
                    </Text>
                  </NativeAsset>
                )}
              </View>
            </View>

            {/* Body */}
            {nativeAd.body && (
              <NativeAsset assetType={NativeAssetType.BODY}>
                <Text style={[styles.body, { width: contentWidth }]} numberOfLines={2}>
                  {nativeAd.body}
                </Text>
              </NativeAsset>
            )}

            {/* CTA Button */}
            {nativeAd.callToAction && (
              <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
                <Text style={styles.ctaButton} numberOfLines={1}>
                  {nativeAd.callToAction}
                </Text>
              </NativeAsset>
            )}
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
    overflow: 'hidden',
  },
  content: {
    paddingTop: Platform.OS === 'android' ? 40 : 48,
    paddingBottom: Platform.OS === 'android' ? 12 : 16,
    alignItems: 'center',
  },
  adBadge: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 16 : 20,
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
    backgroundColor: '#000000',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Platform.OS === 'android' ? 10 : 12,
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
    marginTop: Platform.OS === 'android' ? 4 : 6,
  },
  ctaButton: {
    alignSelf: 'stretch',
    backgroundColor: '#4285F4',
    paddingVertical: Platform.OS === 'android' ? 10 : 12,
    paddingHorizontal: Platform.OS === 'android' ? 14 : 16,
    marginTop: Platform.OS === 'android' ? 10 : 12,
    borderRadius: Platform.OS === 'android' ? 7 : 8,
    color: COLORS.white,
    fontSize: Platform.OS === 'android' ? 12 : 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 45,
  },
});
