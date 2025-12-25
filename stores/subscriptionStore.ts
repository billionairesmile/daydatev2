import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Check if we're running in Expo Go (not a development build)
const isExpoGo = Constants.appOwnership === 'expo';

// Only import RevenueCat when NOT in Expo Go
let Purchases: any = null;
let LOG_LEVEL: any = null;

if (!isExpoGo) {
  try {
    const revenueCat = require('react-native-purchases');
    Purchases = revenueCat.default;
    LOG_LEVEL = revenueCat.LOG_LEVEL;
  } catch (e) {
    console.log('[Subscription] RevenueCat not available');
  }
}

// Type imports for TypeScript (these are type-only, no runtime impact)
import type {
  PurchasesPackage,
  CustomerInfo,
  PurchasesOfferings,
} from 'react-native-purchases';

// RevenueCat configuration
const REVENUECAT_API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS || '';
const REVENUECAT_API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || '';
const ENTITLEMENT_ID = 'premium';

// Product identifiers
export const PRODUCT_IDS = {
  MONTHLY: 'daydate_monthly',
  ANNUAL: 'daydate_annual',
} as const;

// Subscription limits
export const SUBSCRIPTION_LIMITS = {
  free: {
    maxGenerationsPerDay: 1,
    maxCompletionsPerDay: 1,
    maxBookmarks: 5,
    maxAlbums: 5,
    missionsPerGeneration: 3,
    showAds: true,
    homeFrameOptions: ['polaroid'] as const,
  },
  premium: {
    maxGenerationsPerDay: 1,
    maxCompletionsPerDay: Infinity,
    maxBookmarks: Infinity,
    maxAlbums: Infinity,
    missionsPerGeneration: 6,
    showAds: false,
    homeFrameOptions: ['polaroid', 'calendar'] as const,
  },
} as const;

export type SubscriptionPlan = 'free' | 'monthly' | 'annual';
export type HomeFrameOption = 'polaroid' | 'calendar';

interface DailyUsage {
  generationCount: number;
  completionCount: number;
  usageDate: string; // YYYY-MM-DD format
}

interface SubscriptionState {
  // Subscription status
  isPremium: boolean;
  plan: SubscriptionPlan;
  expiryDate: Date | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // RevenueCat data
  offerings: PurchasesOfferings | null;
  customerInfo: CustomerInfo | null;

  // Daily usage tracking
  dailyUsage: DailyUsage | null;

  // Partner premium status (for couple premium check)
  partnerIsPremium: boolean;

  // Hydration state
  _hasHydrated: boolean;
}

interface SubscriptionActions {
  // Initialization
  initializeRevenueCat: (userId: string) => Promise<void>;
  refreshCustomerInfo: () => Promise<void>;
  loadOfferings: () => Promise<void>;

  // Purchase actions
  purchaseMonthly: () => Promise<boolean>;
  purchaseAnnual: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  openSubscriptionManagement: () => void;

  // Feature checks
  canGenerateMissions: (coupleId: string) => Promise<boolean>;
  canCompleteMission: (coupleId: string) => Promise<boolean>;
  canBookmarkMission: (currentBookmarkCount: number) => boolean;
  canCreateAlbum: (currentAlbumCount: number) => boolean;
  canEditAlbum: (albumIndex: number, totalAlbums: number) => boolean;
  isAlbumReadOnly: (albumIndex: number, totalAlbums: number) => boolean;
  shouldShowAds: () => boolean;
  getAvailableFrameOptions: () => HomeFrameOption[];

  // Usage tracking
  incrementGenerationCount: (coupleId: string) => Promise<boolean>;
  incrementCompletionCount: (coupleId: string) => Promise<boolean>;
  loadDailyUsage: (coupleId: string) => Promise<void>;

  // Partner premium sync
  setPartnerIsPremium: (isPremium: boolean) => void;
  checkCouplePremium: (coupleId: string) => Promise<boolean>;

  // Sync with database
  syncWithDatabase: () => Promise<void>;

  // State management
  setHasHydrated: (hasHydrated: boolean) => void;
  reset: () => void;
}

