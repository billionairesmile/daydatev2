import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Check if we're running in Expo Go (not a development build)
const isExpoGo = Constants.appOwnership === 'expo';

// Only import Google Mobile Ads when NOT in Expo Go
let RewardedAd: any = null;
let RewardedAdEventType: any = null;
let AdEventType: any = null;
let TestIds: any = null;

if (!isExpoGo) {
  try {
    const ads = require('react-native-google-mobile-ads');
    RewardedAd = ads.RewardedAd;
    RewardedAdEventType = ads.RewardedAdEventType;
    AdEventType = ads.AdEventType;
    TestIds = ads.TestIds;
  } catch (e) {
    console.log('[RewardedAd] Google Mobile Ads not available');
  }
}

// Ad unit IDs for iOS and Android
const getRewardedAdUnitId = () => {
  return Platform.OS === 'ios'
    ? 'ca-app-pub-9357146388578422/5381012045'
    : 'ca-app-pub-9357146388578422/2294340749';
};

interface RewardedAdCallbacks {
  onAdLoaded?: () => void;
  onAdFailedToLoad?: (error: any) => void;
  onAdClosed?: () => void;
  onEarnedReward?: (reward: { type: string; amount: number }) => void;
}

class RewardedAdManager {
  private rewardedAd: any = null;
  private isLoading = false;
  private isLoaded = false;
  private callbacks: RewardedAdCallbacks = {};
  private unsubscribeLoaded: (() => void) | null = null;
  private unsubscribeClosed: (() => void) | null = null;
  private unsubscribeEarnedReward: (() => void) | null = null;
  private unsubscribeError: (() => void) | null = null;

  /**
   * Check if rewarded ads are available (not in Expo Go)
   */
  isAvailable(): boolean {
    return !isExpoGo && RewardedAd !== null;
  }

  /**
   * Load a rewarded ad
   */
  async load(callbacks?: RewardedAdCallbacks): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[RewardedAd] Not available (Expo Go or module not loaded)');
      callbacks?.onAdFailedToLoad?.({ message: 'Rewarded ads not available' });
      return false;
    }

    if (this.isLoading) {
      console.log('[RewardedAd] Already loading');
      return false;
    }

    if (this.isLoaded) {
      console.log('[RewardedAd] Ad already loaded');
      callbacks?.onAdLoaded?.();
      return true;
    }

    this.callbacks = callbacks || {};

    try {
      // Clean up any previous ad
      this.cleanup();

      // Set isLoading AFTER cleanup (cleanup resets it to false)
      this.isLoading = true;

      const adUnitId = getRewardedAdUnitId();
      console.log('[RewardedAd] Loading ad with unit ID:', adUnitId);

      this.rewardedAd = RewardedAd.createForAdRequest(adUnitId, {
        requestNonPersonalizedAdsOnly: true,
      });

      return new Promise((resolve) => {
        // Subscribe to loaded event
        this.unsubscribeLoaded = this.rewardedAd.addAdEventListener(
          RewardedAdEventType.LOADED,
          () => {
            console.log('[RewardedAd] Ad loaded successfully');
            this.isLoading = false;
            this.isLoaded = true;
            this.callbacks.onAdLoaded?.();
            resolve(true);
          }
        );

        // Subscribe to closed event (CLOSED is in AdEventType, not RewardedAdEventType)
        this.unsubscribeClosed = this.rewardedAd.addAdEventListener(
          AdEventType.CLOSED,
          () => {
            console.log('[RewardedAd] Ad closed');
            this.isLoaded = false;
            this.callbacks.onAdClosed?.();
          }
        );

        // Subscribe to earned reward event
        this.unsubscribeEarnedReward = this.rewardedAd.addAdEventListener(
          RewardedAdEventType.EARNED_REWARD,
          (reward: { type: string; amount: number }) => {
            console.log('[RewardedAd] User earned reward:', reward);
            this.callbacks.onEarnedReward?.(reward);
          }
        );

        // Subscribe to error event - handles immediate load failures
        this.unsubscribeError = this.rewardedAd.addAdEventListener(
          AdEventType.ERROR,
          (error: any) => {
            console.log('[RewardedAd] Ad load error:', error);
            this.isLoading = false;
            this.isLoaded = false;
            this.callbacks.onAdFailedToLoad?.(error);
            resolve(false);
          }
        );

        // Start loading
        this.rewardedAd.load();

        // Timeout after 30 seconds
        setTimeout(() => {
          if (this.isLoading) {
            console.log('[RewardedAd] Load timeout');
            this.isLoading = false;
            this.callbacks.onAdFailedToLoad?.({ message: 'Load timeout' });
            resolve(false);
          }
        }, 30000);
      });
    } catch (error) {
      console.error('[RewardedAd] Error loading ad:', error);
      this.isLoading = false;
      this.callbacks.onAdFailedToLoad?.(error);
      return false;
    }
  }

  /**
   * Show the loaded rewarded ad
   */
  async show(): Promise<boolean> {
    if (!this.isAvailable()) {
      console.log('[RewardedAd] Not available');
      return false;
    }

    if (!this.isLoaded || !this.rewardedAd) {
      console.log('[RewardedAd] No ad loaded');
      return false;
    }

    try {
      console.log('[RewardedAd] Showing ad...');
      await this.rewardedAd.show();
      return true;
    } catch (error) {
      console.error('[RewardedAd] Error showing ad:', error);
      return false;
    }
  }

  /**
   * Load and show ad in one call
   */
  async loadAndShow(callbacks?: RewardedAdCallbacks): Promise<boolean> {
    const loaded = await this.load(callbacks);
    if (loaded) {
      return await this.show();
    }
    return false;
  }

  /**
   * Check if an ad is loaded and ready to show
   */
  isReady(): boolean {
    return this.isLoaded && this.rewardedAd !== null;
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.unsubscribeLoaded?.();
    this.unsubscribeClosed?.();
    this.unsubscribeEarnedReward?.();
    this.unsubscribeError?.();
    this.unsubscribeLoaded = null;
    this.unsubscribeClosed = null;
    this.unsubscribeEarnedReward = null;
    this.unsubscribeError = null;
    this.rewardedAd = null;
    this.isLoaded = false;
    this.isLoading = false;
  }
}

// Export singleton instance
export const rewardedAdManager = new RewardedAdManager();

export default rewardedAdManager;
