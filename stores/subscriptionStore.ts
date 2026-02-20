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

    // CRITICAL: Set a no-op log handler IMMEDIATELY after loading the SDK
    // The SDK registers an event listener that emits log events, and if customLogHandler
    // is not defined, it throws "customLogHandler is not a function" error on Android
    // This must be done at module load time, not during initialization
    if (Purchases && Purchases.setLogHandler) {
      Purchases.setLogHandler(() => {
        // No-op: Silently ignore all log messages
      });
    }
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
const ENTITLEMENT_ID = 'daydate Premium';

// Product identifiers (must match RevenueCat dashboard and App Store Connect)
export const PRODUCT_IDS = {
  MONTHLY: 'com.daydate.premium.month',
  ANNUAL: 'com.daydate.premium.annually',
} as const;

// Subscription limits
export const SUBSCRIPTION_LIMITS = {
  free: {
    showAds: true,
    homeFrameOptions: ['polaroid'] as const,
    maxPlansPerMonth: 5,
  },
  premium: {
    showAds: false,
    homeFrameOptions: ['polaroid', 'calendar'] as const,
    maxPlansPerMonth: Infinity,
  },
} as const;

export type SubscriptionPlan = 'free' | 'monthly' | 'annual';
export type HomeFrameOption = 'polaroid' | 'calendar';

interface SubscriptionState {
  // Subscription status
  isPremium: boolean;
  plan: SubscriptionPlan;
  expiryDate: Date | null;
  isLoading: boolean;
  isInitialized: boolean;
  isRevenueCatConfigured: boolean; // Whether RevenueCat SDK is actually configured
  error: string | null;

  // RevenueCat data
  offerings: PurchasesOfferings | null;
  customerInfo: CustomerInfo | null;

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
  shouldShowAds: () => boolean;
  getAvailableFrameOptions: () => HomeFrameOption[];

  // Partner premium sync
  setPartnerIsPremium: (isPremium: boolean) => void;
  checkCouplePremium: (coupleId: string) => Promise<boolean>;