const initialState: SubscriptionState = {
  isPremium: false,
  plan: 'free',
  expiryDate: null,
  isLoading: false,
  isInitialized: false,
  error: null,
  offerings: null,
  customerInfo: null,
  dailyUsage: null,
  partnerIsPremium: false,
  _hasHydrated: false,
};

// Helper: Get today's date string in YYYY-MM-DD format
const getTodayString = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// Helper: Check if date string is today
const isToday = (dateString: string): boolean => {
  return dateString === getTodayString();
};

export const useSubscriptionStore = create<SubscriptionState & SubscriptionActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Initialize RevenueCat with user ID
      initializeRevenueCat: async (userId: string) => {
        try {
          set({ isLoading: true, error: null });

          // Skip RevenueCat in Expo Go
          if (isExpoGo || !Purchases) {
            console.log('[Subscription] RevenueCat not available (Expo Go or native module missing), using free plan');
            set({ isLoading: false, isInitialized: true });
            return;
          }

          const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

          if (!apiKey) {
            console.log('[Subscription] RevenueCat API key not configured, using free plan');
            set({ isLoading: false, isInitialized: true });
            return;
          }

          // Configure RevenueCat
          Purchases.setLogLevel(LOG_LEVEL.DEBUG);
          await Purchases.configure({ apiKey, appUserID: userId });

          // Get initial customer info
          const customerInfo = await Purchases.getCustomerInfo();
          const offerings = await Purchases.getOfferings();

          // Check premium status
          const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
          const activeEntitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

          let plan: SubscriptionPlan = 'free';
          let expiryDate: Date | null = null;

          if (isPremium && activeEntitlement) {
            // Determine plan type from product identifier
            if (activeEntitlement.productIdentifier.includes('annual')) {
              plan = 'annual';
            } else if (activeEntitlement.productIdentifier.includes('monthly')) {
              plan = 'monthly';
            }
            expiryDate = activeEntitlement.expirationDate
              ? new Date(activeEntitlement.expirationDate)
              : null;
          }

          set({
            isPremium,
            plan,
            expiryDate,
            customerInfo,
            offerings,
            isLoading: false,
            isInitialized: true,
          });

          // Sync with database
          await get().syncWithDatabase();

          // Set up customer info listener
          Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
            const isPremiumNow = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
            const entitlement = info.entitlements.active[ENTITLEMENT_ID];

            let newPlan: SubscriptionPlan = 'free';
            let newExpiryDate: Date | null = null;

            if (isPremiumNow && entitlement) {
              if (entitlement.productIdentifier.includes('annual')) {
                newPlan = 'annual';
              } else if (entitlement.productIdentifier.includes('monthly')) {
                newPlan = 'monthly';
              }
              newExpiryDate = entitlement.expirationDate
                ? new Date(entitlement.expirationDate)
                : null;
            }

            set({
              isPremium: isPremiumNow,
              plan: newPlan,
              expiryDate: newExpiryDate,
              customerInfo: info,
            });

            // Sync with database on update
            get().syncWithDatabase();
          });
        } catch (error) {
          console.error('[Subscription] Init error:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to initialize',
            isLoading: false,
            isInitialized: true,
          });
        }
      },

      refreshCustomerInfo: async () => {
        try {
          // Skip in Expo Go
          if (isExpoGo || !Purchases) {
            return;
          }

          const customerInfo = await Purchases.getCustomerInfo();
          const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
          const activeEntitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

          let plan: SubscriptionPlan = 'free';
          let expiryDate: Date | null = null;

          if (isPremium && activeEntitlement) {
            if (activeEntitlement.productIdentifier.includes('annual')) {
              plan = 'annual';
            } else if (activeEntitlement.productIdentifier.includes('monthly')) {
              plan = 'monthly';
            }
            expiryDate = activeEntitlement.expirationDate
              ? new Date(activeEntitlement.expirationDate)
              : null;
          }

          set({ isPremium, plan, expiryDate, customerInfo });
        } catch (error) {
          console.error('[Subscription] Refresh error:', error);
        }
      },

      loadOfferings: async () => {
        try {
          // Skip in Expo Go
          if (isExpoGo || !Purchases) {
            console.log('[Subscription] loadOfferings skipped (Expo Go or native module missing)');
            return;
          }

          const offerings = await Purchases.getOfferings();
          set({ offerings });
        } catch (error) {
          console.error('[Subscription] Load offerings error:', error);
        }
      },

      purchaseMonthly: async () => {
        try {
          // Skip in Expo Go
          if (isExpoGo || !Purchases) {
            console.log('[Subscription] Purchase skipped (Expo Go or native module missing)');
            return false;
          }

          set({ isLoading: true, error: null });

          const offerings = get().offerings || (await Purchases.getOfferings());
          const monthlyPackage = offerings.current?.availablePackages.find(
            (pkg: PurchasesPackage) => pkg.product.identifier === PRODUCT_IDS.MONTHLY
          );

          if (!monthlyPackage) {
            throw new Error('Monthly package not found');
          }

          const { customerInfo } = await Purchases.purchasePackage(monthlyPackage);
          const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

          set({
            isPremium,
            plan: isPremium ? 'monthly' : 'free',
            customerInfo,
            isLoading: false,
          });

          await get().syncWithDatabase();
          return isPremium;
        } catch (error: unknown) {
          const purchaseError = error as { userCancelled?: boolean };
          if (purchaseError.userCancelled) {
            set({ isLoading: false });
            return false;
          }
          console.error('[Subscription] Purchase monthly error:', error);
          set({
            error: error instanceof Error ? error.message : 'Purchase failed',
            isLoading: false,
          });
          return false;
        }
      },

      purchaseAnnual: async () => {
        try {
          // Skip in Expo Go
          if (isExpoGo || !Purchases) {
            console.log('[Subscription] Purchase skipped (Expo Go or native module missing)');
            return false;
          }

          set({ isLoading: true, error: null });

          const offerings = get().offerings || (await Purchases.getOfferings());
          const annualPackage = offerings.current?.availablePackages.find(
            (pkg: PurchasesPackage) => pkg.product.identifier === PRODUCT_IDS.ANNUAL
          );

          if (!annualPackage) {
            throw new Error('Annual package not found');
          }

          const { customerInfo } = await Purchases.purchasePackage(annualPackage);
          const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

          set({
            isPremium,
            plan: isPremium ? 'annual' : 'free',
            customerInfo,
            isLoading: false,
          });

          await get().syncWithDatabase();
          return isPremium;
        } catch (error: unknown) {
          const purchaseError = error as { userCancelled?: boolean };
          if (purchaseError.userCancelled) {
            set({ isLoading: false });
            return false;
          }
          console.error('[Subscription] Purchase annual error:', error);
          set({
            error: error instanceof Error ? error.message : 'Purchase failed',
            isLoading: false,
          });
          return false;
        }
      },

      restorePurchases: async () => {
        try {
          // Skip in Expo Go
          if (isExpoGo || !Purchases) {
            console.log('[Subscription] Restore skipped (Expo Go or native module missing)');
            return false;
          }

          set({ isLoading: true, error: null });

          const customerInfo = await Purchases.restorePurchases();
          const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
          const activeEntitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];

          let plan: SubscriptionPlan = 'free';
          let expiryDate: Date | null = null;

          if (isPremium && activeEntitlement) {
            if (activeEntitlement.productIdentifier.includes('annual')) {
              plan = 'annual';
            } else if (activeEntitlement.productIdentifier.includes('monthly')) {
              plan = 'monthly';
            }
            expiryDate = activeEntitlement.expirationDate
              ? new Date(activeEntitlement.expirationDate)
              : null;
          }

          set({
            isPremium,
            plan,
            expiryDate,
            customerInfo,
            isLoading: false,
          });

          await get().syncWithDatabase();
          return isPremium;
        } catch (error) {
          console.error('[Subscription] Restore error:', error);
          set({
            error: error instanceof Error ? error.message : 'Restore failed',
            isLoading: false,
          });
          return false;
        }
      },

      openSubscriptionManagement: () => {
        if (Platform.OS === 'ios') {
          Linking.openURL('https://apps.apple.com/account/subscriptions');
        } else {
          Linking.openURL('https://play.google.com/store/account/subscriptions');
        }
      },

      // Feature checks - considers couple premium status
      canGenerateMissions: async (coupleId: string) => {
        const state = get();
        const isCouplePremium = state.isPremium || state.partnerIsPremium;
        const limits = isCouplePremium ? SUBSCRIPTION_LIMITS.premium : SUBSCRIPTION_LIMITS.free;

        // Load daily usage if needed
        await state.loadDailyUsage(coupleId);
        const usage = get().dailyUsage;

        if (!usage || !isToday(usage.usageDate)) {
          return true; // No usage today, can generate
        }

        return usage.generationCount < limits.maxGenerationsPerDay;
      },

      canCompleteMission: async (coupleId: string) => {
        const state = get();
        const isCouplePremium = state.isPremium || state.partnerIsPremium;
        const limits = isCouplePremium ? SUBSCRIPTION_LIMITS.premium : SUBSCRIPTION_LIMITS.free;

        await state.loadDailyUsage(coupleId);
        const usage = get().dailyUsage;

        if (!usage || !isToday(usage.usageDate)) {
          return true;
        }

        return usage.completionCount < limits.maxCompletionsPerDay;
      },

      canBookmarkMission: (currentBookmarkCount: number) => {
        const state = get();
        const isCouplePremium = state.isPremium || state.partnerIsPremium;
        const limits = isCouplePremium ? SUBSCRIPTION_LIMITS.premium : SUBSCRIPTION_LIMITS.free;

        return currentBookmarkCount < limits.maxBookmarks;
      },

      canCreateAlbum: (currentAlbumCount: number) => {
        const state = get();
        const isCouplePremium = state.isPremium || state.partnerIsPremium;
        const limits = isCouplePremium ? SUBSCRIPTION_LIMITS.premium : SUBSCRIPTION_LIMITS.free;

        return currentAlbumCount < limits.maxAlbums;
      },

      canEditAlbum: (albumIndex: number, totalAlbums: number) => {
        const state = get();
        const isCouplePremium = state.isPremium || state.partnerIsPremium;

        if (isCouplePremium) {
          return true; // Premium can edit all albums
        }

        // Free users can only edit the first 5 created albums (oldest 5)
        // Albums are sorted newest first, so oldest albums have higher indices
        // If totalAlbums <= 5, all albums are editable
        if (totalAlbums <= SUBSCRIPTION_LIMITS.free.maxAlbums) {
          return true;
        }

        // First 5 created albums are at the end of the array (highest indices)
        // oldestEditableIndex marks where editable albums start
        const oldestEditableIndex = totalAlbums - SUBSCRIPTION_LIMITS.free.maxAlbums;
        return albumIndex >= oldestEditableIndex;
      },

      // Check if an album is read-only (for UI display)
      isAlbumReadOnly: (albumIndex: number, totalAlbums: number) => {
        const state = get();
        const isCouplePremium = state.isPremium || state.partnerIsPremium;

        if (isCouplePremium) {
          return false; // Premium users: no albums are read-only
        }

        if (totalAlbums <= SUBSCRIPTION_LIMITS.free.maxAlbums) {
          return false; // 5 or fewer albums: none are read-only
        }

        // Albums at indices 0 to (totalAlbums - 6) are read-only
        // Only the oldest 5 (first 5 created) are editable
        const oldestEditableIndex = totalAlbums - SUBSCRIPTION_LIMITS.free.maxAlbums;
        return albumIndex < oldestEditableIndex;
      },

      shouldShowAds: () => {
        const state = get();
        const isCouplePremium = state.isPremium || state.partnerIsPremium;
        return !isCouplePremium;
      },

      getAvailableFrameOptions: () => {
        const state = get();
        const isCouplePremium = state.isPremium || state.partnerIsPremium;
        const limits = isCouplePremium ? SUBSCRIPTION_LIMITS.premium : SUBSCRIPTION_LIMITS.free;
        return [...limits.homeFrameOptions];
      },

      // Usage tracking
      incrementGenerationCount: async (coupleId: string) => {
        try {
          if (!supabase) return false;

          const { data, error } = await supabase.rpc('increment_generation_count', {
            p_couple_id: coupleId,
          });

          if (error) {
            console.error('[Subscription] Increment generation error:', error);
            return false;
          }

          // Update local state
          const today = getTodayString();
          const currentUsage = get().dailyUsage;

          set({
            dailyUsage: {
              generationCount: data,
              completionCount: currentUsage?.usageDate === today ? currentUsage.completionCount : 0,
              usageDate: today,
            },
          });

          return true;
        } catch (error) {
          console.error('[Subscription] Increment generation error:', error);
          return false;
        }
      },

      incrementCompletionCount: async (coupleId: string) => {
        try {
          if (!supabase) return false;

          const { data, error } = await supabase.rpc('increment_completion_count', {
            p_couple_id: coupleId,
          });

          if (error) {
            console.error('[Subscription] Increment completion error:', error);
            return false;
          }

          // Update local state
          const today = getTodayString();
          const currentUsage = get().dailyUsage;

          set({
            dailyUsage: {
              generationCount: currentUsage?.usageDate === today ? currentUsage.generationCount : 0,
              completionCount: data,
              usageDate: today,
            },
          });

          return true;
        } catch (error) {
          console.error('[Subscription] Increment completion error:', error);
          return false;
        }
      },

      loadDailyUsage: async (coupleId: string) => {
        try {
          if (!supabase) return;

          const today = getTodayString();
          const currentUsage = get().dailyUsage;

          // Skip if already loaded for today
          if (currentUsage && currentUsage.usageDate === today) {
            return;
          }

          const { data, error } = await supabase
            .from('daily_usage')
            .select('*')
            .eq('couple_id', coupleId)
            .eq('usage_date', today)
            .maybeSingle();

          if (error) {
            console.error('[Subscription] Load daily usage error:', error);
            return;
          }

          set({
            dailyUsage: data
              ? {
                  generationCount: data.generation_count,
                  completionCount: data.completion_count,
                  usageDate: data.usage_date,
                }
              : {
                  generationCount: 0,
                  completionCount: 0,
                  usageDate: today,
                },
          });
        } catch (error) {
          console.error('[Subscription] Load daily usage error:', error);
        }
      },

      setPartnerIsPremium: (isPremium: boolean) => {
        set({ partnerIsPremium: isPremium });
      },

      checkCouplePremium: async (coupleId: string) => {
        try {
          if (!supabase) return get().isPremium;

          const { data, error } = await supabase.rpc('is_couple_premium', {
            p_couple_id: coupleId,
          });

          if (error) {
            console.error('[Subscription] Check couple premium error:', error);
            return get().isPremium;
          }

          return data === true;
        } catch (error) {
          console.error('[Subscription] Check couple premium error:', error);
          return get().isPremium;
        }
      },

      syncWithDatabase: async () => {
        try {
          if (!supabase) return;

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const state = get();
          const { error } = await supabase
            .from('profiles')
            .update({
              subscription_plan: state.plan,
              subscription_expires_at: state.expiryDate?.toISOString() || null,
              subscription_started_at: state.isPremium && !state.expiryDate
                ? new Date().toISOString()
                : undefined,
            })
            .eq('id', user.id);

          if (error) {
            console.error('[Subscription] Sync error:', error);
          }
        } catch (error) {
          console.error('[Subscription] Sync error:', error);
        }
      },

      setHasHydrated: (hasHydrated: boolean) => {
        set({ _hasHydrated: hasHydrated });
      },

      reset: () => {
        set({ ...initialState, _hasHydrated: true });
      },
    }),
    {
      name: 'daydate-subscription-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        isPremium: state.isPremium,
        plan: state.plan,
        expiryDate: state.expiryDate,
        partnerIsPremium: state.partnerIsPremium,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

// Helper hook for premium feature checks
export const usePremiumFeature = () => {
  const store = useSubscriptionStore();

  return {
    isPremium: store.isPremium || store.partnerIsPremium,
    plan: store.plan,
    shouldShowAds: store.shouldShowAds(),
    canBookmark: (count: number) => store.canBookmarkMission(count),
    canCreateAlbum: (count: number) => store.canCreateAlbum(count),
    canEditAlbum: (index: number, total: number) => store.canEditAlbum(index, total),
    isAlbumReadOnly: (index: number, total: number) => store.isAlbumReadOnly(index, total),
    frameOptions: store.getAvailableFrameOptions(),
    limits: store.isPremium || store.partnerIsPremium
      ? SUBSCRIPTION_LIMITS.premium
      : SUBSCRIPTION_LIMITS.free,
  };
};

export default useSubscriptionStore;
