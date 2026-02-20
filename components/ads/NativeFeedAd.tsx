import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Constants from 'expo-constants';
import { SCREEN_WIDTH } from '@/constants/design';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

// Check if we're running in Expo Go (not a development build)
const isExpoGo = Constants.appOwnership === 'expo';

// Dynamically import native ad modules
let NativeAd: any = null;
let NativeAdView: any = null;
let NativeAsset: any = null;
let NativeAssetType: any = null;
let NativeMediaView: any = null;
let TestIds: any = null;

if (!isExpoGo) {
  try {
    const ads = require('react-native-google-mobile-ads');
    NativeAd = ads.NativeAd;
    NativeAdView = ads.NativeAdView;
    NativeAsset = ads.NativeAsset;
    NativeAssetType = ads.NativeAssetType;
    NativeMediaView = ads.NativeMediaView;
    TestIds = ads.TestIds;
  } catch (e) {
    console.log('[NativeFeedAd] Google Mobile Ads not available');
  }
}

const USE_TEST_ADS = __DEV__;

// Match SavedFeedCard dimensions exactly (full width, 2x regular FeedCard)
const CARD_PADDING = 16;
const AD_WIDTH = SCREEN_WIDTH - CARD_PADDING * 2;
const AD_IMAGE_HEIGHT = AD_WIDTH * 0.65;

function getAdUnitId(): string {
  if (USE_TEST_ADS && TestIds?.NATIVE) {
    return TestIds.NATIVE;
  }
  return Platform.OS === 'ios'
    ? 'ca-app-pub-9357146388578422/4671047122'
    : 'ca-app-pub-9357146388578422/1046837846';
}

export default function NativeFeedAd() {
  const { shouldShowAds } = useSubscriptionStore();
  const [nativeAd, setNativeAd] = useState<any>(null);
  const [adError, setAdError] = useState(false);

  const loadAd = useCallback(async () => {
    if (!NativeAd || isExpoGo) return;
    try {
      const ad = await NativeAd.createForAdRequest(getAdUnitId(), {
        requestNonPersonalizedAdsOnly: true,
      });
      setNativeAd(ad);
      setAdError(false);
    } catch (e) {
      console.warn('[NativeFeedAd] Failed to load:', e);
      setAdError(true);
    }
  }, []);

  useEffect(() => {
    loadAd();
    return () => {
      if (nativeAd) {
        try { nativeAd.destroy(); } catch (_) {}
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Don't render if ads shouldn't show
  if (!shouldShowAds() || isExpoGo || !NativeAdView || !nativeAd || adError) {
    return null;
  }

  const iconUri = nativeAd.icon?.uri;
  const callToAction = nativeAd.callToAction || '';

  return (
    <NativeAdView nativeAd={nativeAd} style={styles.card}>
      {/* Media - fixed container with contain to show full image without cropping */}
      <View style={styles.imageContainer}>
        {nativeAd.mediaContent ? (
          <NativeMediaView
            style={styles.media}
            resizeMode="contain"
          />
        ) : iconUri ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: iconUri }} style={styles.media} contentFit="contain" />
          </NativeAsset>
        ) : (
          <View style={[styles.media, styles.placeholder]} />
        )}
        {/* Ad badge */}
        <View style={styles.adBadge}>
          <Text style={styles.adBadgeText}>AD</Text>
        </View>
      </View>

      {/* CTA button only */}
      {callToAction ? (
        <View style={styles.ctaContainer}>
          <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
            <Pressable style={styles.ctaButton}>
              <Text style={styles.ctaText} numberOfLines={1}>{callToAction}</Text>
            </Pressable>
          </NativeAsset>
        </View>
      ) : null}
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: CARD_PADDING,
    marginBottom: 14,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  imageContainer: {
    width: AD_WIDTH,
    height: AD_IMAGE_HEIGHT,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  adBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ctaContainer: {
    padding: 14,
  },
  ctaButton: {
    backgroundColor: '#FF4B6E',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