  // Sync with database
  syncWithDatabase: () => Promise<void>;
  loadFromDatabase: () => Promise<void>;

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
  isRevenueCatConfigured: false,
  error: null,
  offerings: null,
  customerInfo: null,
  partnerIsPremium: false,
  _hasHydrated: false,
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
            console.log('[Subscription] RevenueCat not available (Expo Go or native module missing), checking database');
            set({ isLoading: false, isInitialized: true });
            // Check database for admin-granted premium
            await get().loadFromDatabase();
            return;
          }

          const apiKey = Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID;

          if (!apiKey) {
            console.log('[Subscription] RevenueCat API key not configured, checking database');
            set({ isLoading: false, isInitialized: true });
            // Check database for admin-granted premium
            await get().loadFromDatabase();
            return;
          }

          // Configure RevenueCat
          // Note: setLogHandler is called at module load time (see top of file)
          // to prevent 'customLogHandler is not a function' error on Android
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
            } else if (activeEntitlement.productIdentifier.includes('month')) {
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
            isRevenueCatConfigured: true,
          });

          // Sync with database
          await get().syncWithDatabase();

          // Check database for admin-granted premium (fallback)
          await get().loadFromDatabase();

          // Set up customer info listener
          try {
            Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
              try {
                const isPremiumNow = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
                const entitlement = info.entitlements.active[ENTITLEMENT_ID];

                let newPlan: SubscriptionPlan = 'free';
                let newExpiryDate: Date | null = null;

                if (isPremiumNow && entitlement) {
                  if (entitlement.productIdentifier.includes('annual')) {
                    newPlan = 'annual';
                  } else if (entitlement.productIdentifier.includes('month')) {
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
              } catch (listenerError) {
                console.warn('[Subscription] Error in customer info listener:', listenerError);
              }
            });
          } catch (listenerSetupError) {
            console.warn('[Subscription] Failed to set up customer info listener:', listenerSetupError);
          }
        } catch (error) {
          console.error('[Subscription] Init error:', error);
          set({
            error: error instanceof Error ? error.message : 'Failed to initialize',
            isLoading: false,
            isInitialized: true,
          });
          // Check database for admin-granted premium as fallback
          await get().loadFromDatabase();
        }
      },

      refreshCustomerInfo: async () => {
        try {
          // Skip in Expo Go
          if (isExpoGo || !Purchases) {
            return;
          }

          // Skip if RevenueCat is not configured yet
          if (!get().isRevenueCatConfigured) {
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
            } else if (activeEntitlement.productIdentifier.includes('month')) {
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

          // Skip if RevenueCat is not configured yet
          if (!get().isRevenueCatConfigured) {
            console.log('[Subscription] loadOfferings skipped (RevenueCat not configured)');
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
            set({ error: 'In-App Purchase is not available in this environment' });
            return false;
          }

          // Skip if RevenueCat is not configured yet
          if (!get().isRevenueCatConfigured) {
            console.log('[Subscription] Purchase skipped (RevenueCat not configured)');
            set({ error: 'Store is not initialized. Please restart the app.' });
            return false;
          }

          set({ isLoading: true, error: null });

          // Get offerings with timeout to prevent hanging
          let offerings = get().offerings;
          if (!offerings) {
            try {
              const offeringsPromise = Purchases.getOfferings();
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Offerings load timeout')), 10000)
              );
              offerings = await Promise.race([offeringsPromise, timeoutPromise]) as typeof offerings;
            } catch (offeringsError) {
              console.error('[Subscription] Failed to load offerings:', offeringsError);
              set({ isLoading: false, error: 'Failed to load products' });
              return false;
            }
          }

          // Verify offerings loaded successfully
          if (!offerings || !offerings.current) {
            console.error('[Subscription] No offerings available');
            set({ isLoading: false, error: 'Products not available' });
            return false;
          }

          // Debug: Log available packages
          console.log('[Subscription] Current offering:', offerings.current.identifier);
          console.log('[Subscription] Available packages:', offerings.current.availablePackages.map(
            (pkg: PurchasesPackage) => `${pkg.identifier}: ${pkg.product.identifier}`
          ));

          // Try to find monthly package by product ID first, then by package type
          let monthlyPackage = offerings.current.availablePackages.find(
            (pkg: PurchasesPackage) => pkg.product.identifier === PRODUCT_IDS.MONTHLY
          );

          // Fallback: try to find by package identifier (e.g., '$rc_monthly') or product ID containing 'month'
          if (!monthlyPackage) {
            monthlyPackage = offerings.current.availablePackages.find(
              (pkg: PurchasesPackage) =>
                pkg.identifier === '$rc_monthly' ||
                pkg.identifier.toLowerCase().includes('month') ||
                pkg.product.identifier.toLowerCase().includes('month')
            );
          }

          if (!monthlyPackage) {
            const availableIds = offerings.current.availablePackages.map(
              (pkg: PurchasesPackage) => pkg.product.identifier
            ).join(', ') || 'none';
            throw new Error(`Monthly package not found. Available products: ${availableIds}`);
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
            set({ error: 'In-App Purchase is not available in this environment' });
            return false;
          }

          // Skip if RevenueCat is not configured yet
          if (!get().isRevenueCatConfigured) {
            console.log('[Subscription] Purchase skipped (RevenueCat not configured)');
            set({ error: 'Store is not initialized. Please restart the app.' });
            return false;
          }

          set({ isLoading: true, error: null });

          // Get offerings with timeout to prevent hanging
          let offerings = get().offerings;
          if (!offerings) {
            try {
              const offeringsPromise = Purchases.getOfferings();
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Offerings load timeout')), 10000)
              );
              offerings = await Promise.race([offeringsPromise, timeoutPromise]) as typeof offerings;
            } catch (offeringsError) {
              console.error('[Subscription] Failed to load offerings:', offeringsError);
              set({ isLoading: false, error: 'Failed to load products' });
              return false;
            }
          }

          // Verify offerings loaded successfully
          if (!offerings || !offerings.current) {
            console.error('[Subscription] No offerings available');
            set({ isLoading: false, error: 'Products not available' });
            return false;
          }

          // Debug: Log available packages
          console.log('[Subscription] Current offering:', offerings.current.identifier);
          console.log('[Subscription] Available packages:', offerings.current.availablePackages.map(
            (pkg: PurchasesPackage) => `${pkg.identifier}: ${pkg.product.identifier}`
          ));

          // Try to find annual package by product ID first, then by package type
          let annualPackage = offerings.current.availablePackages.find(
            (pkg: PurchasesPackage) => pkg.product.identifier === PRODUCT_IDS.ANNUAL
          );

          // Fallback: try to find by package identifier (e.g., '$rc_annual') or product ID containing 'annual'
          if (!annualPackage) {
            annualPackage = offerings.current.availablePackages.find(
              (pkg: PurchasesPackage) =>
                pkg.identifier === '$rc_annual' ||
                pkg.identifier.toLowerCase().includes('annual') ||
                pkg.identifier.toLowerCase().includes('yearly') ||
                pkg.product.identifier.toLowerCase().includes('annual') ||
                pkg.product.identifier.toLowerCase().includes('yearly')
            );
          }

          if (!annualPackage) {
            const availableIds = offerings.current.availablePackages.map(
              (pkg: PurchasesPackage) => pkg.product.identifier
            ).join(', ') || 'none';
            throw new Error(`Annual package not found. Available products: ${availableIds}`);
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

          // Skip if RevenueCat is not configured yet
          if (!get().isRevenueCatConfigured) {
            console.log('[Subscription] Restore skipped (RevenueCat not configured)');
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
            } else if (activeEntitlement.productIdentifier.includes('month')) {
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
      shouldShowAds: () => {
        // Show ads for free users on both platforms
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

      setPartnerIsPremium: (isPremium: boolean) => {
        set({ partnerIsPremium: isPremium });
      },

      checkCouplePremium: async (coupleId: string) => {
        try {
          if (!supabase) return get().isPremium;

          // Query couples table directly for is_premium status
          // This is more reliable than the RPC which may have different logic
          // Use maybeSingle() to handle case when couple doesn't exist (returns null instead of error)
          const { data: coupleData, error: coupleError } = await supabase
            .from('couples')
            .select('is_premium, premium_user_id, premium_expires_at')
            .eq('id', coupleId)
            .maybeSingle();

          if (coupleError) {
            console.error('[Subscription] Check couple premium error:', coupleError);
            // Fallback to RPC
            const { data, error } = await supabase.rpc('is_couple_premium', {
              p_couple_id: coupleId,
            });
            if (error) {
              console.error('[Subscription] RPC fallback error:', error);
              return get().isPremium;
            }
            return data === true;
          }

          // If couple doesn't exist, return false (no premium)
          if (!coupleData) {
            console.log('[Subscription] Couple not found, returning false');
            return false;
          }

          console.log('[Subscription] Couple premium data:', coupleData);

          // Check if couple has premium and it hasn't expired
          if (coupleData?.is_premium) {
            // If there's an expiry date, check if it's still valid
            if (coupleData.premium_expires_at) {
              const expiryDate = new Date(coupleData.premium_expires_at);
              const isValid = expiryDate > new Date();
              console.log('[Subscription] Premium expiry check:', { expiryDate, isValid });
              return isValid;
            }
            // No expiry date means lifetime/admin-granted premium
            return true;
          }

          return false;
        } catch (error) {
          console.error('[Subscription] Check couple premium error:', error);
          return get().isPremium;
        }
      },

      syncWithDatabase: async () => {
        try {
          if (!supabase) return;

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            console.log('[Subscription] No user found, skipping sync');
            return;
          }

          const state = get();
          console.log('[Subscription] Syncing to database:', {
            isPremium: state.isPremium,
            plan: state.plan,
            expiryDate: state.expiryDate?.toISOString(),
            customerId: state.customerInfo?.originalAppUserId,
          });

          // Get current profile to check subscription_started_at and existing admin-granted premium
          // Use maybeSingle() to handle case when profile doesn't exist yet (returns null instead of error)
          const { data: profile, error: profileFetchError } = await supabase
            .from('profiles')
            .select('subscription_started_at, couple_id, subscription_plan, subscription_expires_at')
            .eq('id', user.id)
            .maybeSingle();

          if (profileFetchError) {
            console.error('[Subscription] Profile fetch error:', profileFetchError);
            return;
          }

          // If profile doesn't exist, skip sync (user hasn't completed onboarding yet)
          if (!profile) {
            console.log('[Subscription] No profile found for premium check');
            return;
          }

          // Get couple_id from profile or authStore (fallback for newly paired users)
          const { useAuthStore } = await import('./authStore');
          const authCouple = useAuthStore.getState().couple;
          const coupleId = profile?.couple_id || authCouple?.id;

          console.log('[Subscription] Profile data:', {
            profile_couple_id: profile?.couple_id,
            authStore_couple_id: authCouple?.id,
            effective_couple_id: coupleId,
            subscription_started_at: profile?.subscription_started_at,
            db_subscription_plan: profile?.subscription_plan,
            db_subscription_expires_at: profile?.subscription_expires_at,
          });

          // Check if DB has admin-granted premium that should be preserved
          const dbHasValidPremium = profile?.subscription_plan !== 'free'
            && profile?.subscription_expires_at
            && new Date(profile.subscription_expires_at) > new Date();

          // If RevenueCat says free but DB has valid premium, don't overwrite DB
          // This preserves admin-granted premium for testing
          if (!state.isPremium && dbHasValidPremium) {
            console.log('[Subscription] Preserving admin-granted premium in DB, skipping sync');
            return;
          }

          // Prepare profile update data
          const profileUpdate: Record<string, unknown> = {
            subscription_plan: state.plan,
            subscription_expires_at: state.expiryDate?.toISOString() || null,
          };

          // Set subscription_started_at only if premium and not already set
          if (state.isPremium && !profile?.subscription_started_at) {
            profileUpdate.subscription_started_at = new Date().toISOString();
          }

          // Set revenuecat_customer_id from customer info
          if (state.customerInfo?.originalAppUserId) {
            profileUpdate.revenuecat_customer_id = state.customerInfo.originalAppUserId;
          }

          console.log('[Subscription] Updating profile with:', profileUpdate);

          // Update profiles table
          const { error: profileError } = await supabase
            .from('profiles')
            .update(profileUpdate)
            .eq('id', user.id);

          if (profileError) {
            console.error('[Subscription] Profile sync error:', profileError);
          } else {
            console.log('[Subscription] Profile updated successfully');
          }

          // Update couples table if user has a couple
          if (coupleId) {
            const coupleUpdate: Record<string, unknown> = {
              is_premium: state.isPremium,
              premium_expires_at: state.expiryDate?.toISOString() || null,
            };

            // Set premium_user_id only if user is premium
            if (state.isPremium) {
              coupleUpdate.premium_user_id = user.id;
            } else {
              // If user is no longer premium, check if partner is premium
              // before clearing premium_user_id
              const { data: coupleData } = await supabase
                .from('couples')
                .select('premium_user_id')
                .eq('id', coupleId)
                .single();

              // Only clear if this user was the premium user
              if (coupleData?.premium_user_id === user.id) {
                coupleUpdate.premium_user_id = null;
              }
            }

            console.log('[Subscription] Updating couple with:', coupleUpdate, 'for couple_id:', coupleId);

            const { error: coupleError, data: coupleResult } = await supabase
              .from('couples')
              .update(coupleUpdate)
              .eq('id', coupleId)
              .select();

            if (coupleError) {
              console.error('[Subscription] Couple sync error:', coupleError);
            } else {
              console.log('[Subscription] Couple updated successfully:', coupleResult);
            }
          } else {
            console.log('[Subscription] No couple_id found, skipping couple sync');
          }

          console.log('[Subscription] Database sync completed successfully');
        } catch (error) {
          console.error('[Subscription] Sync error:', error);
        }
      },

      // Load premium status from database (for admin-granted premium or testing)
      // Also syncs local state if database says free but local says premium
      // Automatically handles subscription expiration via RPC function
      loadFromDatabase: async () => {
        try {
          if (!supabase) return;

          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          // First, check and expire subscription if needed (updates DB automatically)
          try {
            const { data: expirationResult, error: rpcError } = await supabase
              .rpc('check_and_expire_subscription', { p_user_id: user.id });

            if (!rpcError && expirationResult?.expired) {
              console.log('[Subscription] Subscription expired via RPC:', expirationResult);
              set({
                isPremium: false,
                plan: 'free',
                expiryDate: null,
              });
              return; // Already handled
            }
          } catch (rpcErr) {
            // RPC function might not exist yet, continue with regular check
            console.log('[Subscription] RPC check_and_expire_subscription not available, using fallback');
          }

          // Fallback: Regular profile check
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('subscription_plan, subscription_expires_at')
            .eq('id', user.id)
            .single();

          if (error || !profile) {
            console.log('[Subscription] No profile found for premium check');
            return;
          }

          // Check if user has valid premium in database
          const dbPlan = profile.subscription_plan as SubscriptionPlan;
          const dbExpiryDate = profile.subscription_expires_at
            ? new Date(profile.subscription_expires_at)
            : null;

          const state = get();

          // If database says premium and not expired, grant premium
          if (dbPlan !== 'free' && dbExpiryDate && dbExpiryDate > new Date()) {
            // Only apply if RevenueCat didn't already grant premium
            if (!state.isPremium) {
              console.log('[Subscription] Granting premium from database:', dbPlan);
              set({
                isPremium: true,
                plan: dbPlan,
                expiryDate: dbExpiryDate,
              });
            }
          } else if (dbPlan === 'free' && state.isPremium) {
            // Database explicitly says "free" but local state says premium
            // This can happen if:
            // 1. Premium expired or was revoked
            // 2. Admin manually set to free for testing
            // 3. Subscription was cancelled
            // IMPORTANT: Trust database when it explicitly says "free" - this is an admin decision
            // This ensures testing/admin overrides work even with sandbox RevenueCat
            console.log('[Subscription] Downgrading to free based on database (DB explicitly says free)');
            set({
              isPremium: false,
              plan: 'free',
              expiryDate: null,
            });
          } else if (dbPlan !== 'free' && dbExpiryDate && dbExpiryDate <= new Date()) {
            // Database shows expired subscription - update both local state and DB
            console.log('[Subscription] Downgrading to free - subscription expired');

            // Update local state
            set({
              isPremium: false,
              plan: 'free',
              expiryDate: null,
            });

            // Update database
            await supabase
              .from('profiles')
              .update({
                subscription_plan: 'free',
                subscription_expires_at: null,
              })
              .eq('id', user.id);

            console.log('[Subscription] Updated database to free plan');
          }
        } catch (error) {
          console.error('[Subscription] Load from database error:', error);
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

export default useSubscriptionStore;
