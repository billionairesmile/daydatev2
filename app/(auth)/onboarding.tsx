import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
  StatusBar,
  Share,
  Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Heart,
  ChevronRight,
  Check,
  Calendar,
  Gift,
  Copy,
  X,
  LogOut,
  UserX,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as Localization from 'expo-localization';
import Constants from 'expo-constants';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { signInWithGoogle, signInWithKakao, signInWithApple, onAuthStateChange, signOut } from '@/lib/socialAuth';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Ionicons } from '@expo/vector-icons';

import { GoogleLogo, KakaoLogo } from '@/components/icons/SocialLogos';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, IS_TABLET, scale, scaleFont, ANDROID_BOTTOM_PADDING } from '@/constants/design';
import { useAuthStore } from '@/stores';
import { useTimezoneStore } from '@/stores/timezoneStore';
import {
  useOnboardingStore,
  generatePairingCode,
  MBTI_OPTIONS,
  ACTIVITY_TYPE_OPTIONS,
  DATE_WORRY_OPTIONS,
  CONSTRAINT_OPTIONS,
  type RelationshipType,
  type ActivityType,
  type DateWorry,
  type Constraint,
  type CalendarType,
  type Gender,
  type OnboardingData,
} from '@/stores/onboardingStore';
import { useBackground } from '@/contexts';
import { useMissionStore } from '@/stores/missionStore';
import { db, isDemoMode, isInTestMode, supabase } from '@/lib/supabase';
import {
  createTestPairingCode,
  joinTestPairingCode,
  checkTestPairingStatus,
  generateDeterministicId,
} from '@/lib/testPairing';
import { formatDateToLocal, parseDateFromLocal } from '@/lib/dateUtils';

const { width, height } = Dimensions.get('window');

// UUID v4 generator function
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Parse date string as local date (not UTC) to avoid timezone issues
// "1990-01-03" should be January 3rd in local timezone, not UTC
// Handles both simple date strings and ISO timestamps
const parseDateAsLocal = (dateString: string): Date => {
  // If it's an ISO timestamp (contains T), parse as Date first to get correct local time
  // e.g., "1990-01-02T15:00:00.000Z" represents Jan 3 00:00 in KST (UTC+9)
  if (dateString.includes('T')) {
    const d = new Date(dateString);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // If it's a simple date string like "1990-01-03", parse as local
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Step configuration for progress bar
const STEP_A = ['pairing', 'basic_info', 'couple_info'];
const STEP_B = ['mbti', 'activity_type', 'date_worries', 'constraints'];

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { backgroundImage } = useBackground();
  const { setIsOnboardingComplete, updateNickname, setCouple, setUser, setPartner, setIsTestMode, user: currentUser, couple, isOnboardingComplete, isAuthenticated, _hasHydrated } = useAuthStore();
  const {
    currentStep,
    data,
    setStep,
    nextStep,
    prevStep,
    updateData,
    _hasHydrated: onboardingHydrated,
  } = useOnboardingStore();

  // Local state
  const [generatedCode, setGeneratedCode] = useState(() => generatePairingCode());
  const [hasExistingPreferences, setHasExistingPreferences] = useState(false);
  const [isRedirectingToHome, setIsRedirectingToHome] = useState(false);
  const [isExistingUser, setIsExistingUser] = useState(false);

  // Steps that require authentication - used for both synchronous check and useEffect
  const stepsRequiringAuth = ['pairing', 'basic_info', 'couple_info', 'preferences_intro', 'mbti', 'activity_type', 'date_worries', 'constraints', 'complete'];

  // Both stores must be hydrated before we can determine the correct step
  const isFullyHydrated = _hasHydrated && onboardingHydrated;

  // Wait for hydration to complete before computing effective step
  // This prevents flash of pairing screen before auth state is loaded from storage
  const shouldShowWelcome = isFullyHydrated && !isAuthenticated && !currentUser?.id && stepsRequiringAuth.includes(currentStep);

  // CRITICAL: If not fully hydrated, always show 'welcome' to prevent flash of auth-requiring screens
  // This handles account deletion flow where AsyncStorage is cleared and states are resetting
  const effectiveStep = !isFullyHydrated
    ? 'welcome'
    : (shouldShowWelcome ? 'welcome' : currentStep);

  // Debug logging to trace the step calculation
  console.log('[Onboarding] Step Debug:', {
    currentStep,
    effectiveStep,
    isFullyHydrated,
    _hasHydrated,
    onboardingHydrated,
    isAuthenticated,
    currentUserId: currentUser?.id,
    shouldShowWelcome,
  });

  // Also update the store to match (for consistency and future renders)
  // This useEffect ensures the store state is corrected after the synchronous render fix
  useEffect(() => {
    if (shouldShowWelcome) {
      console.log('[Onboarding] User not authenticated, resetting to welcome from:', currentStep);
      setStep('welcome');
    }
  }, [shouldShowWelcome, currentStep, setStep]);

  // NOTE: Code regeneration is now handled entirely within PairingStep's setupPairing
  // This prevents race conditions where code is regenerated while setupPairing is running
  // The initial code from useState is used, and setupPairing will update it if needed

  // Set isExistingUser based on currentUser (for users coming from unpair/disconnect)
  useEffect(() => {
    if (currentUser?.id && !isExistingUser) {
      console.log('[Onboarding] Setting isExistingUser based on currentUser');
      setIsExistingUser(true);
    }
  }, [currentUser?.id, isExistingUser]);

  // On app restart: If user has an active paired couple (both user1Id and user2Id set), skip to basic_info
  // Redirect from removed steps (login, terms) to welcome
  useEffect(() => {
    if (currentStep === 'login' || currentStep === 'terms') {
      console.log('[Onboarding] Redirecting from removed step to welcome:', currentStep);
      setStep('welcome');
    }
  }, [currentStep, setStep]);

  // Skip this effect if:
  // - Already redirecting to home (returning user login)
  // - Couple is disconnected (user went through unpair flow)
  // - isOnboardingComplete is false (user is intentionally on onboarding flow, e.g., after unpair)
  // - isPairingConnected is false (user needs to pair first)
  useEffect(() => {
    if (isRedirectingToHome) return;
    // If onboarding is not complete, don't auto-skip to basic_info (user might have unpaired)
    if (!isOnboardingComplete) return;
    // If pairing is not connected in onboarding data, don't skip
    if (!data.isPairingConnected) return;

    const earlySteps = ['welcome', 'login', 'pairing'];
    const isActivePairedCouple = couple?.user1Id && couple?.user2Id && couple?.status !== 'disconnected';
    if (isActivePairedCouple && earlySteps.includes(currentStep)) {
      console.log('[Onboarding] User has active paired couple, skipping to basic_info');
      setStep('basic_info');
    }
  }, [couple?.user1Id, couple?.user2Id, couple?.status, currentStep, setStep, isRedirectingToHome, isOnboardingComplete, data.isPairingConnected]);

  // Check if user has existing onboarding answers (for conditional preference skipping)
  useEffect(() => {
    const checkExistingPreferences = async () => {
      if (!isInTestMode() && currentUser?.id) {
        try {
          const hasAnswers = await db.onboardingAnswers.hasAnswers(currentUser.id);
          setHasExistingPreferences(hasAnswers);
          console.log('[Onboarding] User has existing preferences:', hasAnswers);
        } catch (error) {
          console.error('[Onboarding] Error checking existing preferences:', error);
        }
      }
    };
    checkExistingPreferences();
  }, [currentUser?.id]);

  // Check if user has existing profile (for pairing back button behavior)
  useEffect(() => {
    const checkExistingProfile = async () => {
      if (!isInTestMode() && currentUser?.id && currentStep === 'pairing') {
        try {
          const { data: profile } = await db.profiles.get(currentUser.id);
          // User is existing if they have a profile with birth_date or nickname set
          const hasExistingProfile = !!(profile && (profile.birth_date || profile.nickname));
          setIsExistingUser(hasExistingProfile);
          console.log('[Onboarding] Is existing user:', hasExistingProfile);
        } catch (error) {
          console.error('[Onboarding] Error checking existing profile:', error);
        }
      }
    };
    checkExistingProfile();
  }, [currentUser?.id, currentStep]);

  // Animation
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const isTransitioning = useRef(false);

  const animateTransition = useCallback((callback: () => void) => {
    // Prevent rapid tapping - ignore if already transitioning
    if (isTransitioning.current) {
      return;
    }
    isTransitioning.current = true;

    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      callback();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        // Only allow next transition after animation completes
        isTransitioning.current = false;
      });
    });
  }, [fadeAnim]);

  const handleNext = useCallback(() => {
    animateTransition(() => nextStep());
  }, [animateTransition, nextStep]);

  const handleBack = useCallback(() => {
    animateTransition(() => prevStep());
  }, [animateTransition, prevStep]);

  // Save anniversary date immediately when leaving couple_info step
  // This ensures the creator sees the correct date even if joiner hasn't completed onboarding yet
  const saveAnniversaryDateImmediately = useCallback(async () => {
    const currentCouple = useAuthStore.getState().couple;

    if (!data.anniversaryDate || !currentCouple?.id) {
      console.warn('[Onboarding] Skipping immediate anniversary save - missing data:', {
        anniversaryDate: data.anniversaryDate,
        coupleId: currentCouple?.id,
      });
      return;
    }

    if (!isInTestMode()) {
      try {
        console.log('[Onboarding] Saving anniversary date immediately:', {
          coupleId: currentCouple.id,
          anniversaryDate: data.anniversaryDate,
          relationshipType: data.relationshipType,
        });

        const { error: coupleError } = await db.couples.update(currentCouple.id, {
          dating_start_date: formatDateToLocal(data.anniversaryDate),
          wedding_date: data.relationshipType === 'married' ? formatDateToLocal(data.anniversaryDate) : null,
        });

        if (coupleError) {
          console.error('[Onboarding] Error saving anniversary date immediately:', coupleError);
        } else {
          console.log('[Onboarding] Anniversary date saved immediately');

          // Update couple in authStore
          setCouple({
            ...currentCouple,
            anniversaryDate: data.anniversaryDate,
            datingStartDate: data.anniversaryDate,
            weddingDate: data.relationshipType === 'married' ? data.anniversaryDate : undefined,
          });
        }
      } catch (error) {
        console.error('[Onboarding] Error in immediate anniversary save:', error);
      }
    } else {
      // Demo mode: just update authStore
      setCouple({
        ...currentCouple,
        anniversaryDate: data.anniversaryDate,
        datingStartDate: data.anniversaryDate,
        weddingDate: data.relationshipType === 'married' ? data.anniversaryDate : undefined,
      });
    }
  }, [data.anniversaryDate, data.relationshipType, setCouple]);

  // Save profile data immediately when leaving basic_info step
  // This ensures the partner sees the correct nickname/birthdate even if user hasn't completed onboarding yet
  const saveProfileDataImmediately = useCallback(async () => {
    const currentUser = useAuthStore.getState().user;

    if (!data.nickname || !currentUser?.id) {
      console.warn('[Onboarding] Skipping immediate profile save - missing data:', {
        nickname: data.nickname,
        userId: currentUser?.id,
      });
      return;
    }

    // ALWAYS update user in authStore first (before DB save)
    // This ensures the nickname is immediately reflected in the UI
    const currentPreferences = currentUser.preferences || {};
    setUser({
      ...currentUser,
      nickname: data.nickname,
      birthDate: data.birthDate || undefined,
      birthDateCalendarType: data.birthDateCalendarType,
      preferences: currentPreferences,
    });
    console.log('[Onboarding] Updated user nickname in authStore:', data.nickname);

    // Then save to DB (non-blocking for UI)
    if (!isInTestMode()) {
      try {
        console.log('[Onboarding] Saving profile data to DB:', {
          userId: currentUser.id,
          nickname: data.nickname,
          birthDate: data.birthDate,
          birthDateCalendarType: data.birthDateCalendarType,
        });

        const { error: profileError } = await db.profiles.update(currentUser.id, {
          nickname: data.nickname,
          birth_date: data.birthDate ? formatDateToLocal(data.birthDate) : null,
          birth_date_calendar_type: data.birthDateCalendarType,
          preferences: currentPreferences,
        });

        if (profileError) {
          console.error('[Onboarding] Error saving profile data to DB:', profileError);
        } else {
          console.log('[Onboarding] Profile data saved to DB successfully');
        }
      } catch (error) {
        console.error('[Onboarding] Error in immediate profile save:', error);
      }
    }
  }, [data.nickname, data.birthDate, data.birthDateCalendarType, setUser]);

  // Custom back handler for pairing step - log out and go to welcome
  const handlePairingBack = useCallback(async () => {
    // Log out and go to welcome screen (terms step removed)
    console.log('[Onboarding] Pairing back pressed, logging out and going to welcome');
    try {
      await signOut();
      useAuthStore.getState().signOut();
      useOnboardingStore.getState().reset();
      setIsExistingUser(false);
      animateTransition(() => setStep('welcome'));
    } catch (error) {
      console.error('[Onboarding] Logout error:', error);
      // Even if logout fails, go to welcome screen
      animateTransition(() => setStep('welcome'));
    }
  }, [animateTransition, setStep]);

  // Social Login Handler
  const handleSocialLogin = useCallback(async (provider: 'google' | 'kakao' | 'apple') => {
    try {
      console.log(`[Onboarding] Starting ${provider} login...`);

      let session = null;
      if (provider === 'google') {
        session = await signInWithGoogle();
      } else if (provider === 'kakao') {
        session = await signInWithKakao();
      } else if (provider === 'apple') {
        session = await signInWithApple();
      }

      if (session && session.user) {
        console.log(`[Onboarding] ${provider} login successful:`, session.user.id);

        // Extract user info from session (OAuth metadata)
        const userMetadata = (session.user.user_metadata || {}) as Record<string, string | undefined>;
        const oauthEmail = session.user.email || userMetadata.email || '';
        const oauthName = userMetadata.full_name || userMetadata.name || '';
        const oauthAvatarUrl = userMetadata.avatar_url || userMetadata.picture || '';

        // Check if user already exists in database FIRST (before creating user object)
        try {
          const { data: existingProfile } = await db.profiles.get(session.user.id);
          const isExistingUser = !!existingProfile;
          console.log('[Onboarding] Existing user check:', { isExistingUser, existingProfile });

          // Create user object - prioritize DB data over OAuth metadata for existing users
          // Extract birthDateCalendarType from column (fallback to preferences for backward compatibility)
          const dbPreferences = existingProfile?.preferences as Record<string, unknown> | undefined;
          const birthDateCalendarType = (existingProfile?.birth_date_calendar_type as 'solar' | 'lunar')
            || (dbPreferences?.birthDateCalendarType as 'solar' | 'lunar')
            || 'solar';

          const userObject = {
            id: session.user.id,
            email: existingProfile?.email || oauthEmail,
            // Use DB nickname if exists, otherwise fall back to OAuth name
            nickname: existingProfile?.nickname || oauthName || oauthEmail.split('@')[0] || t('onboarding.defaultUser'),
            avatarUrl: oauthAvatarUrl,
            inviteCode: generatePairingCode(),
            // Restore preferences from DB if exists
            birthDate: existingProfile?.birth_date ? parseDateAsLocal(existingProfile.birth_date) : undefined,
            birthDateCalendarType,
            preferences: existingProfile?.preferences || {} as any,
            createdAt: existingProfile?.created_at ? new Date(existingProfile.created_at) : new Date(),
          };

          // Set user in auth store with restored data
          setUser(userObject);

          // Update nickname in onboarding data (use DB value if exists)
          if (existingProfile?.nickname) {
            updateData({ nickname: existingProfile.nickname });
          } else if (oauthName) {
            updateData({ nickname: oauthName });
          }

          // For new users: create profile with consent fields. For existing users: update consent if not already set
          // Login implies agreement to terms (as stated on login screen)
          const consentFields = {
            age_verified: true,
            terms_agreed: true,
            location_terms_agreed: true,
            privacy_agreed: true,
            consent_given_at: new Date().toISOString(),
          };

          if (isExistingUser) {
            // Update auth_provider and consent fields (only if not already agreed)
            const needsConsentUpdate = !existingProfile?.terms_agreed || !existingProfile?.privacy_agreed;
            const { error: profileError } = await db.profiles.update(session.user.id, {
              auth_provider: provider,
              ...(needsConsentUpdate ? consentFields : {}),
            });
            if (profileError) {
              console.error('[Onboarding] Profile update error:', profileError);
            }
          } else {
            // Create new profile with consent fields (login = agreement as per login screen disclaimer)
            const { error: profileError } = await db.profiles.upsert({
              id: session.user.id,
              nickname: userObject.nickname,
              email: userObject.email || undefined,
              auth_provider: provider,
              ...consentFields,
            });
            if (profileError) {
              console.error('[Onboarding] Profile upsert error:', profileError);
            }
          }

          // Check if user already has a completed couple (already paired)
          const { data: existingCouple, error: coupleError } = await db.couples.getActiveByUserId(session.user.id);
          console.log('[Onboarding] Couple check result:', { existingCouple, coupleError });

          if (existingCouple && existingCouple.user1_id && existingCouple.user2_id) {
            console.log('[Onboarding] User already paired');

            // Check if profile is complete (has birthDate and preferences)
            const hasCompleteBirthDate = !!existingProfile?.birth_date;
            const hasCompletePreferences = existingProfile?.preferences &&
              Object.keys(existingProfile.preferences).length > 0 &&
              existingProfile.preferences.mbti; // Check for at least mbti as indicator of completed preferences
            const isProfileComplete = hasCompleteBirthDate && hasCompletePreferences;

            console.log('[Onboarding] Profile completeness check:', {
              hasCompleteBirthDate,
              hasCompletePreferences,
              isProfileComplete,
              birth_date: existingProfile?.birth_date,
              preferences: existingProfile?.preferences
            });

            // Set couple in auth store (needed for both complete and incomplete profiles)
            setCouple({
              id: existingCouple.id,
              user1Id: existingCouple.user1_id,
              user2Id: existingCouple.user2_id,
              anniversaryDate: existingCouple.dating_start_date ? parseDateAsLocal(existingCouple.dating_start_date) : undefined,
              datingStartDate: existingCouple.dating_start_date ? parseDateAsLocal(existingCouple.dating_start_date) : undefined,
              anniversaryType: t('onboarding.anniversary.datingStart'),
              status: 'active',
              createdAt: existingCouple.created_at ? new Date(existingCouple.created_at) : new Date(),
            });

            // Fetch partner profile
            const partnerId = existingCouple.user1_id === session.user.id
              ? existingCouple.user2_id
              : existingCouple.user1_id;

            const { data: partnerProfile } = await db.profiles.get(partnerId);
            if (partnerProfile) {
              setPartner({
                id: partnerId,
                email: partnerProfile.email || '',
                nickname: partnerProfile.nickname || '',
                inviteCode: '',
                birthDate: partnerProfile.birth_date ? parseDateAsLocal(partnerProfile.birth_date) : undefined,
                preferences: partnerProfile.preferences || {},
                createdAt: partnerProfile.created_at ? new Date(partnerProfile.created_at) : new Date(),
              });
            }

            // Cleanup any orphaned pending couples for this user
            // This prevents stale couples from interfering with future logins
            console.log('[Onboarding] Cleaning up orphaned pending couples for user:', session.user.id);
            await db.couples.cleanupPendingCouples(session.user.id, existingCouple.id);

            if (isProfileComplete) {
              // Profile is complete - go directly to home
              console.log('[Onboarding] Profile complete, going directly to home');

              // Restore data to onboardingStore so profile page can display it
              const prefs = existingProfile?.preferences as Record<string, unknown> | undefined;
              updateData({
                nickname: existingProfile?.nickname || '',
                birthDate: existingProfile?.birth_date ? parseDateAsLocal(existingProfile.birth_date) : undefined,
                birthDateCalendarType: (existingProfile?.birth_date_calendar_type as CalendarType) || (prefs?.birthDateCalendarType as CalendarType) || 'solar',
                mbti: (prefs?.mbti as string) || '',
                gender: (prefs?.gender as Gender) || null,
                activityTypes: (prefs?.activityTypes as ActivityType[]) || [],
                dateWorries: (prefs?.dateWorries as DateWorry[]) || [],
                constraints: (prefs?.constraints as Constraint[]) || [],
                relationshipType: (prefs?.relationshipType as RelationshipType) || 'dating',
                anniversaryDate: existingCouple.dating_start_date ? parseDateAsLocal(existingCouple.dating_start_date) : undefined,
                isPairingConnected: true,
              });

              setIsRedirectingToHome(true);
              setIsOnboardingComplete(true);
              router.replace('/(tabs)');
              return;
            } else {
              // Profile is incomplete - user needs to complete onboarding
              console.log('[Onboarding] Profile incomplete, continuing onboarding from basic_info');

              // Only set to false if it was true (avoid unnecessary state updates)
              // This prevents _layout.tsx from redirecting to tabs when profile is incomplete
              if (isOnboardingComplete) {
                console.log('[Onboarding] Resetting isOnboardingComplete to false for incomplete profile');
                setIsOnboardingComplete(false);
              }

              // Set isPairingConnected so the auto-skip useEffect will work
              updateData({ isPairingConnected: true });

              // Restore any existing data to onboardingStore
              if (existingProfile?.birth_date) {
                updateData({ birthDate: parseDateAsLocal(existingProfile.birth_date) });
              }
              if (existingCouple.dating_start_date) {
                updateData({ anniversaryDate: parseDateAsLocal(existingCouple.dating_start_date) });
              }

              // Go to basic_info step to complete profile
              animateTransition(() => setStep('basic_info'));
              return;
            }
          }

          // Go directly to pairing (terms removed from flow)
          console.log('[Onboarding] User login success, going to pairing');

          // CRITICAL: Ensure isOnboardingComplete is false for new users
          // This prevents _layout.tsx from redirecting to tabs if the state was somehow true
          // (e.g., from previous session, race condition, or hydration issues on Android)
          if (isOnboardingComplete) {
            console.log('[Onboarding] Resetting isOnboardingComplete to false for new user');
            setIsOnboardingComplete(false);
          }

          const providerName = provider === 'google' ? 'Google' : provider === 'kakao' ? 'Kakao' : 'Apple';
          Alert.alert(
            t('onboarding.login.success'),
            t('onboarding.login.successMessage', { provider: providerName }),
            [
              {
                text: t('onboarding.continue'),
                onPress: () => animateTransition(() => setStep('pairing')),
              },
            ]
          );
        } catch (dbError) {
          console.error('[Onboarding] DB error:', dbError);
          // Ensure isOnboardingComplete is false on error
          if (isOnboardingComplete) {
            setIsOnboardingComplete(false);
          }
          // On error, fallback to pairing step for safety
          animateTransition(() => setStep('pairing'));
        }
      }
    } catch (error: any) {
      console.error(`[Onboarding] ${provider} login failed:`, error);
      Alert.alert(
        t('onboarding.login.failed'),
        error.message || t('onboarding.login.failedMessage'),
        [{ text: t('onboarding.confirm') }]
      );
    }
  }, [animateTransition, setStep, setUser, updateData]);

  // Email Login Handler
  const handleEmailLogin = useCallback(async (email: string, password: string, isSignUp: boolean) => {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }

    try {
      console.log(`[Onboarding] Starting email ${isSignUp ? 'sign up' : 'login'}...`);

      let session;
      if (isSignUp) {
        // Sign up with email/password
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: email.split('@')[0],
            }
          }
        });

        if (error) throw error;

        if (data.user && !data.session) {
          // Email confirmation required
          Alert.alert(
            t('auth.email.signUpSuccess'),
            t('auth.email.checkEmail'),
            [{ text: t('onboarding.confirm') }]
          );
          return;
        }

        session = data.session;
      } else {
        // Sign in with email/password
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        session = data.session;
      }

      if (session && session.user) {
        console.log(`[Onboarding] Email auth successful:`, session.user.id);

        // Check if user already exists in database
        const { data: existingProfile } = await db.profiles.get(session.user.id);
        const isExistingDbUser = !!existingProfile;

        // Create user object
        const dbPreferences = existingProfile?.preferences as Record<string, unknown> | undefined;
        const birthDateCalendarType = (existingProfile?.birth_date_calendar_type as 'solar' | 'lunar')
          || (dbPreferences?.birthDateCalendarType as 'solar' | 'lunar')
          || 'solar';

        const userObject = {
          id: session.user.id,
          email: existingProfile?.email || email,
          nickname: existingProfile?.nickname || email.split('@')[0] || t('onboarding.defaultUser'),
          inviteCode: generatePairingCode(),
          birthDate: existingProfile?.birth_date ? parseDateAsLocal(existingProfile.birth_date) : undefined,
          birthDateCalendarType,
          preferences: existingProfile?.preferences || {} as any,
          createdAt: existingProfile?.created_at ? new Date(existingProfile.created_at) : new Date(),
        };

        setUser(userObject);

        if (existingProfile?.nickname) {
          updateData({ nickname: existingProfile.nickname });
        }

        // Consent fields
        const consentFields = {
          age_verified: true,
          terms_agreed: true,
          location_terms_agreed: true,
          privacy_agreed: true,
          consent_given_at: new Date().toISOString(),
        };

        if (isExistingDbUser) {
          const needsConsentUpdate = !existingProfile?.terms_agreed || !existingProfile?.privacy_agreed;
          await db.profiles.update(session.user.id, {
            auth_provider: 'email',
            ...(needsConsentUpdate ? consentFields : {}),
          });
        } else {
          await db.profiles.upsert({
            id: session.user.id,
            nickname: userObject.nickname,
            email: userObject.email || undefined,
            auth_provider: 'email',
            ...consentFields,
          });
        }

        // Check if user already has a completed couple
        const { data: existingCouple } = await db.couples.getActiveByUserId(session.user.id);

        if (existingCouple && existingCouple.user1_id && existingCouple.user2_id) {
          console.log('[Onboarding] Email user already paired');

          const hasCompleteBirthDate = !!existingProfile?.birth_date;
          const hasCompletePreferences = existingProfile?.preferences &&
            Object.keys(existingProfile.preferences).length > 0 &&
            existingProfile.preferences.mbti;
          const isProfileComplete = hasCompleteBirthDate && hasCompletePreferences;

          setCouple({
            id: existingCouple.id,
            user1Id: existingCouple.user1_id,
            user2Id: existingCouple.user2_id,
            anniversaryDate: existingCouple.dating_start_date ? parseDateAsLocal(existingCouple.dating_start_date) : undefined,
            datingStartDate: existingCouple.dating_start_date ? parseDateAsLocal(existingCouple.dating_start_date) : undefined,
            anniversaryType: t('onboarding.anniversary.datingStart'),
            status: 'active',
            createdAt: existingCouple.created_at ? new Date(existingCouple.created_at) : new Date(),
          });

          const partnerId = existingCouple.user1_id === session.user.id
            ? existingCouple.user2_id
            : existingCouple.user1_id;

          const { data: partnerProfile } = await db.profiles.get(partnerId);
          if (partnerProfile) {
            setPartner({
              id: partnerId,
              email: partnerProfile.email || '',
              nickname: partnerProfile.nickname || '',
              inviteCode: '',
              birthDate: partnerProfile.birth_date ? parseDateAsLocal(partnerProfile.birth_date) : undefined,
              preferences: partnerProfile.preferences || {},
              createdAt: partnerProfile.created_at ? new Date(partnerProfile.created_at) : new Date(),
            });
          }

          await db.couples.cleanupPendingCouples(session.user.id, existingCouple.id);

          if (isProfileComplete) {
            const prefs = existingProfile?.preferences as Record<string, unknown> | undefined;
            updateData({
              nickname: existingProfile?.nickname || '',
              birthDate: existingProfile?.birth_date ? parseDateAsLocal(existingProfile.birth_date) : undefined,
              birthDateCalendarType: (existingProfile?.birth_date_calendar_type as CalendarType) || (prefs?.birthDateCalendarType as CalendarType) || 'solar',
              mbti: (prefs?.mbti as string) || '',
              gender: (prefs?.gender as Gender) || null,
              activityTypes: (prefs?.activityTypes as ActivityType[]) || [],
              dateWorries: (prefs?.dateWorries as DateWorry[]) || [],
              constraints: (prefs?.constraints as Constraint[]) || [],
              relationshipType: (prefs?.relationshipType as RelationshipType) || 'dating',
              anniversaryDate: existingCouple.dating_start_date ? parseDateAsLocal(existingCouple.dating_start_date) : undefined,
              isPairingConnected: true,
            });

            setIsRedirectingToHome(true);
            setIsOnboardingComplete(true);
            router.replace('/(tabs)');
            return;
          } else {
            updateData({ isPairingConnected: true });
            if (existingProfile?.birth_date) {
              updateData({ birthDate: parseDateAsLocal(existingProfile.birth_date) });
            }
            if (existingCouple.dating_start_date) {
              updateData({ anniversaryDate: parseDateAsLocal(existingCouple.dating_start_date) });
            }
            animateTransition(() => setStep('basic_info'));
            return;
          }
        }

        // Go to pairing
        console.log('[Onboarding] Email login success, going to pairing');
        Alert.alert(
          t('onboarding.login.success'),
          t('onboarding.login.successMessage', { provider: 'Email' }),
          [
            {
              text: t('onboarding.continue'),
              onPress: () => animateTransition(() => setStep('pairing')),
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('[Onboarding] Email auth failed:', error);
      throw error;
    }
  }, [animateTransition, setStep, setUser, updateData, setCouple, setPartner, setIsOnboardingComplete, router, t]);

  const handleComplete = useCallback(async () => {
    updateNickname(data.nickname);

    // Get current auth state
    const currentUser = useAuthStore.getState().user;
    const currentCouple = useAuthStore.getState().couple;

    // Update user nickname in authStore
    if (currentUser) {
      setUser({
        ...currentUser,
        nickname: data.nickname,
      });
    }

    // Save onboarding data to Supabase if not in test mode
    if (!isInTestMode()) {
      try {
        if (currentUser?.id) {
          // Prepare preferences object for DB storage (birthDateCalendarType is now a separate column)
          const preferences = {
            mbti: data.mbti,
            gender: data.gender,
            activityTypes: data.activityTypes,
            dateWorries: data.dateWorries,
            constraints: data.constraints,
            relationshipType: data.relationshipType,
          };

          // Build update object with core fields
          // Note: Consent fields are set on login (login = agreement as per login screen disclaimer)
          const profileUpdate: Record<string, unknown> = {
            nickname: data.nickname,
            birth_date: data.birthDate ? formatDateToLocal(data.birthDate) : null,
            birth_date_calendar_type: data.birthDateCalendarType,
            preferences,
            couple_id: currentCouple?.id || null,
            is_onboarding_complete: true,
          };

          // Update profile with birth date, preferences, completion status, and consent fields (if applicable)
          const { error: profileError } = await db.profiles.update(currentUser.id, profileUpdate);

          if (profileError) {
            console.error('Profile update error:', profileError);
          }

          // Update couple with anniversary date (couple was already created in pairing step)
          console.log('Checking couple update conditions:', {
            hasAnniversaryDate: !!data.anniversaryDate,
            coupleId: currentCouple?.id,
            anniversaryDate: data.anniversaryDate instanceof Date ? data.anniversaryDate.toISOString() : data.anniversaryDate,
          });

          if (data.anniversaryDate && currentCouple?.id) {
            const { data: updateData, error: coupleError } = await db.couples.update(currentCouple.id, {
              dating_start_date: formatDateToLocal(data.anniversaryDate),
              wedding_date: data.relationshipType === 'married' ? formatDateToLocal(data.anniversaryDate) : null,
            });

            console.log('Couple update result:', { updateData, coupleError });

            if (coupleError) {
              console.error('Couple update error:', coupleError);
            }

            // Update couple in authStore with anniversary
            setCouple({
              ...currentCouple,
              anniversaryDate: data.anniversaryDate,
              datingStartDate: data.anniversaryDate,
              weddingDate: data.relationshipType === 'married' ? data.anniversaryDate : undefined,
            });
          } else {
            console.warn('Skipping couple update - missing data:', {
              anniversaryDate: data.anniversaryDate,
              coupleId: currentCouple?.id,
            });
          }
        }
      } catch (error) {
        console.error('Error saving onboarding data to Supabase:', error);
        // Don't show alert - just log and continue
        // The data can be synced later
      }
    } else {
      // Demo mode: update couple in authStore with anniversary
      if (data.anniversaryDate && currentCouple) {
        setCouple({
          ...currentCouple,
          anniversaryDate: data.anniversaryDate,
          datingStartDate: data.anniversaryDate,
          weddingDate: data.relationshipType === 'married' ? data.anniversaryDate : undefined,
        });
      }
    }

    setIsOnboardingComplete(true);
    router.replace('/(tabs)');
  }, [data, updateNickname, setIsOnboardingComplete, router, setUser, setCouple]);

  // Progress calculation - use effectiveStep for rendering
  const getProgress = () => {
    if (effectiveStep === 'welcome' || effectiveStep === 'login') return 0;
    if (effectiveStep === 'complete') return 1;

    const stepAIndex = STEP_A.indexOf(effectiveStep);
    if (stepAIndex !== -1) {
      return (stepAIndex + 1) / STEP_A.length * 0.5;
    }

    if (effectiveStep === 'preferences_intro') return 0.5;

    const stepBIndex = STEP_B.indexOf(effectiveStep);
    if (stepBIndex !== -1) {
      return 0.5 + ((stepBIndex + 1) / STEP_B.length * 0.5);
    }

    return 0;
  };

  const showProgress = !['welcome', 'login', 'complete'].includes(effectiveStep);

  // Show loading screen while redirecting to home (for returning users)
  if (isRedirectingToHome) {
    return (
      <View style={styles.container}>
        <View style={styles.whiteBackground} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, styles.whiteContainer]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      enabled={effectiveStep !== 'basic_info' && effectiveStep !== 'pairing' && effectiveStep !== 'welcome'}
    >
      {/* Status bar style - dark for all screens (white bg) */}
      <StatusBar barStyle="dark-content" />

      {/* Background - White for all steps */}
      <View style={styles.whiteBackground} />

      {/* Progress Bar */}
      {showProgress && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${getProgress() * 100}%` }]} />
          </View>
        </View>
      )}

      {/* Logout button - shown only on pairing step */}
      {effectiveStep === 'pairing' && (
        <Pressable
          style={styles.logoutButton}
          onPress={async () => {
            try {
              await signOut();
              useAuthStore.getState().signOut();
              useOnboardingStore.getState().reset();
              setStep('welcome');
            } catch (error) {
              console.error('[Onboarding] Logout error:', error);
            }
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <LogOut size={18} color={COLORS.black} />
          <Text style={styles.logoutButtonText}>{t('settings.account.logout')}</Text>
        </Pressable>
      )}

      {/* Delete Account button - shown only on pairing step (for App Store compliance) */}
      {effectiveStep === 'pairing' && (
        <Pressable
          style={styles.deleteAccountButton}
          onPress={async () => {
            Alert.alert(
              t('settings.deleteAccount.confirmAlertTitle'),
              t('settings.deleteAccount.confirmAlertMessage'),
              [
                { text: t('common.cancel'), style: 'cancel' },
                {
                  text: t('common.confirm'),
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      // Get current user ID
                      let userId: string | undefined;
                      if (supabase) {
                        const { data: authData } = await supabase.auth.getUser();
                        userId = authData?.user?.id;
                      }

                      // Delete from database
                      if (userId) {
                        await db.account.deleteAccount(userId, null);
                      }

                      // Sign out
                      await signOut();

                      // Reset stores
                      useAuthStore.getState().signOut();
                      useOnboardingStore.getState().reset();

                      // Clear local storage
                      await db.account.clearLocalStorage();

                      // Generate new pairing code for next session (important!)
                      // Without this, the same code would be reused after account deletion
                      setGeneratedCode(generatePairingCode());

                      Alert.alert(
                        t('settings.deleteAccount.success'),
                        t('settings.deleteAccount.successMessage')
                      );

                      setStep('welcome');
                    } catch (error) {
                      console.error('[Onboarding] Account deletion error:', error);
                      Alert.alert(t('common.error'), t('settings.deleteAccount.error'));
                    }
                  },
                },
              ]
            );
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.deleteAccountButtonText}>{t('settings.account.deleteAccount')}</Text>
          <UserX size={18} color="#FF4444" />
        </Pressable>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
        bounces={false}
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          {effectiveStep === 'welcome' && (
            <WelcomeStep
              onSocialLogin={handleSocialLogin}
              onEmailLogin={handleEmailLogin}
            />
          )}
          {effectiveStep === 'pairing' && (
            <PairingStep
              isCreatingCode={data.isCreatingCode}
              setIsCreatingCode={(value) => updateData({ isCreatingCode: value })}
              pairingCode={data.pairingCode}
              setPairingCode={(code) => updateData({ pairingCode: code })}
              generatedCode={generatedCode}
              setGeneratedCode={setGeneratedCode}
              isPairingConnected={data.isPairingConnected}
              setIsPairingConnected={(value) => updateData({ isPairingConnected: value })}
              setCouple={setCouple}
              setUser={setUser}
              setPartner={setPartner}
              currentUser={currentUser}
              setIsOnboardingComplete={setIsOnboardingComplete}
              router={router}
              onNext={handleNext}
              onBack={handlePairingBack}
              updateData={updateData}
              hideBackButton={isExistingUser}
            />
          )}
          {effectiveStep === 'basic_info' && (
            <BasicInfoStep
              nickname={data.nickname}
              setNickname={(name) => updateData({ nickname: name })}
              birthDate={data.birthDate}
              setBirthDate={(date) => updateData({ birthDate: date })}
              calendarType={data.birthDateCalendarType}
              setCalendarType={(type) => updateData({ birthDateCalendarType: type })}
              onNext={async () => {
                // Save profile data immediately to trigger realtime sync with partner
                await saveProfileDataImmediately();

                // Creator (isCreatingCode): Skip couple_info, go directly to preferences_intro
                // Joiner (!isCreatingCode): Go to couple_info to enter anniversary date
                if (data.isCreatingCode) {
                  // If user already has preference data, skip to complete
                  if (hasExistingPreferences) {
                    Alert.alert(
                      t('onboarding.dataRecovery.title'),
                      t('onboarding.dataRecovery.message'),
                      [{ text: t('onboarding.confirm'), onPress: () => animateTransition(() => setStep('complete')) }]
                    );
                  } else {
                    animateTransition(() => setStep('preferences_intro'));
                  }
                } else {
                  handleNext(); // Goes to couple_info
                }
              }}
              onBack={handleBack}
            />
          )}
          {effectiveStep === 'couple_info' && (
            <CoupleInfoStep
              relationshipType={data.relationshipType}
              setRelationshipType={(type) => updateData({ relationshipType: type })}
              anniversaryDate={data.anniversaryDate}
              setAnniversaryDate={(date) => updateData({ anniversaryDate: date })}
              onNext={async () => {
                // Save anniversary date immediately so creator can see it right away
                // This prevents the sync issue where creator sees wrong date before joiner completes onboarding
                await saveAnniversaryDateImmediately();

                // If user already has preference data, skip to complete
                if (hasExistingPreferences) {
                  Alert.alert(
                    t('onboarding.dataRecovery.title'),
                    t('onboarding.dataRecovery.message'),
                    [{ text: t('onboarding.confirm'), onPress: () => animateTransition(() => setStep('complete')) }]
                  );
                } else {
                  handleNext(); // Goes to preferences_intro
                }
              }}
              onBack={handleBack}
            />
          )}
          {effectiveStep === 'preferences_intro' && (
            <PreferencesIntroStep
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {effectiveStep === 'mbti' && (
            <MBTIStep
              mbti={data.mbti}
              setMbti={(mbti) => updateData({ mbti })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {effectiveStep === 'activity_type' && (
            <ActivityTypeStep
              activityTypes={data.activityTypes}
              setActivityTypes={(types) => updateData({ activityTypes: types })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {effectiveStep === 'date_worries' && (
            <DateWorriesStep
              dateWorries={data.dateWorries || []}
              setDateWorries={(worries) => updateData({ dateWorries: worries })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {effectiveStep === 'constraints' && (
            <ConstraintsStep
              constraints={data.constraints}
              setConstraints={(cons) => updateData({ constraints: cons })}
              onNext={() => animateTransition(() => setStep('complete'))}
              onBack={handleBack}
            />
          )}
          {effectiveStep === 'complete' && (
            <CompleteStep
              nickname={data.nickname}
              onComplete={handleComplete}
            />
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ========== STEP COMPONENTS ==========

// Welcome Step
function WelcomeStep({ onSocialLogin, onEmailLogin }: {
  onSocialLogin: (provider: 'google' | 'kakao' | 'apple') => Promise<void>;
  onEmailLogin: (email: string, password: string, isSignUp: boolean) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState<'google' | 'kakao' | 'apple' | 'email' | null>(null);

  // Email login state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Keyboard animation for modal
  const modalTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        if (showEmailModal) {
          Animated.timing(modalTranslateY, {
            toValue: -e.endCoordinates.height / 2.5,
            duration: Platform.OS === 'ios' ? 250 : 100,
            useNativeDriver: true,
          }).start();
        }
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.timing(modalTranslateY, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? 250 : 100,
          useNativeDriver: true,
        }).start();
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [showEmailModal, modalTranslateY]);

  // Font and style settings per language
  // English/Spanish: Poetsen One, Japanese: Mochiy Pop One, Chinese: Chiron GoRound TC, Korean: Jua
  const getTaglineStyle = () => {
    const lang = i18n.language;
    if (['en', 'es'].includes(lang)) {
      return { font: 'PoetsenOne', letterSpacing: 0, lineHeight: 48, fontSize: 38, fontWeight: '400' as const };
    } else if (lang === 'ja') {
      return { font: 'MochiyPopOne', letterSpacing: 0, lineHeight: 40, fontSize: 28, fontWeight: '400' as const };
    } else if (lang === 'zh-TW') {
      return { font: 'ChironGoRoundTC', letterSpacing: 0, lineHeight: 42, fontSize: 30, fontWeight: '400' as const };
    }
    // Korean default
    return { font: TYPOGRAPHY.fontFamily.display, letterSpacing: -1, lineHeight: 58, fontSize: 42, fontWeight: '400' as const };
  };
  const taglineStyle = getTaglineStyle();

  const handleSocialLogin = async (provider: 'google' | 'kakao' | 'apple') => {
    console.log(`[WelcomeStep] Button pressed for ${provider}, isLoading: ${isLoading}, isDemoMode: ${isDemoMode}`);

    if (isLoading) {
      console.log('[WelcomeStep] Already loading, returning early');
      return;
    }

    setIsLoading(provider);
    console.log(`[WelcomeStep] Set loading state to ${provider}`);

    try {
      if (isDemoMode) {
        console.log('[WelcomeStep] isDemoMode is TRUE - showing demo alert');
        Alert.alert(
          t('onboarding.login.demoMode'),
          t('onboarding.login.demoModeMessage'),
          [{ text: t('onboarding.confirm') }]
        );
        return;
      }

      console.log(`[WelcomeStep] isDemoMode is FALSE, calling onSocialLogin for ${provider}...`);
      await onSocialLogin(provider);
      console.log(`[WelcomeStep] onSocialLogin completed for ${provider}`);
    } catch (error) {
      console.error(`[WelcomeStep] ${provider} login error:`, error);
      const providerName = provider === 'google' ? 'Google' : provider === 'kakao' ? 'Kakao' : 'Apple';
      Alert.alert(
        t('onboarding.login.failed'),
        t('onboarding.login.failedProvider', { provider: providerName }),
        [{ text: t('onboarding.confirm') }]
      );
    } finally {
      setIsLoading(null);
    }
  };

  // Handle email login (login only, no sign up)
  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.email.emptyFields'));
      return;
    }

    if (password.length < 6) {
      Alert.alert(t('common.error'), t('auth.email.passwordTooShort'));
      return;
    }

    // Dismiss keyboard before starting login to prevent layout shift
    Keyboard.dismiss();

    setIsLoading('email');
    try {
      await onEmailLogin(email, password, false); // Always login, never sign up
      // Don't close modal on success - let navigation/step change handle it
      // Closing modal here causes brief layout flash as keyboard dismisses
      // The component will unmount or step will change, handling cleanup naturally
    } catch (error: any) {
      console.error('Email auth error:', error);
      Alert.alert(t('common.error'), error.message || t('auth.email.error'));
      // Only reset form on error
      setEmail('');
      setPassword('');
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <View style={styles.welcomeStepContainer}>
      {/* Tagline at top-left with responsive spacing */}
      <View style={styles.welcomeTaglineContainer}>
        <Text style={[styles.welcomeTagline, { fontFamily: taglineStyle.font, letterSpacing: taglineStyle.letterSpacing, lineHeight: taglineStyle.lineHeight, fontSize: taglineStyle.fontSize, fontWeight: taglineStyle.fontWeight }]}>{t('onboarding.tagline')}</Text>
      </View>

      {/* Login buttons fixed at bottom */}
      <View style={styles.welcomeBottomContainer}>
        <View style={styles.socialLoginContainer}>
          {/* Apple Login Button (iOS only) */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              style={[styles.socialButton, styles.appleButton, isLoading !== null && styles.disabledButton]}
              onPress={() => handleSocialLogin('apple')}
              disabled={isLoading !== null}
              activeOpacity={0.7}
            >
              {isLoading === 'apple' ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <>
                  <View style={styles.socialIconContainer}>
                    <Ionicons name="logo-apple" size={20} color="#000000" />
                  </View>
                  <Text style={styles.appleButtonText}>{t('onboarding.login.apple')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Google Login Button */}
          <TouchableOpacity
            style={[styles.socialButton, styles.googleButton, isLoading !== null && styles.disabledButton]}
            onPress={() => handleSocialLogin('google')}
            disabled={isLoading !== null}
            activeOpacity={0.7}
          >
            {isLoading === 'google' ? (
              <ActivityIndicator size="small" color="#757575" />
            ) : (
              <>
                <View style={styles.socialIconContainer}>
                  <GoogleLogo size={18} />
                </View>
                <Text style={styles.googleButtonText}>{t('onboarding.login.google')}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Kakao Login Button */}
          <TouchableOpacity
            style={[styles.socialButton, styles.kakaoButton, isLoading !== null && styles.disabledButton]}
            onPress={() => handleSocialLogin('kakao')}
            disabled={isLoading !== null}
            activeOpacity={0.7}
          >
            {isLoading === 'kakao' ? (
              <ActivityIndicator size="small" color="#3C1E1E" />
            ) : (
              <>
                <View style={styles.socialIconContainer}>
                  <KakaoLogo size={22} />
                </View>
                <Text style={styles.kakaoButtonText}>{t('onboarding.login.kakao')}</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Email Login Text Link - After social buttons (for App Store compliance) */}
          <Pressable
            style={styles.emailLoginLink}
            onPress={() => setShowEmailModal(true)}
            disabled={isLoading !== null}
          >
            {isLoading === 'email' ? (
              <ActivityIndicator size="small" color="#000000" />
            ) : (
              <Text style={styles.emailLoginLinkText}>{t('auth.email.button')}</Text>
            )}
          </Pressable>
        </View>

        {/* Terms disclaimer */}
        <View style={styles.termsDisclaimerContainer}>
          <Text style={styles.termsDisclaimerText}>
            {t('onboarding.login.termsDisclaimer.prefix')}
            <Text
              style={styles.termsDisclaimerLink}
              onPress={() => Linking.openURL('https://daydate.my/policy/privacy')}
              suppressHighlighting={true}
            >
              {t('onboarding.login.termsDisclaimer.privacy')}
            </Text>
            {t('onboarding.login.termsDisclaimer.comma')}
            <Text
              style={styles.termsDisclaimerLink}
              onPress={() => Linking.openURL('https://daydate.my/policy/terms')}
              suppressHighlighting={true}
            >
              {t('onboarding.login.termsDisclaimer.terms')}
            </Text>
            {t('onboarding.login.termsDisclaimer.connector')}
            <Text
              style={styles.termsDisclaimerLink}
              onPress={() => Linking.openURL('https://daydate.my/policy/location')}
              suppressHighlighting={true}
            >
              {t('onboarding.login.termsDisclaimer.location')}
            </Text>
            {t('onboarding.login.termsDisclaimer.suffix')}
          </Text>
        </View>
      </View>

      {/* Email Login Modal */}
      <Modal
        visible={showEmailModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          Keyboard.dismiss();
          setShowEmailModal(false);
        }}
        statusBarTranslucent={true}
      >
        <Pressable
          style={styles.emailModalOverlay}
          onPress={() => {
            Keyboard.dismiss();
            setShowEmailModal(false);
          }}
        >
          <Animated.View
            style={[
              styles.emailModalContent,
              { transform: [{ translateY: modalTranslateY }] }
            ]}
          >
            <View style={styles.emailModalHeader}>
              <Text style={styles.emailModalTitle}>
                {t('auth.email.loginTitle')}
              </Text>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setShowEmailModal(false);
                }}
                style={styles.emailModalCloseButton}
              >
                <X size={24} color={COLORS.black} />
              </Pressable>
            </View>

            <TextInput
              style={styles.emailInput}
              placeholder={t('auth.email.emailPlaceholder')}
              placeholderTextColor="rgba(0, 0, 0, 0.4)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              style={styles.emailInput}
              placeholder={t('auth.email.passwordPlaceholder')}
              placeholderTextColor="rgba(0, 0, 0, 0.4)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.emailSubmitButton, isLoading === 'email' && styles.disabledButton]}
              onPress={handleEmailAuth}
              disabled={isLoading === 'email'}
              activeOpacity={0.7}
            >
              <Text style={styles.emailSubmitText}>
                {isLoading === 'email' ? t('common.loading') : t('auth.email.login')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

// Basic Info Step - Nickname and birthdate only
function BasicInfoStep({
  nickname,
  setNickname,
  birthDate,
  setBirthDate,
  calendarType,
  setCalendarType,
  onNext,
  onBack,
}: {
  nickname: string;
  setNickname: (name: string) => void;
  birthDate: Date | null;
  setBirthDate: (date: Date | null) => void;
  calendarType: CalendarType;
  setCalendarType: (type: CalendarType) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [showBirthDatePicker, setShowBirthDatePicker] = useState(false);

  const ensureBirthDate = (date: Date | string | null): Date => {
    if (!date) return new Date(2000, 0, 1);
    if (date instanceof Date) return date;
    return new Date(date);
  };

  const [tempBirthDate, setTempBirthDate] = useState(ensureBirthDate(birthDate));

  const formatDate = (date: Date | string | null) => {
    const d = date instanceof Date ? date : date ? new Date(date) : new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  const handleBirthDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowBirthDatePicker(false);
      if (selectedDate) {
        setBirthDate(selectedDate);
      }
    } else {
      if (selectedDate) {
        setTempBirthDate(selectedDate);
      }
    }
  };

  const handleConfirmBirthDate = () => {
    setBirthDate(tempBirthDate);
    setShowBirthDatePicker(false);
  };

  const isValid = nickname.trim().length >= 1 && birthDate !== null;

  return (
    <View style={styles.centeredStepContainer}>
      {/* Title fixed at top */}
      <View style={styles.nicknameTitleContainer}>
        <Text style={styles.stepTitle}>{t('onboarding.basicInfo.title')}</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.basicInfoScrollView}
        contentContainerStyle={styles.basicInfoScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Nickname */}
        <View style={styles.basicInfoSection}>
          <Text style={styles.basicInfoLabel}>{t('onboarding.basicInfo.nickname')}</Text>
          <TextInput
            style={styles.basicInfoInput}
            placeholderTextColor="rgba(0, 0, 0, 0.4)"
            placeholder={t('onboarding.basicInfo.nicknamePlaceholder')}
            value={nickname}
            onChangeText={setNickname}
            autoCapitalize="none"
            maxLength={10}
          />
        </View>

        {/* Birth Date */}
        <View style={styles.basicInfoSection}>
          <Text style={styles.basicInfoLabel}>{t('onboarding.basicInfo.birthDate')}</Text>
          <View style={styles.birthDateRow}>
            {/* Date picker button */}
            <Pressable
              style={styles.birthDateButton}
              onPress={() => setShowBirthDatePicker(true)}
            >
              <Text style={[styles.basicInfoDateText, birthDate && styles.basicInfoDateTextSelected]}>
                {birthDate ? formatDate(birthDate) : t('onboarding.basicInfo.birthDatePlaceholder')}
              </Text>
              <Calendar color={birthDate ? COLORS.black : 'rgba(0, 0, 0, 0.4)'} size={20} />
            </Pressable>
            {/* Calendar Type buttons on the right */}
            <View style={styles.calendarTypeButtons}>
              <Pressable
                style={[styles.calendarTypeButtonSmall, calendarType === 'solar' && styles.calendarTypeButtonActive]}
                onPress={() => setCalendarType('solar')}
              >
                <Text style={[styles.calendarTypeButtonText, calendarType === 'solar' && styles.calendarTypeButtonTextActive]}>
                  {t('onboarding.basicInfo.solar')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.calendarTypeButtonSmall, calendarType === 'lunar' && styles.calendarTypeButtonActive]}
                onPress={() => setCalendarType('lunar')}
              >
                <Text style={[styles.calendarTypeButtonText, calendarType === 'lunar' && styles.calendarTypeButtonTextActive]}>
                  {t('onboarding.basicInfo.lunar')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Birth Date Picker Modals */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showBirthDatePicker}
          transparent
          animationType="slide"
        >
          <View style={styles.datePickerModal}>
            <View style={styles.datePickerModalContent}>
              <View style={styles.datePickerHeader}>
                <Pressable onPress={() => setShowBirthDatePicker(false)}>
                  <Text style={styles.datePickerCancel}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable onPress={handleConfirmBirthDate}>
                  <Text style={styles.datePickerConfirm}>{t('common.confirm')}</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempBirthDate}
                mode="date"
                display="spinner"
                onChange={handleBirthDateChange}
                maximumDate={new Date()}
                locale="ko-KR"
                style={styles.datePicker}
              />
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showBirthDatePicker && (
        <DateTimePicker
          value={tempBirthDate}
          mode="date"
          display="default"
          onChange={handleBirthDateChange}
          maximumDate={new Date()}
        />
      )}

      {/* Buttons fixed at bottom */}
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.secondaryButton, styles.secondaryButtonDisabled]}
          onPress={onBack}
          disabled={true}
        >
          <Text style={[styles.secondaryButtonText, styles.secondaryButtonTextDisabled]}>{t('onboarding.previous')}</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.primaryButtonDisabled]}
          onPress={onNext}
          disabled={!isValid}
        >
          <Text style={styles.primaryButtonText}>{t('onboarding.next')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Terms Step
function TermsStep({
  onNext,
  onBack,
  updateData,
}: {
  onNext: () => void;
  onBack: () => void;
  updateData: (data: Partial<import('@/stores/onboardingStore').OnboardingData>) => void;
}) {
  const { t } = useTranslation();
  const [ageVerified, setAgeVerified] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [locationTermsAgreed, setLocationTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [marketingAgreed, setMarketingAgreed] = useState(false);

  const [policyModalVisible, setPolicyModalVisible] = useState(false);
  const [policyUrl, setPolicyUrl] = useState('');
  const [policyTitle, setPolicyTitle] = useState('');
  const [webViewLoading, setWebViewLoading] = useState(true);

  const requiredAgreed = ageVerified && termsAgreed && locationTermsAgreed && privacyAgreed;
  const allAgreed = requiredAgreed && marketingAgreed;

  const handleAgreeAll = async () => {
    const newValue = !allAgreed;

    if (newValue) {
      // Request location permission first (required)
      const locationGranted = await requestLocationPermission();
      if (!locationGranted) {
        // Don't toggle if location permission is not granted
        return;
      }

      // Request notification permission (optional)
      await requestNotificationPermission();
    }

    setAgeVerified(newValue);
    setTermsAgreed(newValue);
    setLocationTermsAgreed(newValue);
    setPrivacyAgreed(newValue);
    setMarketingAgreed(newValue);
  };

  const requestNotificationPermission = async () => {
    // Skip in Expo Go - push notifications not supported in SDK 53+
    const isExpoGo = Constants.appOwnership === 'expo';
    if (isExpoGo) {
      console.log('[Onboarding] Running in Expo Go - skipping notification permission request');
      return;
    }

    try {
      // Dynamic import to avoid crash in Expo Go
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications');

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      // Permission not granted - handled silently
    } catch (error) {
      // Error handled silently
    }
  };

  const requestLocationPermission = async () => {
    try {
      const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert(
          t('onboarding.location.permissionRequired'),
          t('onboarding.location.permissionMessage'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('onboarding.location.goToSettings'), onPress: () => Linking.openSettings() },
          ]
        );
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  };

  const handleLocationTermsToggle = async () => {
    const newValue = !locationTermsAgreed;

    if (newValue) {
      // Request location permission when agreeing
      const granted = await requestLocationPermission();
      if (granted) {
        setLocationTermsAgreed(true);
      }
      // If not granted, don't toggle the checkbox
    } else {
      setLocationTermsAgreed(false);
    }
  };

  const handleMarketingToggle = async () => {
    const newValue = !marketingAgreed;
    setMarketingAgreed(newValue);

    if (newValue) {
      await requestNotificationPermission();
    }
  };

  const openPolicyModal = (url: string, title: string) => {
    setPolicyUrl(url);
    setPolicyTitle(title);
    setWebViewLoading(true);
    setPolicyModalVisible(true);
  };

  const handleNext = () => {
    // Save consent data
    updateData({
      ageVerified,
      termsAgreed,
      locationTermsAgreed,
      privacyAgreed,
      marketingAgreed,
    });
    onNext();
  };

  return (
    <View style={styles.termsStepContainer}>
      {/* Title fixed at top */}
      <View style={styles.termsTitleContainer}>
        <Text style={[styles.stepTitle, { minHeight: 36 }]}>{t('onboarding.terms.title')}</Text>
        <Text style={styles.stepDescription}>
          {t('onboarding.terms.subtitle')}
        </Text>
      </View>

      {/* Content area */}
      <View style={styles.termsContentArea}>
        <View style={styles.termsContainer}>
          <Pressable style={styles.termsAllButton} onPress={handleAgreeAll}>
            <View style={[styles.checkbox, allAgreed && styles.checkboxChecked]}>
              {allAgreed && <Check color={COLORS.black} size={16} />}
            </View>
            <Text style={styles.termsAllText}>{t('onboarding.terms.agreeAll')}</Text>
          </Pressable>

          <View style={styles.termsDivider} />

          {/* 1. Age Verification */}
          <View style={styles.termsItemWrapper}>
            <View style={styles.termsItem}>
              <Pressable
                style={styles.termsCheckboxArea}
                onPress={() => setAgeVerified(!ageVerified)}
              >
                <View style={[styles.checkbox, ageVerified && styles.checkboxChecked]}>
                  {ageVerified && <Check color={COLORS.black} size={16} />}
                </View>
              </Pressable>
              <View style={styles.termsTextArea}>
                <Text style={styles.termsItemText}>{t('onboarding.terms.ageRequired')}</Text>
              </View>
            </View>
            <View style={styles.termsDescriptionBox}>
              <Text style={styles.termsDescriptionText}>
                {t('onboarding.terms.ageRequiredDesc')}
              </Text>
            </View>
          </View>

          {/* 2. Service Terms */}
          <View style={styles.termsItem}>
            <Pressable
              style={styles.termsCheckboxArea}
              onPress={() => setTermsAgreed(!termsAgreed)}
            >
              <View style={[styles.checkbox, termsAgreed && styles.checkboxChecked]}>
                {termsAgreed && <Check color={COLORS.black} size={16} />}
              </View>
            </Pressable>
            <Pressable
              style={styles.termsTextArea}
              onPress={() => openPolicyModal('https://daydate.my/policy/terms', t('onboarding.terms.serviceTermsTitle'))}
            >
              <Text style={styles.termsItemText}>{t('onboarding.terms.serviceTerms')}</Text>
              <ChevronRight color="rgba(255,255,255,0.4)" size={20} />
            </Pressable>
          </View>

          {/* 3. Location Terms */}
          <View style={styles.termsItem}>
            <Pressable
              style={styles.termsCheckboxArea}
              onPress={handleLocationTermsToggle}
            >
              <View style={[styles.checkbox, locationTermsAgreed && styles.checkboxChecked]}>
                {locationTermsAgreed && <Check color={COLORS.black} size={16} />}
              </View>
            </Pressable>
            <Pressable
              style={styles.termsTextArea}
              onPress={() => openPolicyModal('https://daydate.my/policy/location', t('onboarding.terms.locationTermsTitle'))}
            >
              <Text style={styles.termsItemText}>{t('onboarding.terms.locationTerms')}</Text>
              <ChevronRight color="rgba(255,255,255,0.4)" size={20} />
            </Pressable>
          </View>

          {/* 4. Privacy Policy */}
          <View style={styles.termsItem}>
            <Pressable
              style={styles.termsCheckboxArea}
              onPress={() => setPrivacyAgreed(!privacyAgreed)}
            >
              <View style={[styles.checkbox, privacyAgreed && styles.checkboxChecked]}>
                {privacyAgreed && <Check color={COLORS.black} size={16} />}
              </View>
            </Pressable>
            <Pressable
              style={styles.termsTextArea}
              onPress={() => openPolicyModal('https://daydate.my/policy/privacy', t('onboarding.terms.privacyTermsTitle'))}
            >
              <Text style={styles.termsItemText}>{t('onboarding.terms.privacyTerms')}</Text>
              <ChevronRight color="rgba(255,255,255,0.4)" size={20} />
            </Pressable>
          </View>

          {/* 5. Marketing (Optional) */}
          <View style={styles.termsItem}>
            <Pressable
              style={styles.termsCheckboxArea}
              onPress={handleMarketingToggle}
            >
              <View style={[styles.checkbox, marketingAgreed && styles.checkboxChecked]}>
                {marketingAgreed && <Check color={COLORS.black} size={16} />}
              </View>
            </Pressable>
            <Pressable style={styles.termsTextArea} onPress={handleMarketingToggle}>
              <Text style={styles.termsItemText}>{t('onboarding.terms.marketingTerms')}</Text>
            </Pressable>
          </View>
        </View>
      </View>


      {/* Buttons fixed at bottom */}
      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>{t('onboarding.previous')}</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, styles.buttonFlex, !requiredAgreed && styles.primaryButtonDisabled]}
          onPress={handleNext}
          disabled={!requiredAgreed}
        >
          <Text style={styles.primaryButtonText}>{t('onboarding.next')}</Text>
        </Pressable>
      </View>

      {/* Policy Modal with WebView */}
      <Modal
        visible={policyModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPolicyModalVisible(false)}
      >
        <SafeAreaView style={styles.policyModalContainer}>
          <View style={styles.policyModalHeader}>
            <Text style={styles.policyModalTitle}>{policyTitle}</Text>
            <Pressable
              style={styles.policyModalCloseButton}
              onPress={() => setPolicyModalVisible(false)}
            >
              <X color={COLORS.black} size={24} />
            </Pressable>
          </View>
          {webViewLoading && (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="large" color={COLORS.black} />
            </View>
          )}
          <WebView
            source={{ uri: policyUrl }}
            style={styles.webView}
            onLoadStart={() => setWebViewLoading(true)}
            onLoadEnd={() => setWebViewLoading(false)}
            startInLoadingState={true}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

// Pairing Step
function PairingStep({
  isCreatingCode,
  setIsCreatingCode,
  pairingCode,
  setPairingCode,
  generatedCode,
  setGeneratedCode,
  isPairingConnected,
  setIsPairingConnected,
  setCouple,
  setUser,
  setPartner,
  currentUser,
  setIsOnboardingComplete,
  router,
  onNext,
  onBack,
  updateData,
  hideBackButton = false,
}: {
  isCreatingCode: boolean;
  setIsCreatingCode: (value: boolean) => void;
  pairingCode: string;
  setPairingCode: (code: string) => void;
  generatedCode: string;
  setGeneratedCode: (code: string) => void;
  isPairingConnected: boolean;
  setIsPairingConnected: (value: boolean) => void;
  setCouple: (couple: import('@/types').Couple | null) => void;
  setUser: (user: import('@/types').User | null) => void;
  setPartner: (partner: import('@/types').User | null) => void;
  currentUser: import('@/types').User | null;
  setIsOnboardingComplete: (value: boolean) => void;
  router: ReturnType<typeof useRouter>;
  onNext: () => void;
  onBack: () => void;
  updateData: (data: Partial<OnboardingData>) => void;
  hideBackButton?: boolean;
}) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isCodeSaved, setIsCodeSaved] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [timeRemaining, setTimeRemaining] = React.useState('24:00:00');
  const [codeExpiresAt, setCodeExpiresAt] = React.useState<Date | null>(null);
  const channelRef = React.useRef<ReturnType<typeof db.pairingCodes.subscribeToCode> | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const setupStartedRef = React.useRef<string | null>(null); // Track which code was setup to prevent duplicates
  const setupInProgressRef = React.useRef<boolean>(false); // Mutex to prevent concurrent setup calls
  const coupleCreationInProgressRef = React.useRef<boolean>(false); // Mutex to prevent duplicate couple creation
  const isReconnectionRef = React.useRef<boolean>(false); // Track if this is a 30-day reconnection scenario
  const pairingCompletedRef = React.useRef<boolean>(false); // Signals pairing completed to prevent race condition

  // Reset isPairingConnected on mount based on actual DB state
  React.useEffect(() => {
    const checkPairingState = async () => {
      if (isInTestMode()) return;

      // Get current user ID
      let userId = currentUser?.id;
      if (!userId && supabase) {
        const { data: authData } = await supabase.auth.getUser();
        userId = authData?.user?.id;
      }

      if (!userId) {
        // No user, reset pairing state
        if (isPairingConnected) {
          setIsPairingConnected(false);
        }
        return;
      }

      // Check if user has an active couple with partner
      const { data: existingCouple } = await db.couples.getActiveByUserId(userId);

      if (existingCouple && existingCouple.user1_id && existingCouple.user2_id && existingCouple.status === 'active') {
        // User has an active paired couple - should not be on pairing screen
        // But if they are, keep isPairingConnected true
        console.log('[PairingStep] User has active couple, isPairingConnected: true');
      } else {
        // No active paired couple - reset isPairingConnected and clear old couple from store
        if (isPairingConnected) {
          console.log('[PairingStep] No active couple, resetting isPairingConnected to false');
          setIsPairingConnected(false);
        }
        // Clear any stale couple data from store (e.g., after account deletion)
        const currentStoreCouple = useAuthStore.getState().couple;
        if (currentStoreCouple) {
          console.log('[PairingStep] Clearing stale couple from store:', currentStoreCouple.id);
          setCouple(null);
          setPartner(null);
        }
      }
    };

    checkPairingState();
  }, []); // Run once on mount

  // Format time remaining
  const formatTimeRemaining = React.useCallback((expiresAt: Date) => {
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();

    if (diff <= 0) {
      return '00:00:00';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  // Timer effect for countdown
  React.useEffect(() => {
    if (codeExpiresAt && isCreatingCode) {
      // Update immediately
      setTimeRemaining(formatTimeRemaining(codeExpiresAt));

      // Set up interval
      timerRef.current = setInterval(() => {
        const remaining = formatTimeRemaining(codeExpiresAt);
        setTimeRemaining(remaining);

        // If expired, reset code
        if (remaining === '00:00:00') {
          setIsCodeSaved(false);
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [codeExpiresAt, isCreatingCode, formatTimeRemaining]);

  // For code creator: Save code to DB, create couple, and subscribe to changes
  React.useEffect(() => {
    // Only run when generatedCode is set and hasn't been setup yet
    // Use both code check AND mutex to prevent race conditions (React Strict Mode double-mount)
    if (isCreatingCode && !isInTestMode() && !isCodeSaved && generatedCode &&
      setupStartedRef.current !== generatedCode && !setupInProgressRef.current) {
      setupStartedRef.current = generatedCode; // Track which code was setup
      setupInProgressRef.current = true; // Set mutex immediately before any async work
      const setupPairing = async (codeToUse: string, retryCount = 0) => {
        try {
          // CRITICAL: Always verify Supabase auth session first for RLS compliance
          // Store userId might be stale if session expired
          let creatorUserId: string | undefined;
          let isExistingUser = false;

          if (supabase) {
            const { data: authData, error: authError } = await supabase.auth.getUser();

            if (authError || !authData?.user?.id) {
              // Session expired or invalid - try to refresh
              console.log('[PairingStep] Auth session invalid, attempting refresh...');
              const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

              if (refreshError || !refreshData?.user?.id) {
                console.log('[PairingStep] Session refresh failed, waiting for re-authentication');
                setupInProgressRef.current = false;
                setupStartedRef.current = '';
                // Clear stale user data and redirect to login
                if (currentUser?.id) {
                  console.log('[PairingStep] Clearing stale user data');
                }
                return;
              }

              creatorUserId = refreshData.user.id;
              console.log('[PairingStep] Session refreshed, using auth.uid():', creatorUserId);
            } else {
              creatorUserId = authData.user.id;
              isExistingUser = !!currentUser?.id && currentUser.id === creatorUserId;
            }
          }

          // If still no userId, user needs to authenticate first
          if (!creatorUserId) {
            console.log('[PairingStep] No authenticated user, waiting for authentication');
            setupInProgressRef.current = false;
            setupStartedRef.current = '';
            return;
          }

          console.log('[PairingStep] Creator setup:', { creatorUserId, isExistingUser });

          // CRITICAL: First check if user is already part of an ACTIVE fully-paired couple
          // If so, they shouldn't be creating a new pairing code - they should go to home
          const { data: fullyPairedCouple } = await db.couples.getActiveByUserId(creatorUserId);
          if (fullyPairedCouple && fullyPairedCouple.user2_id && fullyPairedCouple.status === 'active') {
            console.log('[PairingStep] User already has active couple, skipping pairing setup:', fullyPairedCouple.id);

            // Ensure profile.couple_id is set correctly
            await db.profiles.update(creatorUserId, { couple_id: fullyPairedCouple.id });

            // Set couple in authStore
            setCouple({
              id: fullyPairedCouple.id,
              user1Id: fullyPairedCouple.user1_id,
              user2Id: fullyPairedCouple.user2_id,
              anniversaryDate: fullyPairedCouple.dating_start_date ? parseDateAsLocal(fullyPairedCouple.dating_start_date) : undefined,
              datingStartDate: fullyPairedCouple.dating_start_date ? parseDateAsLocal(fullyPairedCouple.dating_start_date) : undefined,
              weddingDate: fullyPairedCouple.wedding_date ? parseDateAsLocal(fullyPairedCouple.wedding_date) : undefined,
              anniversaryType: t('onboarding.anniversary.datingStart'),
              status: 'active',
              createdAt: fullyPairedCouple.created_at ? new Date(fullyPairedCouple.created_at) : new Date(),
            });

            // Cleanup any orphan pending couples
            await db.couples.cleanupPendingCouples(creatorUserId, fullyPairedCouple.id);

            // Navigate directly to home
            setIsOnboardingComplete(true);
            router.replace('/(tabs)');
            return;
          }

          // First, check if there's an existing valid pending code for this user
          const { data: existingCode } = await db.pairingCodes.getValidPendingCode(creatorUserId);

          let finalCode = codeToUse;
          let codeCreatedAt: Date;

          if (existingCode && existingCode.code) {
            // Use existing valid code
            console.log('[PairingStep] Found existing valid code:', existingCode.code);
            finalCode = existingCode.code;
            setGeneratedCode(finalCode);
            // Parse timestamp - Supabase returns ISO 8601 format with timezone
            codeCreatedAt = new Date(existingCode.created_at);
            // Fallback to current time if parsing fails
            if (isNaN(codeCreatedAt.getTime())) {
              console.warn('[PairingStep] Invalid created_at, using current time');
              codeCreatedAt = new Date();
            }
          } else {
            // No existing valid code, create a new one
            console.log('[PairingStep] No existing valid code, creating new one');

            // Clean up any expired pending pairing codes for this user
            const { error: cleanupError } = await db.pairingCodes.deleteByCreatorId(creatorUserId);
            if (cleanupError) {
              console.log('[PairingStep] Cleanup error (non-fatal):', cleanupError);
            }

            // Save code to DB
            const { data: createdCode, error: createError } = await db.pairingCodes.create(codeToUse, creatorUserId);
            if (createError) {
              console.error('Error creating pairing code:', createError);

              // Handle duplicate key error or any other error by generating a new code and retrying
              if (retryCount < 3) {
                console.log(`[PairingStep] Code creation failed, retrying... (attempt ${retryCount + 1}/3)`);
                const newCode = generatePairingCode();
                setGeneratedCode(newCode);
                // Reset mutex to allow retry
                setupStartedRef.current = newCode;
                // Retry with new code
                setupPairing(newCode, retryCount + 1);
                return;
              }

              // All retries failed - show error to user
              console.error('[PairingStep] All retry attempts failed for pairing code creation');
              setError(t('onboarding.pairing.codeCreationError'));
              // Reset mutex to allow user to try again
              setupInProgressRef.current = false;
              setupStartedRef.current = '';

              // Show alert to user
              Alert.alert(
                t('common.error'),
                t('onboarding.pairing.codeCreationError'),
                [
                  {
                    text: t('common.retry'),
                    onPress: () => {
                      // Generate a new code and try again
                      const newCode = generatePairingCode();
                      setGeneratedCode(newCode);
                      setError(null);
                    },
                  },
                ],
              );
              return;
            }
            // Ensure displayed code matches the saved code
            console.log('[PairingStep] Successfully saved code to database:', codeToUse);
            finalCode = codeToUse;
            // Parse timestamp - Supabase returns ISO 8601 format with timezone
            if (createdCode?.created_at) {
              codeCreatedAt = new Date(createdCode.created_at);
              // Fallback to current time if parsing fails
              if (isNaN(codeCreatedAt.getTime())) {
                console.warn('[PairingStep] Invalid created_at, using current time');
                codeCreatedAt = new Date();
              }
            } else {
              codeCreatedAt = new Date();
            }
          }

          // Set expiration time (24 hours from code creation)
          const expiresAt = new Date(codeCreatedAt.getTime() + 24 * 60 * 60 * 1000);
          console.log('[PairingStep] Code expiration set:', {
            codeCreatedAt: codeCreatedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            hoursRemaining: ((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)).toFixed(2),
          });
          setCodeExpiresAt(expiresAt);

          // Create or update profile for creator in DB
          // Only if we have a valid auth.uid() (not a generated UUID)
          const hasAuthUserId = currentUser?.id || (supabase && (await supabase.auth.getUser()).data?.user?.id);

          if (hasAuthUserId && !isExistingUser) {
            // Create new profile for new users only
            const { error: profileError } = await db.profiles.create({
              id: creatorUserId,
              nickname: '', // Will be updated in handleComplete
              email: currentUser?.email || undefined,
            });
            if (profileError) {
              console.error('Error creating profile:', profileError);
            }
          } else if (!hasAuthUserId) {
            console.log('[PairingStep] Skipping profile creation - user not authenticated yet');
          }

          // First, check for disconnected couple within 30 days (reconnection scenario)
          const { data: disconnectedCouple } = await db.couples.getDisconnectedByUserId(creatorUserId);

          if (disconnectedCouple) {
            // Check if partner still exists (they might have deleted their account)
            const partnerId = disconnectedCouple.user1_id === creatorUserId
              ? disconnectedCouple.user2_id
              : disconnectedCouple.user1_id;

            let partnerExists = false;
            if (partnerId) {
              const { data: partnerProfile } = await db.profiles.get(partnerId);
              partnerExists = !!partnerProfile;
            }

            // Check who disconnected the couple
            const wasDisconnectedByCurrentUser = disconnectedCouple.disconnected_by === creatorUserId;
            console.log('[PairingStep] Disconnected couple check:', {
              disconnectedBy: disconnectedCouple.disconnected_by,
              currentUser: creatorUserId,
              wasDisconnectedByCurrentUser,
              partnerExists,
            });

            if (!partnerExists) {
              // Partner deleted their account - delete this orphaned couple and continue to create new one
              console.log('[PairingStep] Partner deleted account, cleaning up orphaned disconnected couple:', disconnectedCouple.id);
              if (supabase) {
                // First, nullify any pairing codes pointing to this orphaned couple
                await supabase
                  .from('pairing_codes')
                  .update({ couple_id: null })
                  .eq('couple_id', disconnectedCouple.id);
                // Then delete the orphaned couple
                await supabase.from('couples').delete().eq('id', disconnectedCouple.id);
              }
            } else {
              // Partner exists but couple was unpaired (by either user)
              // DON'T link the pairing code to the disconnected couple here
              // The 30-day reconnection logic is handled in the JOINER flow (handleJoinCode)
              // This allows the creator to pair with a NEW partner if desired
              // If the original partner enters the code, the joiner flow will restore the couple
              console.log('[PairingStep] Found disconnected couple with partner, but not linking to it');
              console.log('[PairingStep] 30-day reconnection will be handled if original partner enters the code');
              // Continue to create a new couple below - joiner flow will handle reconnection if applicable
            }
          }

          // Check if user already has an existing couple (pending or active) to prevent duplicate creation
          const { data: existingCouple } = await db.couples.getActiveByUserId(creatorUserId);

          if (existingCouple && existingCouple.user1_id) {
            // Check if partner still exists (they might have deleted their account)
            const partnerId = existingCouple.user1_id === creatorUserId
              ? existingCouple.user2_id
              : existingCouple.user1_id;

            if (partnerId) {
              const { data: partnerProfile } = await db.profiles.get(partnerId);
              if (!partnerProfile) {
                // Partner deleted their account - this couple is orphaned
                console.log('[PairingStep] Partner no longer exists, cleaning up orphaned couple:', existingCouple.id);
                // Clear local authStore couple since it's orphaned
                setCouple(null);
                setPartner(null);
                // Delete the orphaned couple record
                if (supabase) {
                  await supabase.from('couples').delete().eq('id', existingCouple.id);
                }
                // Continue to create a new couple below
              } else {
                // Partner exists, use the existing couple
                console.log('[PairingStep] User already has a couple, using existing:', existingCouple.id);
                setCouple({
                  id: existingCouple.id,
                  user1Id: existingCouple.user1_id,
                  user2Id: existingCouple.user2_id || undefined,
                  anniversaryDate: existingCouple.dating_start_date ? parseDateFromLocal(existingCouple.dating_start_date) : undefined,
                  datingStartDate: existingCouple.dating_start_date ? parseDateFromLocal(existingCouple.dating_start_date) : undefined,
                  anniversaryType: t('onboarding.anniversary.datingStart'),
                  status: existingCouple.user2_id ? 'active' : 'pending',
                  createdAt: existingCouple.created_at ? new Date(existingCouple.created_at) : new Date(),
                });

                // Link existing couple to the pairing code if not already linked
                if (finalCode) {
                  await db.pairingCodes.setCoupleId(finalCode, existingCouple.id);
                }

                setIsCodeSaved(true);
                return;
              }
            } else {
              // No partner yet (pending couple), use existing
              console.log('[PairingStep] User has pending couple, using existing:', existingCouple.id);
              setCouple({
                id: existingCouple.id,
                user1Id: existingCouple.user1_id,
                user2Id: undefined,
                anniversaryDate: existingCouple.dating_start_date ? parseDateFromLocal(existingCouple.dating_start_date) : undefined,
                datingStartDate: existingCouple.dating_start_date ? parseDateFromLocal(existingCouple.dating_start_date) : undefined,
                anniversaryType: t('onboarding.anniversary.datingStart'),
                status: 'pending',
                createdAt: existingCouple.created_at ? new Date(existingCouple.created_at) : new Date(),
              });

              // Link existing couple to the pairing code if not already linked
              if (finalCode) {
                await db.pairingCodes.setCoupleId(finalCode, existingCouple.id);
              }

              setIsCodeSaved(true);
              return;
            }
          }

          // Create couple for this user (creator is user1) - only if no existing couple
          // Use mutex to prevent race condition where effect runs twice before first completes
          if (coupleCreationInProgressRef.current) {
            console.log('[PairingStep] Couple creation already in progress, skipping duplicate');
            return;
          }
          coupleCreationInProgressRef.current = true;

          try {
            // Double-check for existing couple after acquiring mutex (to prevent race condition)
            const { data: doubleCheckCouple } = await db.couples.getActiveByUserId(creatorUserId);
            if (doubleCheckCouple) {
              console.log('[PairingStep] Couple already exists after mutex check:', doubleCheckCouple.id);
              // Link existing couple to the pairing code
              if (finalCode) {
                await db.pairingCodes.setCoupleId(finalCode, doubleCheckCouple.id);
              }
              setCouple({
                id: doubleCheckCouple.id,
                user1Id: doubleCheckCouple.user1_id,
                user2Id: doubleCheckCouple.user2_id || undefined,
                anniversaryDate: doubleCheckCouple.dating_start_date ? parseDateFromLocal(doubleCheckCouple.dating_start_date) : undefined,
                datingStartDate: doubleCheckCouple.dating_start_date ? parseDateFromLocal(doubleCheckCouple.dating_start_date) : undefined,
                anniversaryType: t('onboarding.anniversary.datingStart'),
                status: doubleCheckCouple.user2_id ? 'active' : 'pending',
                createdAt: doubleCheckCouple.created_at ? new Date(doubleCheckCouple.created_at) : new Date(),
              });

              // CRITICAL: Update creator's profile with couple_id
              // This ensures profile.couple_id is set even when reusing existing pending couple
              console.log('[PairingStep] Updating creator profile with existing couple_id:', doubleCheckCouple.id);
              await db.profiles.update(creatorUserId, { couple_id: doubleCheckCouple.id });

              setIsCodeSaved(true);
              return;
            }

            // DOUBLE-CHECK: Before creating a new couple, verify user doesn't already have an active one
            // This handles race conditions where pairing completed while this code was running
            const { data: lastMinuteActiveCouple } = await db.couples.getActiveByUserId(creatorUserId);
            if (lastMinuteActiveCouple && lastMinuteActiveCouple.user2_id && lastMinuteActiveCouple.status === 'active') {
              console.log('[PairingStep] RACE CONDITION PREVENTED: User already has active couple:', lastMinuteActiveCouple.id);

              // Update profile and navigate to home
              await db.profiles.update(creatorUserId, { couple_id: lastMinuteActiveCouple.id });
              setCouple({
                id: lastMinuteActiveCouple.id,
                user1Id: lastMinuteActiveCouple.user1_id,
                user2Id: lastMinuteActiveCouple.user2_id,
                anniversaryDate: lastMinuteActiveCouple.dating_start_date ? parseDateAsLocal(lastMinuteActiveCouple.dating_start_date) : undefined,
                datingStartDate: lastMinuteActiveCouple.dating_start_date ? parseDateAsLocal(lastMinuteActiveCouple.dating_start_date) : undefined,
                weddingDate: lastMinuteActiveCouple.wedding_date ? parseDateAsLocal(lastMinuteActiveCouple.wedding_date) : undefined,
                anniversaryType: t('onboarding.anniversary.datingStart'),
                status: 'active',
                createdAt: lastMinuteActiveCouple.created_at ? new Date(lastMinuteActiveCouple.created_at) : new Date(),
              });
              await db.couples.cleanupPendingCouples(creatorUserId, lastMinuteActiveCouple.id);
              setIsOnboardingComplete(true);
              router.replace('/(tabs)');
              return;
            }

            // === RACE CONDITION PREVENTION (Layer 1 & 2) ===
            // Layer 1: Check if realtime/polling already detected pairing completion
            if (pairingCompletedRef.current) {
              console.log('[PairingStep] RACE PREVENTED (Layer 1): pairingCompletedRef is true');
              const { data: activeViaRef } = await db.couples.getActiveByUserId(creatorUserId);
              if (activeViaRef?.status === 'active' && activeViaRef.user2_id) {
                await db.profiles.update(creatorUserId, { couple_id: activeViaRef.id });
                setCouple({
                  id: activeViaRef.id,
                  user1Id: activeViaRef.user1_id,
                  user2Id: activeViaRef.user2_id,
                  anniversaryDate: activeViaRef.dating_start_date ? parseDateAsLocal(activeViaRef.dating_start_date) : undefined,
                  datingStartDate: activeViaRef.dating_start_date ? parseDateAsLocal(activeViaRef.dating_start_date) : undefined,
                  weddingDate: activeViaRef.wedding_date ? parseDateAsLocal(activeViaRef.wedding_date) : undefined,
                  anniversaryType: t('onboarding.anniversary.datingStart'),
                  status: 'active',
                  createdAt: activeViaRef.created_at ? new Date(activeViaRef.created_at) : new Date(),
                });
                await db.couples.cleanupPendingCouples(creatorUserId, activeViaRef.id);
                setIsOnboardingComplete(true);
                router.replace('/(tabs)');
              }
              return;
            }

            // Layer 2: Check if profile already has active couple_id (handles remount scenario)
            const { data: profileForRaceCheck } = await db.profiles.get(creatorUserId);
            if (profileForRaceCheck?.couple_id) {
              const { data: coupleFromProfile } = await db.couples.get(profileForRaceCheck.couple_id);
              if (coupleFromProfile?.status === 'active' && coupleFromProfile.user2_id) {
                console.log('[PairingStep] RACE PREVENTED (Layer 2): Profile has active couple_id:', profileForRaceCheck.couple_id);
                setCouple({
                  id: coupleFromProfile.id,
                  user1Id: coupleFromProfile.user1_id,
                  user2Id: coupleFromProfile.user2_id,
                  anniversaryDate: coupleFromProfile.dating_start_date ? parseDateAsLocal(coupleFromProfile.dating_start_date) : undefined,
                  datingStartDate: coupleFromProfile.dating_start_date ? parseDateAsLocal(coupleFromProfile.dating_start_date) : undefined,
                  weddingDate: coupleFromProfile.wedding_date ? parseDateAsLocal(coupleFromProfile.wedding_date) : undefined,
                  anniversaryType: t('onboarding.anniversary.datingStart'),
                  status: 'active',
                  createdAt: coupleFromProfile.created_at ? new Date(coupleFromProfile.created_at) : new Date(),
                });
                await db.couples.cleanupPendingCouples(creatorUserId, coupleFromProfile.id);
                setIsOnboardingComplete(true);
                router.replace('/(tabs)');
                return;
              }
            }
            // === END RACE CONDITION PREVENTION ===

            // CRITICAL: Verify auth session is still valid before couple creation
            // This prevents RLS policy failures if session expired
            if (supabase) {
              const { data: currentAuthData } = await supabase.auth.getUser();
              const currentAuthUid = currentAuthData?.user?.id;

              if (!currentAuthUid) {
                console.error('[PairingStep] Auth session expired before couple creation');
                coupleCreationInProgressRef.current = false;
                setError(t('onboarding.pairing.coupleConnectionError'));
                setupInProgressRef.current = false;
                setupStartedRef.current = '';
                Alert.alert(t('common.error'), t('onboarding.pairing.coupleConnectionError'));
                return;
              }

              if (currentAuthUid !== creatorUserId) {
                console.warn('[PairingStep] Auth.uid() mismatch detected, updating creatorUserId');
                console.log('[PairingStep] Store userId:', creatorUserId, 'Auth.uid():', currentAuthUid);
                // Use the current auth.uid() to ensure RLS compliance
                creatorUserId = currentAuthUid;
              }
            }

            // Get device timezone for the couple (creator's timezone)
            let deviceTimezone = 'Asia/Seoul'; // fallback
            try {
              const calendars = Localization.getCalendars();
              if (calendars && calendars.length > 0 && calendars[0].timeZone) {
                deviceTimezone = calendars[0].timeZone;
              } else {
                deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
              }
            } catch (e) {
              console.log('[PairingStep] Failed to get device timezone, using fallback');
            }

            console.log('[PairingStep] About to create couple with user1_id:', creatorUserId, 'timezone:', deviceTimezone);

            // Try to create couple with retry logic
            let newCouple: any = null;
            let coupleError: any = null;
            const maxCoupleRetries = 3;

            for (let coupleRetry = 0; coupleRetry < maxCoupleRetries; coupleRetry++) {
              const result = await db.couples.create({
                user1_id: creatorUserId,
                timezone: deviceTimezone,
              });
              newCouple = result.data;
              coupleError = result.error;

              if (!coupleError && newCouple) {
                console.log(`[PairingStep] Couple created successfully on attempt ${coupleRetry + 1}`);
                break;
              }

              console.error(`[PairingStep] Couple creation failed (attempt ${coupleRetry + 1}/${maxCoupleRetries}):`, coupleError);

              if (coupleRetry < maxCoupleRetries - 1) {
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }

            if (coupleError || !newCouple) {
              console.error('[PairingStep] All couple creation attempts failed. Error:', JSON.stringify(coupleError));
              // Reset mutex to allow retry
              coupleCreationInProgressRef.current = false;
              // Clean up the pairing code since couple creation failed
              await db.pairingCodes.deleteByCreatorId(creatorUserId);
              setError(t('onboarding.pairing.coupleConnectionError'));
              setupInProgressRef.current = false;
              setupStartedRef.current = '';

              Alert.alert(
                t('common.error'),
                t('onboarding.pairing.coupleConnectionError'),
                [
                  {
                    text: t('common.retry'),
                    onPress: () => {
                      const newCode = generatePairingCode();
                      setGeneratedCode(newCode);
                      setError(null);
                    },
                  },
                ],
              );
              return;
            }

            if (newCouple) {
              // Link couple_id to pairing code
              console.log('[PairingStep] Created couple:', newCouple.id, 'linking to code:', finalCode);
              const { error: linkError } = await db.pairingCodes.setCoupleId(finalCode, newCouple.id);
              if (linkError) {
                console.error('[PairingStep] Error linking couple to code:', linkError);
              } else {
                console.log('[PairingStep] Successfully linked couple to code');

                // Re-fetch the valid code to ensure we display the one with couple_id
                // This handles race conditions where multiple codes were created
                const { data: validCode } = await db.pairingCodes.getValidPendingCode(creatorUserId);
                if (validCode && validCode.code !== finalCode) {
                  console.log('[PairingStep] Updating displayed code from', finalCode, 'to', validCode.code);
                  setGeneratedCode(validCode.code);
                  finalCode = validCode.code;
                }
              }

              // Set couple in authStore - no anniversaryDate/datingStartDate until user sets it
              setCouple({
                id: newCouple.id,
                user1Id: creatorUserId,
                anniversaryDate: undefined,
                datingStartDate: undefined,
                anniversaryType: t('onboarding.anniversary.datingStart'),
                status: 'pending',
                createdAt: new Date(),
                timezone: deviceTimezone,
              });

              // === LAYER 3: Final validation before profile update ===
              // Verify profile doesn't already have active couple before updating
              const { data: finalProfileCheck } = await db.profiles.get(creatorUserId);
              if (finalProfileCheck?.couple_id && finalProfileCheck.couple_id !== newCouple.id) {
                const { data: finalCoupleCheck } = await db.couples.get(finalProfileCheck.couple_id);
                if (finalCoupleCheck?.status === 'active' && finalCoupleCheck.user2_id) {
                  console.log('[PairingStep] RACE DETECTED (Layer 3): Active couple exists, rolling back pending couple');
                  // Delete the pending couple we just created
                  if (supabase) {
                    await supabase.from('couples').delete().eq('id', newCouple.id);
                  }
                  // Use the active couple instead
                  setCouple({
                    id: finalCoupleCheck.id,
                    user1Id: finalCoupleCheck.user1_id,
                    user2Id: finalCoupleCheck.user2_id,
                    anniversaryDate: finalCoupleCheck.dating_start_date ? parseDateAsLocal(finalCoupleCheck.dating_start_date) : undefined,
                    datingStartDate: finalCoupleCheck.dating_start_date ? parseDateAsLocal(finalCoupleCheck.dating_start_date) : undefined,
                    weddingDate: finalCoupleCheck.wedding_date ? parseDateAsLocal(finalCoupleCheck.wedding_date) : undefined,
                    anniversaryType: t('onboarding.anniversary.datingStart'),
                    status: 'active',
                    createdAt: finalCoupleCheck.created_at ? new Date(finalCoupleCheck.created_at) : new Date(),
                  });
                  await db.couples.cleanupPendingCouples(creatorUserId, finalCoupleCheck.id);
                  setIsOnboardingComplete(true);
                  router.replace('/(tabs)');
                  return;
                }
              }

              // Safe to update profile.couple_id
              console.log('[PairingStep] Updating creator profile with couple_id:', newCouple.id);
              const { error: profileCoupleError } = await db.profiles.update(creatorUserId, {
                couple_id: newCouple.id,
              });
              if (profileCoupleError) {
                console.error('[PairingStep] Error updating creator profile couple_id:', profileCoupleError);
              } else {
                console.log('[PairingStep] Successfully updated creator profile with couple_id');
              }
              // === END LAYER 3 ===

              // Sync timezone to timezoneStore so it's immediately effective
              useTimezoneStore.getState().syncFromCouple(deviceTimezone);

              // Cleanup any previous orphaned pending couples for this creator
              // (e.g., from failed pairing attempts)
              console.log('[PairingStep] Cleaning up old pending couples for creator');
              await db.couples.cleanupPendingCouples(creatorUserId, newCouple.id);

              // Only update user in authStore if not already logged in
              if (!isExistingUser) {
                setUser({
                  id: creatorUserId,
                  email: '',
                  nickname: '',
                  inviteCode: finalCode,
                  preferences: {
                    weekendActivity: '',
                    dateEnergy: '',
                    dateTypes: [],
                    adventureLevel: '',
                    photoPreference: '',
                    dateStyle: '',
                    planningStyle: '',
                    foodStyles: [],
                    preferredTimes: [],
                    budgetStyle: '',
                  },
                  createdAt: new Date(),
                });
              }
            }
          } finally {
            coupleCreationInProgressRef.current = false;
          }

          // Ensure displayed code matches the saved code before marking as saved
          setGeneratedCode(finalCode);
          setIsCodeSaved(true);

          // Subscribe to changes (realtime) - use finalCode which might be existing or new
          channelRef.current = db.pairingCodes.subscribeToCode(finalCode, async (payload) => {
            // When joiner proceeds to next screen, auto-follow
            if (payload.joiner_proceeded_at) {
              onNext();
              return;
            }

            if (payload.status === 'connected' && payload.joiner_id) {
              // CRITICAL: Set immediately to prevent race condition with setupPairing
              pairingCompletedRef.current = true;
              console.log('[PairingStep] Creator: Realtime detected partner connection');
              console.log('[PairingStep] Creator: joiner_id =', payload.joiner_id, 'payload.couple_id =', payload.couple_id);

              const joinerId = payload.joiner_id;
              const creatorId = currentUser?.id;

              // CRITICAL FIX: Don't rely solely on payload.couple_id
              // In 30-day reconnection, the joiner might have restored an old couple
              // but the pairing code's couple_id might still point to a new pending couple.
              // We need to check if there's an ACTIVE couple between creator and joiner.
              let actualCoupleData: {
                id: string;
                user1_id: string;
                user2_id: string | null;
                dating_start_date: string | null;
                wedding_date: string | null;
                disconnect_reason: string | null;
                created_at: string | null;
              } | null = null;
              let disconnectReason: string | null = null;

              // First, try to find an active couple between creator and joiner
              // This handles the case where joiner restored an old couple
              if (creatorId && joinerId) {
                console.log('[PairingStep] Creator: Checking for active couple between', creatorId, 'and', joinerId);
                const { data: activeCouple } = await db.couples.findActiveCoupleBetweenUsers(creatorId, joinerId);
                if (activeCouple) {
                  console.log('[PairingStep] Creator: Found active couple:', activeCouple.id, 'disconnect_reason:', activeCouple.disconnect_reason);
                  actualCoupleData = activeCouple;
                  disconnectReason = activeCouple.disconnect_reason || null;
                }
              }

              // Fallback: Use couple_id from pairing code payload if no active couple found
              if (!actualCoupleData && payload.couple_id) {
                console.log('[PairingStep] Creator: No active couple found, using payload.couple_id:', payload.couple_id);
                const { data: coupleData } = await db.couples.get(payload.couple_id);
                if (coupleData) {
                  actualCoupleData = coupleData;
                  disconnectReason = coupleData.disconnect_reason || null;
                }
              }

              if (actualCoupleData) {
                console.log('[PairingStep] Creator: Using couple:', actualCoupleData.id);
                // Update couple with user2Id
                setCouple({
                  id: actualCoupleData.id,
                  user1Id: actualCoupleData.user1_id,
                  user2Id: actualCoupleData.user2_id || undefined,
                  anniversaryDate: actualCoupleData.dating_start_date ? parseDateAsLocal(actualCoupleData.dating_start_date) : undefined,
                  datingStartDate: actualCoupleData.dating_start_date ? parseDateAsLocal(actualCoupleData.dating_start_date) : undefined,
                  weddingDate: actualCoupleData.wedding_date ? parseDateAsLocal(actualCoupleData.wedding_date) : undefined,
                  anniversaryType: t('onboarding.anniversary.datingStart'),
                  status: 'active',
                  createdAt: actualCoupleData.created_at ? new Date(actualCoupleData.created_at) : new Date(),
                });

                // Fetch joiner's profile
                const { data: joinerProfile } = await db.profiles.get(joinerId);
                setPartner({
                  id: joinerId,
                  email: joinerProfile?.email || '',
                  nickname: joinerProfile?.nickname || '',
                  inviteCode: '',
                  birthDate: joinerProfile?.birth_date ? parseDateAsLocal(joinerProfile.birth_date) : undefined,
                  preferences: joinerProfile?.preferences || {
                    weekendActivity: '',
                    dateEnergy: '',
                    dateTypes: [],
                    adventureLevel: '',
                    photoPreference: '',
                    dateStyle: '',
                    planningStyle: '',
                    foodStyles: [],
                    preferredTimes: [],
                    budgetStyle: '',
                  },
                  createdAt: joinerProfile?.created_at ? new Date(joinerProfile.created_at) : new Date(),
                });
              }

              setIsPairingConnected(true);

              // Check if this is a 30-day reconnection scenario
              // Use both ref and disconnect_reason from DB as backup
              const isReconnection = isReconnectionRef.current || disconnectReason === 'unpaired';
              console.log('[PairingStep] Realtime reconnection check:', {
                isReconnectionRef: isReconnectionRef.current,
                disconnectReason,
                isReconnection,
                actualCoupleId: actualCoupleData?.id
              });

              // Reset ALL local mission data for NEW pairings (not reconnections)
              // This ensures both users start completely fresh with the new couple
              if (!isReconnection) {
                console.log('[PairingStep] Creator (realtime): New pairing - resetting all local mission data');
                useMissionStore.getState().resetAllTodayMissions();
              }

              if (isReconnection && actualCoupleData) {
                console.log('[PairingStep] Creator: Partner reconnected within 30 days, skipping onboarding');
                // Clear disconnect_reason since reconnection is complete
                await db.couples.update(actualCoupleData.id, { disconnect_reason: null });

                // Also update the user's profile couple_id to the restored couple
                if (creatorId) {
                  await db.profiles.update(creatorId, { couple_id: actualCoupleData.id });
                }

                // Restore creator's data to onboardingStore so profile page can display it if needed
                if (creatorId) {
                  const { data: creatorProfile } = await db.profiles.get(creatorId);
                  if (creatorProfile) {
                    const creatorPrefs = creatorProfile.preferences as Record<string, unknown> | undefined;
                    setUser({
                      id: creatorId,
                      email: creatorProfile.email || '',
                      nickname: creatorProfile.nickname || '',
                      coupleId: actualCoupleData.id,
                      birthDate: creatorProfile.birth_date ? parseDateAsLocal(creatorProfile.birth_date) : undefined,
                      birthDateCalendarType: (creatorPrefs?.birthDateCalendarType as 'solar' | 'lunar') || 'solar',
                      preferences: creatorProfile.preferences || {},
                      createdAt: creatorProfile.created_at ? new Date(creatorProfile.created_at) : new Date(),
                    });

                    updateData({
                      nickname: creatorProfile.nickname || '',
                      birthDate: creatorProfile.birth_date ? parseDateAsLocal(creatorProfile.birth_date) : undefined,
                      birthDateCalendarType: (creatorProfile.birth_date_calendar_type as CalendarType) || (creatorPrefs?.birthDateCalendarType as CalendarType) || 'solar',
                      mbti: (creatorPrefs?.mbti as string) || '',
                      gender: (creatorPrefs?.gender as Gender) || null,
                      activityTypes: (creatorPrefs?.activityTypes as ActivityType[]) || [],
                      dateWorries: (creatorPrefs?.dateWorries as DateWorry[]) || [],
                      constraints: (creatorPrefs?.constraints as Constraint[]) || [],
                      relationshipType: (creatorPrefs?.relationshipType as RelationshipType) || 'dating',
                      anniversaryDate: actualCoupleData.dating_start_date ? parseDateAsLocal(actualCoupleData.dating_start_date) : undefined,
                      isPairingConnected: true,
                    });
                  }
                }

                // Show reconnection alert and go directly to home
                Alert.alert(
                  t('onboarding.pairing.reconnected'),
                  t('onboarding.pairing.reconnectedMessage'),
                  [
                    {
                      text: t('onboarding.confirm'),
                      onPress: () => {
                        setIsOnboardingComplete(true);
                        router.replace('/(tabs)');
                      },
                    },
                  ]
                );
              } else {
                console.log('[PairingStep] Creator: Partner connected, navigating to next screen');

                // CRITICAL: Update creator's profile.couple_id to the active couple
                // The pending couple was created during code generation, but now we have an active couple
                if (creatorId && actualCoupleData?.id) {
                  console.log('[PairingStep] Updating creator profile couple_id to active couple:', actualCoupleData.id);
                  await db.profiles.update(creatorId, { couple_id: actualCoupleData.id });

                  // Cleanup orphaned pending couples for creator
                  console.log('[PairingStep] Cleaning up creator orphaned pending couples');
                  await db.couples.cleanupPendingCouples(creatorId, actualCoupleData.id);
                }

                onNext(); // Auto-navigate when partner joins (normal new pairing)
              }
            }
          });
        } catch (err) {
          console.error('Pairing setup error:', err);
          setupInProgressRef.current = false; // Release mutex on error
        }
      };

      setupPairing(generatedCode);
    } else if (isCreatingCode && isInTestMode() && !codeExpiresAt) {
      // Test mode: create pairing code with deterministic IDs
      // This allows cross-device testing - both devices get same coupleId from same code
      const setupTestPairing = async () => {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        setCodeExpiresAt(expiresAt);

        // Use deterministic IDs based on the pairing code
        // This ensures both devices get matching IDs
        const testCoupleId = generateDeterministicId(generatedCode, 'couple');
        const testUserId = currentUser?.id || generateDeterministicId(generatedCode, 'test-creator');

        // Set user in authStore
        if (!currentUser?.id) {
          setUser({
            id: testUserId,
            email: 'test@daydate.app',
            nickname: currentUser?.nickname || 'Test User',
            inviteCode: generatedCode,
            preferences: {
              weekendActivity: '',
              dateEnergy: '',
              dateTypes: [],
              adventureLevel: '',
              photoPreference: '',
              dateStyle: '',
              planningStyle: '',
              foodStyles: [],
              preferredTimes: [],
              budgetStyle: '',
            },
            createdAt: new Date(),
          });
        }

        // Create couple with pending status (waiting for partner)
        // coupleId is deterministic so partner will have the same one
        setCouple({
          id: testCoupleId,
          user1Id: testUserId,
          anniversaryDate: new Date(),
          anniversaryType: '연애 시작일',
          status: 'pending',
          createdAt: new Date(),
        });

        // Save pairing code to local storage
        await createTestPairingCode(
          generatedCode,
          testUserId,
          currentUser?.nickname || 'Test User'
        );

        setIsCodeSaved(true);
        console.log('[TestMode] Pairing code created:', generatedCode);
        console.log('[TestMode] Deterministic coupleId:', testCoupleId);
      };

      setupTestPairing();
    }

    // Cleanup subscription on unmount
    return () => {
      if (channelRef.current) {
        db.pairingCodes.unsubscribe(channelRef.current);
      }
      // Reset setup mutex on unmount so it can run again if component remounts
      setupInProgressRef.current = false;
    };
  }, [isCreatingCode, generatedCode, isCodeSaved, setIsPairingConnected, setGeneratedCode, codeExpiresAt, setCouple, setUser, currentUser?.id]);

  // Separate useEffect for polling - runs when code is saved but not yet connected
  React.useEffect(() => {
    if (isCreatingCode && isCodeSaved && !isPairingConnected && generatedCode) {
      // Start polling as fallback (every 1.5 seconds)
      pollingRef.current = setInterval(async () => {
        try {
          if (isInTestMode()) {
            // Test mode: poll local storage
            const pairingData = await checkTestPairingStatus(generatedCode);
            if (pairingData?.status === 'connected' && pairingData.joinerId) {
              console.log('[TestMode] Partner connected!', pairingData.joinerNickname);

              // Update couple with partner info
              setCouple({
                id: pairingData.coupleId,
                user1Id: pairingData.creatorId,
                user2Id: pairingData.joinerId,
                anniversaryDate: new Date(),
                anniversaryType: '연애 시작일',
                status: 'active',
                createdAt: new Date(),
              });

              // Set partner info
              setPartner({
                id: pairingData.joinerId,
                email: 'partner@daydate.app',
                nickname: pairingData.joinerNickname || 'Partner',
                inviteCode: '',
                preferences: {} as any,
                createdAt: new Date(),
              });

              setIsPairingConnected(true);

              // Reset ALL local mission data for NEW pairings (test mode - always fresh)
              console.log('[PairingStep] Creator (test mode): New pairing - resetting all local mission data');
              useMissionStore.getState().resetAllTodayMissions();

              // Clear polling interval before navigating
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }

              onNext();
            }
          } else if (supabase) {
            // Production mode: poll Supabase
            const { data: checkData } = await supabase
              .from('pairing_codes')
              .select('status, joiner_id, couple_id')
              .eq('code', generatedCode)
              .single();

            if (checkData?.status === 'connected' && checkData.joiner_id) {
              // CRITICAL: Set immediately to prevent race condition with setupPairing
              pairingCompletedRef.current = true;
              console.log('[PairingStep] Polling detected partner connection');

              // Use couple_id from pairing code (not from store - store might have old data)
              const coupleId = checkData.couple_id;
              let disconnectReason: string | null = null;

              if (coupleId) {
                const { data: coupleData } = await db.couples.get(coupleId);
                if (coupleData) {
                  disconnectReason = coupleData.disconnect_reason || null;

                  setCouple({
                    id: coupleData.id,
                    user1Id: coupleData.user1_id,
                    user2Id: coupleData.user2_id,
                    anniversaryDate: coupleData.dating_start_date ? parseDateAsLocal(coupleData.dating_start_date) : undefined,
                    datingStartDate: coupleData.dating_start_date ? parseDateAsLocal(coupleData.dating_start_date) : undefined,
                    anniversaryType: t('onboarding.anniversary.datingStart'),
                    status: 'active',
                    createdAt: coupleData.created_at ? new Date(coupleData.created_at) : new Date(),
                  });

                  // Fetch joiner's profile
                  if (coupleData.user2_id) {
                    const { data: joinerProfile } = await db.profiles.get(coupleData.user2_id);
                    setPartner({
                      id: coupleData.user2_id,
                      email: joinerProfile?.email || '',
                      nickname: joinerProfile?.nickname || '',
                      inviteCode: '',
                      birthDate: joinerProfile?.birth_date ? parseDateAsLocal(joinerProfile.birth_date) : undefined,
                      preferences: joinerProfile?.preferences || {},
                      createdAt: joinerProfile?.created_at ? new Date(joinerProfile.created_at) : new Date(),
                    });
                  }

                  // CRITICAL: Update creator's profile.couple_id and cleanup pending couples
                  // This mirrors the realtime handler logic to ensure consistency
                  const pollingCreatorId = currentUser?.id;
                  if (pollingCreatorId) {
                    console.log('[PairingStep] Polling: Updating creator profile couple_id:', coupleData.id);
                    await db.profiles.update(pollingCreatorId, { couple_id: coupleData.id });

                    // Cleanup orphaned pending couples for creator
                    console.log('[PairingStep] Polling: Cleaning up creator orphaned pending couples');
                    await db.couples.cleanupPendingCouples(pollingCreatorId, coupleData.id);
                  }
                }
              }

              setIsPairingConnected(true);

              // Clear polling interval before navigating
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }

              // Check if this is a 30-day reconnection scenario
              // Use both ref and disconnect_reason from DB as backup
              const isReconnection = isReconnectionRef.current || disconnectReason === 'unpaired';
              console.log('[PairingStep] Polling reconnection check:', {
                isReconnectionRef: isReconnectionRef.current,
                disconnectReason,
                isReconnection
              });

              if (isReconnection) {
                console.log('[PairingStep] Polling: Partner reconnected within 30 days, skipping onboarding');
                // Clear disconnect_reason since reconnection is complete
                if (coupleId) {
                  await db.couples.update(coupleId, { disconnect_reason: null });
                }
                // Show reconnection alert and go directly to home
                Alert.alert(
                  t('onboarding.pairing.reconnected'),
                  t('onboarding.pairing.reconnectedMessage'),
                  [
                    {
                      text: t('onboarding.confirm'),
                      onPress: () => {
                        setIsOnboardingComplete(true);
                        router.replace('/(tabs)');
                      },
                    },
                  ]
                );
              } else {
                // Reset ALL local mission data for NEW pairings
                // This ensures both users start completely fresh with the new couple
                console.log('[PairingStep] Creator (polling): New pairing - resetting all local mission data');
                useMissionStore.getState().resetAllTodayMissions();

                console.log('[PairingStep] Polling: Partner connected, navigating to next screen');
                onNext();
              }
            }
          }
        } catch (pollErr) {
          console.error('Polling error:', pollErr);
        }
      }, 1500);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isCreatingCode, isCodeSaved, isPairingConnected, generatedCode, setIsPairingConnected, setCouple, setPartner]);

  // Copy code to clipboard
  const handleCopyCode = async () => {
    try {
      await Clipboard.setStringAsync(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Share code
  const handleShareCode = async () => {
    try {
      await Share.share({
        message: t('onboarding.pairing.shareMessage', { code: generatedCode }),
      });
    } catch (err) {
      console.error('Failed to share:', err);
    }
  };

  // Handle join (for code enterer)
  const handleJoin = async () => {
    // Guard: Don't try to join again if already connected or already loading
    if (isPairingConnected) {
      console.log('[PairingStep] Already connected, skipping join');
      return;
    }
    if (isLoading) {
      console.log('[PairingStep] Already loading, skipping duplicate join');
      return;
    }

    if (isInTestMode()) {
      // Test mode: Join with deterministic IDs based on the code
      // No lookup needed - both devices get matching IDs from the same code
      setIsLoading(true);
      setError(null);

      try {
        // Validate code format (at least 4 characters)
        if (pairingCode.length < 4) {
          setError(t('onboarding.pairing.invalidCode'));
          setIsLoading(false);
          return;
        }

        // Use deterministic joiner ID based on the pairing code
        const joinerId = currentUser?.id || generateDeterministicId(pairingCode, 'test-joiner');

        // Join with deterministic IDs - this always succeeds
        const pairingData = await joinTestPairingCode(
          pairingCode,
          joinerId,
          currentUser?.nickname || 'Partner'
        );

        // Set joiner user with deterministic ID
        if (!currentUser?.id) {
          setUser({
            id: joinerId,
            email: 'partner@daydate.app',
            nickname: currentUser?.nickname || 'Partner',
            inviteCode: '',
            preferences: {
              weekendActivity: '',
              dateEnergy: '',
              dateTypes: [],
              adventureLevel: '',
              photoPreference: '',
              dateStyle: '',
              planningStyle: '',
              foodStyles: [],
              preferredTimes: [],
              budgetStyle: '',
            },
            createdAt: new Date(),
          });
        }

        // Set couple with deterministic coupleId (same as creator's device)
        setCouple({
          id: pairingData.coupleId,
          user1Id: pairingData.creatorId,
          user2Id: joinerId,
          anniversaryDate: new Date(),
          anniversaryType: '연애 시작일',
          status: 'active',
          createdAt: new Date(),
        });

        // Set partner (the code creator - deterministic ID)
        setPartner({
          id: pairingData.creatorId,
          email: 'test@daydate.app',
          nickname: pairingData.creatorNickname || 'Partner',
          inviteCode: pairingCode,
          preferences: {} as any,
          createdAt: new Date(),
        });

        console.log('[TestMode] Successfully joined with code:', pairingCode);
        console.log('[TestMode] Deterministic coupleId:', pairingData.coupleId);
        console.log('[TestMode] Creator:', pairingData.creatorId, '+ Joiner:', joinerId);

        setIsPairingConnected(true);

        // Reset ALL local mission data for NEW pairings (test mode - always fresh)
        console.log('[PairingStep] Joiner (test mode): New pairing - resetting all local mission data');
        useMissionStore.getState().resetAllTodayMissions();

        setIsLoading(false);
        // Navigation will be handled by handleConnect or validation check
        return;
      } catch (err) {
        console.error('[TestMode] Join error:', err);
        setError(t('onboarding.pairing.invalidCode'));
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get pairing code with couple_id
      console.log('[PairingStep] Looking up pairing code:', pairingCode);
      const { data: existingCode, error: findError } = await db.pairingCodes.getWithCouple(pairingCode);
      console.log('[PairingStep] Found code:', existingCode, 'error:', findError);

      if (findError || !existingCode) {
        // getWithCouple only returns pending codes, so if not found it means:
        // 1. Code never existed, OR
        // 2. Code was already used (connected status)
        console.log('[PairingStep] Code not found or already used, error:', findError);
        setError(t('onboarding.pairing.invalidCode'));
        setIsLoading(false);
        return;
      }

      console.log('[PairingStep] Found pending code with couple_id:', existingCode.couple_id);

      // Check if couple_id exists
      if (!existingCode.couple_id) {
        setError(t('onboarding.pairing.partnerNotReady'));
        setIsLoading(false);
        return;
      }

      // Get creator's user ID from the couple
      const { data: creatorCouple } = await db.couples.get(existingCode.couple_id);

      // Check if couple exists (might have been deleted due to race condition or cleanup)
      if (!creatorCouple) {
        console.log('[PairingStep] Couple not found for couple_id:', existingCode.couple_id);
        // Clear the invalid couple_id from the pairing code
        if (supabase) {
          await supabase
            .from('pairing_codes')
            .update({ couple_id: null })
            .eq('code', pairingCode);
        }
        setError(t('onboarding.pairing.partnerNotReady'));
        setIsLoading(false);
        return;
      }

      const creatorId = creatorCouple.user1_id;

      // Use existing user ID if logged in via social login, otherwise generate new one
      const joinerId = currentUser?.id || generateUUID();

      // Prevent self-pairing: check if joiner is the same as creator
      if (creatorId === joinerId) {
        console.log('[PairingStep] Self-pairing attempt detected:', { creatorId, joinerId });
        setError(t('onboarding.pairing.cannotUseSelfCode'));
        setIsLoading(false);
        return;
      }
      const isExistingUser = !!currentUser?.id;

      // Check for disconnected couple within 30 days (reconnection scenario)
      if (isExistingUser && creatorId) {
        const { data: disconnectedCouple } = await db.couples.findDisconnectedCouple(joinerId, creatorId);

        if (disconnectedCouple) {
          // Check if BOTH profiles exist (reconnection only valid if neither deleted their account)
          const { data: joinerProfile } = await db.profiles.get(joinerId);
          const { data: creatorProfile } = await db.profiles.get(creatorId);

          if (!joinerProfile || !creatorProfile) {
            // One of the users deleted their account - clean up orphaned couple and proceed with normal pairing
            console.log('[PairingStep] One of the users deleted account, cleaning up orphaned couple:', disconnectedCouple.id);
            if (supabase) {
              // First, nullify any pairing codes pointing to this orphaned couple
              await supabase
                .from('pairing_codes')
                .update({ couple_id: null })
                .eq('couple_id', disconnectedCouple.id);
              // Then delete the orphaned couple
              await supabase.from('couples').delete().eq('id', disconnectedCouple.id);
            }
          } else {
            // Both profiles exist - allow reconnection regardless of who disconnected
            // Creator made a new code = open to pairing, Joiner entered code = wants to pair
            // If they were previously paired, reconnection preserves their data (30-day feature)
            console.log('[PairingStep] handleJoinCode: both users exist, allowing reconnection:', {
              disconnectedBy: disconnectedCouple.disconnected_by,
              joinerId,
              creatorId,
            });

            console.log('[PairingStep] Found disconnected couple, restoring...', disconnectedCouple.id);

            // Restore the disconnected couple
            const { data: restoredCouple, error: restoreError } = await db.couples.restoreCouple(disconnectedCouple.id);

            if (restoreError) {
              console.error('[PairingStep] Error restoring couple:', restoreError);
              setError(t('onboarding.pairing.coupleRestoreError'));
              setIsLoading(false);
              return;
            }

            if (restoredCouple) {
              // Set couple in authStore
              setCouple({
                id: restoredCouple.id,
                user1Id: restoredCouple.user1_id,
                user2Id: restoredCouple.user2_id,
                anniversaryDate: restoredCouple.dating_start_date ? parseDateAsLocal(restoredCouple.dating_start_date) : undefined,
                datingStartDate: restoredCouple.dating_start_date ? parseDateAsLocal(restoredCouple.dating_start_date) : undefined,
                weddingDate: restoredCouple.wedding_date ? parseDateAsLocal(restoredCouple.wedding_date) : undefined,
                anniversaryType: t('onboarding.anniversary.datingStart'),
                relationshipType: restoredCouple.wedding_date ? 'married' : 'dating',
                status: 'active',
                createdAt: restoredCouple.created_at ? new Date(restoredCouple.created_at) : new Date(),
              });

              // Fetch current user (joiner) profile to restore user data - we already checked it exists above
              const joinerPrefs = joinerProfile.preferences as Record<string, unknown> | undefined;
              setUser({
                id: joinerId,
                email: joinerProfile.email || '',
                nickname: joinerProfile.nickname || '',
                coupleId: restoredCouple.id,
                birthDate: joinerProfile.birth_date ? parseDateAsLocal(joinerProfile.birth_date) : undefined,
                birthDateCalendarType: (joinerPrefs?.birthDateCalendarType as 'solar' | 'lunar') || 'solar',
                preferences: joinerProfile.preferences || {},
                createdAt: joinerProfile.created_at ? new Date(joinerProfile.created_at) : new Date(),
              });

              // Fetch partner profile - we already checked it exists above
              const partnerId = restoredCouple.user1_id === joinerId ? restoredCouple.user2_id : restoredCouple.user1_id;
              setPartner({
                id: partnerId,
                email: creatorProfile.email || '',
                nickname: creatorProfile.nickname || '',
                inviteCode: '',
                birthDate: creatorProfile.birth_date ? parseDateAsLocal(creatorProfile.birth_date) : undefined,
                preferences: creatorProfile.preferences || {},
                createdAt: creatorProfile.created_at ? new Date(creatorProfile.created_at) : new Date(),
              });

              // Update pairing code's couple_id to point to the restored couple FIRST
              // This is critical for creator's realtime/polling handler to find the correct couple
              // IMPORTANT: Must happen BEFORE cleanup to avoid FK cascade race condition
              console.log('[PairingStep] Updating pairing code couple_id to restored couple:', restoredCouple.id);
              const { data: setCoupleIdResult, error: setCoupleIdError } = await db.pairingCodes.setCoupleId(pairingCode, restoredCouple.id);
              if (setCoupleIdError) {
                console.error('[PairingStep] Failed to update pairing code couple_id:', setCoupleIdError);
                // Continue anyway - the pairing will still work, just reconnection detection might fail
              } else {
                console.log('[PairingStep] Successfully updated pairing code couple_id:', setCoupleIdResult?.couple_id);
              }

              // Mark pairing code as used (sets status='connected' which triggers creator's realtime)
              const { error: joinError } = await db.pairingCodes.join(pairingCode, joinerId);
              if (joinError) {
                console.error('[PairingStep] Failed to join pairing code:', joinError);
              }

              // CRITICAL: Update both joiner's and partner's profile.couple_id to restored couple
              // This ensures both profiles point to the active couple in DB
              console.log('[PairingStep] Updating joiner profile couple_id to restored couple:', restoredCouple.id);
              await db.profiles.update(joinerId, { couple_id: restoredCouple.id });
              console.log('[PairingStep] Updating partner profile couple_id to restored couple:', restoredCouple.id);
              await db.profiles.update(partnerId, { couple_id: restoredCouple.id });

              // Cleanup orphaned pending couples for both PARTNER and JOINER
              // NOTE: This must happen AFTER profile updates to avoid stale couple_id references
              console.log('[PairingStep] Reconnection cleanup: removing partner orphaned pending couples');
              await db.couples.cleanupPendingCouples(partnerId, restoredCouple.id);
              console.log('[PairingStep] Reconnection cleanup: removing joiner orphaned pending couples');
              await db.couples.cleanupPendingCouples(joinerId, restoredCouple.id);

              // Check if joiner's profile is complete
              const hasCompleteBirthDate = !!joinerProfile.birth_date;
              const hasCompletePreferences = joinerProfile.preferences &&
                Object.keys(joinerProfile.preferences).length > 0 &&
                joinerProfile.preferences.mbti;
              const isProfileComplete = hasCompleteBirthDate && hasCompletePreferences;

              console.log('[PairingStep] Joiner (30-day restore) profile completeness:', {
                hasCompleteBirthDate,
                hasCompletePreferences,
                isProfileComplete
              });

              if (isProfileComplete) {
                // 30일 내 재연결 with complete profile: 온보딩 스킵하고 바로 홈으로
                // Restore data to onboardingStore so profile page can display it
                updateData({
                  nickname: joinerProfile.nickname || '',
                  birthDate: joinerProfile.birth_date ? parseDateAsLocal(joinerProfile.birth_date) : undefined,
                  birthDateCalendarType: (joinerProfile.birth_date_calendar_type as CalendarType) || (joinerPrefs?.birthDateCalendarType as CalendarType) || 'solar',
                  mbti: (joinerPrefs?.mbti as string) || '',
                  gender: (joinerPrefs?.gender as Gender) || null,
                  activityTypes: (joinerPrefs?.activityTypes as ActivityType[]) || [],
                  dateWorries: (joinerPrefs?.dateWorries as DateWorry[]) || [],
                  constraints: (joinerPrefs?.constraints as Constraint[]) || [],
                  relationshipType: (joinerPrefs?.relationshipType as RelationshipType) || 'dating',
                  anniversaryDate: restoredCouple.dating_start_date ? parseDateAsLocal(restoredCouple.dating_start_date) : undefined,
                  isPairingConnected: true,
                });

                Alert.alert(
                  t('onboarding.pairing.reconnected'),
                  t('onboarding.pairing.reconnectedMessage'),
                  [
                    {
                      text: t('onboarding.confirm'),
                      onPress: () => {
                        setIsOnboardingComplete(true);
                        router.replace('/(tabs)');
                      },
                    },
                  ]
                );
                setIsLoading(false);
                return;
              } else {
                // Profile incomplete - continue onboarding
                console.log('[PairingStep] Joiner profile incomplete, continuing onboarding');
                setIsPairingConnected(true);
                setIsLoading(false);
                onNext();
                return;
              }
            }
          }
        }
      }

      // Normal flow: new pairing (no reconnection)
      // Update pairing code status
      console.log('[PairingStep] Joining pairing code:', pairingCode, 'with joinerId:', joinerId);
      const { error: joinError } = await db.pairingCodes.join(pairingCode, joinerId);

      if (joinError) {
        console.error('[PairingStep] Join error:', joinError);
        setError(t('onboarding.pairing.connectionError'));
        setIsLoading(false);
        return;
      }
      console.log('[PairingStep] Successfully joined pairing code');

      // Clean up any pending pairing codes that this joiner might have created
      // (e.g., user created a code but then decided to join someone else's code)
      const { error: cleanupError } = await db.pairingCodes.deleteByCreatorId(joinerId);
      if (cleanupError) {
        console.log('[PairingStep] Cleanup of joiner pending codes (non-fatal):', cleanupError);
      } else {
        console.log('[PairingStep] Cleaned up any pending codes created by joiner');
      }

      // Create or update profile for joiner in DB
      if (isExistingUser) {
        // Update existing profile's couple_id will be handled by joinCouple
        console.log('[PairingStep] Using existing user profile:', joinerId);
      } else {
        // Create new profile for anonymous joiner
        const { error: profileError } = await db.profiles.create({
          id: joinerId,
          nickname: '', // Will be updated in handleComplete
          email: currentUser?.email || undefined,
        });

        if (profileError) {
          console.error('Error creating joiner profile:', profileError);
        }
      }

      // Add joiner to couple as user2
      console.log('[PairingStep] Joining couple:', existingCode.couple_id, 'with joiner:', joinerId);
      const { data: updatedCouple, error: coupleJoinError } = await db.couples.joinCouple(existingCode.couple_id, joinerId);
      console.log('[PairingStep] joinCouple result:', { updatedCouple, coupleJoinError });

      if (coupleJoinError) {
        console.error('[PairingStep] Error joining couple:', coupleJoinError);
        setError(t('onboarding.pairing.coupleConnectionError'));
        setIsLoading(false);
        return;
      }

      // Set user in authStore (preserve existing user data if logged in)
      if (!isExistingUser) {
        setUser({
          id: joinerId,
          email: '',
          nickname: '',
          preferences: {
            weekendActivity: '',
            dateEnergy: '',
            dateTypes: [],
            adventureLevel: '',
            photoPreference: '',
            dateStyle: '',
            planningStyle: '',
            foodStyles: [],
            preferredTimes: [],
            budgetStyle: '',
          },
          createdAt: new Date(),
        });
      }

      // Set couple in authStore
      if (updatedCouple) {
        setCouple({
          id: updatedCouple.id,
          user1Id: updatedCouple.user1_id,
          user2Id: joinerId,
          anniversaryDate: updatedCouple.dating_start_date ? parseDateAsLocal(updatedCouple.dating_start_date) : undefined,
          datingStartDate: updatedCouple.dating_start_date ? parseDateAsLocal(updatedCouple.dating_start_date) : undefined,
          anniversaryType: t('onboarding.anniversary.datingStart'),
          status: 'active',
          createdAt: updatedCouple.created_at ? new Date(updatedCouple.created_at) : new Date(),
        });

        // CRITICAL: Update BOTH joiner's AND creator's profile with couple_id immediately
        // This ensures both profiles have the correct couple_id even if onboarding is interrupted
        console.log('[PairingStep] Updating joiner profile with couple_id:', updatedCouple.id);
        const { error: joinerProfileCoupleError } = await db.profiles.update(joinerId, {
          couple_id: updatedCouple.id,
        });
        if (joinerProfileCoupleError) {
          console.error('[PairingStep] Error updating joiner profile couple_id:', joinerProfileCoupleError);
        } else {
          console.log('[PairingStep] Successfully updated joiner profile with couple_id');
        }

        // CRITICAL: Also update creator's profile.couple_id to the active couple
        // The creator might have profile.couple_id pointing to the old pending couple
        console.log('[PairingStep] Updating creator profile with couple_id:', updatedCouple.id);
        const { error: creatorProfileCoupleError } = await db.profiles.update(updatedCouple.user1_id, {
          couple_id: updatedCouple.id,
        });
        if (creatorProfileCoupleError) {
          console.error('[PairingStep] Error updating creator profile couple_id:', creatorProfileCoupleError);
        } else {
          console.log('[PairingStep] Successfully updated creator profile with couple_id');
        }

        // Fetch partner (creator) profile from DB to get their nickname and birthDate
        const { data: creatorProfile } = await db.profiles.get(updatedCouple.user1_id);

        setPartner({
          id: updatedCouple.user1_id,
          email: creatorProfile?.email || '',
          nickname: creatorProfile?.nickname || '',
          inviteCode: pairingCode,
          birthDate: creatorProfile?.birth_date ? parseDateAsLocal(creatorProfile.birth_date) : undefined,
          preferences: creatorProfile?.preferences || {
            weekendActivity: '',
            dateEnergy: '',
            dateTypes: [],
            adventureLevel: '',
            photoPreference: '',
            dateStyle: '',
            planningStyle: '',
            foodStyles: [],
            preferredTimes: [],
            budgetStyle: '',
          },
          createdAt: creatorProfile?.created_at ? new Date(creatorProfile.created_at) : new Date(),
        });

        // Cleanup orphaned pending couples for both CREATOR and JOINER
        // - Creator might have old pending couples from previous pairing attempts
        // - Joiner might have created their own code/couple before joining someone else's
        // Note: Joiner's pairing codes are already deleted above (line 2872), so FK cascade is not a concern
        console.log('[PairingStep] Cleaning up creator orphaned pending couples');
        await db.couples.cleanupPendingCouples(updatedCouple.user1_id, updatedCouple.id);
        console.log('[PairingStep] Cleaning up joiner orphaned pending couples');
        await db.couples.cleanupPendingCouples(joinerId, updatedCouple.id);
      }

      console.log('[PairingStep] Setting isPairingConnected to true');
      setIsPairingConnected(true);

      // Mark that joiner has proceeded (for creator to auto-follow)
      console.log('[PairingStep] Marking joiner proceeded');
      await db.pairingCodes.markJoinerProceeded(pairingCode);

      // Check if this is a reconnection based on disconnect_reason
      // If the couple was previously disconnected (has disconnect_reason), skip onboarding IF profile is complete
      const isReconnection = updatedCouple?.disconnect_reason === 'unpaired';

      // Reset ALL local mission data for NEW pairings (not reconnections)
      // This ensures both users start completely fresh with the new couple:
      // - Generated missions are cleared
      // - Today's completed mission limit is reset (can complete 1 mission with new partner)
      // - In-progress missions are cleared
      if (!isReconnection) {
        console.log('[PairingStep] New pairing - resetting all local mission data');
        useMissionStore.getState().resetAllTodayMissions();
      }
      console.log('[PairingStep] Reconnection check:', { disconnect_reason: updatedCouple?.disconnect_reason, isReconnection });

      if (isReconnection && isExistingUser) {
        // Fetch joiner's profile to check completeness
        const { data: joinerProfile } = await db.profiles.get(joinerId);
        const hasCompleteBirthDate = !!joinerProfile?.birth_date;
        const hasCompletePreferences = joinerProfile?.preferences &&
          Object.keys(joinerProfile.preferences).length > 0 &&
          joinerProfile.preferences.mbti;
        const isProfileComplete = hasCompleteBirthDate && hasCompletePreferences;

        console.log('[PairingStep] Joiner (disconnect_reason) profile completeness:', {
          hasCompleteBirthDate,
          hasCompletePreferences,
          isProfileComplete
        });

        if (isProfileComplete && joinerProfile) {
          console.log('[PairingStep] Joiner: Reconnection with complete profile, going to home');

          // Restore data to onboardingStore so profile page can display it
          const joinerPrefs = joinerProfile.preferences as Record<string, unknown> | undefined;
          updateData({
            nickname: joinerProfile.nickname || '',
            birthDate: joinerProfile.birth_date ? parseDateAsLocal(joinerProfile.birth_date) : undefined,
            birthDateCalendarType: (joinerProfile.birth_date_calendar_type as CalendarType) || (joinerPrefs?.birthDateCalendarType as CalendarType) || 'solar',
            mbti: (joinerPrefs?.mbti as string) || '',
            gender: (joinerPrefs?.gender as Gender) || null,
            activityTypes: (joinerPrefs?.activityTypes as ActivityType[]) || [],
            dateWorries: (joinerPrefs?.dateWorries as DateWorry[]) || [],
            constraints: (joinerPrefs?.constraints as Constraint[]) || [],
            relationshipType: (joinerPrefs?.relationshipType as RelationshipType) || 'dating',
            anniversaryDate: updatedCouple?.dating_start_date ? parseDateAsLocal(updatedCouple.dating_start_date) : undefined,
            isPairingConnected: true,
          });

          setIsLoading(false);
          // Show reconnection alert and go directly to home
          // Note: Don't clear disconnect_reason here - let Creator detect it first
          // It will be cleared by Creator's realtime/polling callback
          Alert.alert(
            t('onboarding.pairing.reconnected'),
            t('onboarding.pairing.reconnectedMessage'),
            [
              {
                text: t('onboarding.confirm'),
                onPress: () => {
                  setIsOnboardingComplete(true);
                  router.replace('/(tabs)');
                },
              },
            ]
          );
          return;
        } else {
          // Profile incomplete - continue onboarding instead of going home
          console.log('[PairingStep] Joiner: Reconnection but profile incomplete, continuing onboarding');
          // Fall through to normal flow (onNext)
        }
      }

      console.log('[PairingStep] Join flow completed successfully, navigating to next screen');
      setIsLoading(false);
      onNext(); // Navigate to next screen immediately after successful join (new pairing)
      return;
    } catch (err) {
      console.error('[PairingStep] Join error (catch block):', err);
      setError(t('onboarding.pairing.connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle connect button press
  const handleConnect = async () => {
    if (isCreatingCode) {
      // In test mode, creator can proceed after code is saved (no cross-device detection)
      // In production mode, wait for partner to connect via realtime
      if (isPairingConnected || (isInTestMode() && isCodeSaved)) {
        // Check if this is a reconnection (user already has complete profile)
        const userId = currentUser?.id;
        if (userId && !isInTestMode()) {
          const { data: profile } = await db.profiles.get(userId);
          const hasCompleteBirthDate = !!profile?.birth_date;
          const hasCompletePreferences = profile?.preferences &&
            Object.keys(profile.preferences).length > 0 &&
            profile.preferences.mbti; // Check for at least mbti as indicator of completed preferences
          const isProfileComplete = hasCompleteBirthDate && hasCompletePreferences;

          console.log('[PairingStep] Creator profile completeness check:', {
            hasCompleteBirthDate,
            hasCompletePreferences,
            isProfileComplete
          });

          if (isProfileComplete && profile) {
            // This is a reconnection with complete profile - restore user data and skip onboarding
            console.log('[PairingStep] Creator reconnection with complete profile, skipping onboarding');

            // Get current couple from authStore (already set by realtime subscription)
            const currentCouple = useAuthStore.getState().couple;

            // Restore current user data
            const creatorPrefs = profile.preferences as Record<string, unknown> | undefined;
            setUser({
              id: userId,
              email: profile.email || '',
              nickname: profile.nickname || '',
              coupleId: currentCouple?.id,
              birthDate: profile.birth_date ? parseDateAsLocal(profile.birth_date) : undefined,
              birthDateCalendarType: (creatorPrefs?.birthDateCalendarType as 'solar' | 'lunar') || 'solar',
              preferences: profile.preferences || {},
              createdAt: profile.created_at ? new Date(profile.created_at) : new Date(),
            });

            // Restore data to onboardingStore so profile page can display it
            updateData({
              nickname: profile.nickname || '',
              birthDate: profile.birth_date ? parseDateAsLocal(profile.birth_date) : undefined,
              birthDateCalendarType: (profile.birth_date_calendar_type as CalendarType) || (creatorPrefs?.birthDateCalendarType as CalendarType) || 'solar',
              mbti: (creatorPrefs?.mbti as string) || '',
              gender: (creatorPrefs?.gender as Gender) || null,
              activityTypes: (creatorPrefs?.activityTypes as ActivityType[]) || [],
              dateWorries: (creatorPrefs?.dateWorries as DateWorry[]) || [],
              constraints: (creatorPrefs?.constraints as Constraint[]) || [],
              relationshipType: (creatorPrefs?.relationshipType as RelationshipType) || 'dating',
              anniversaryDate: currentCouple?.anniversaryDate,
              isPairingConnected: true,
            });

            // Fetch and set partner data
            const partnerId = currentCouple?.user2Id;
            if (partnerId) {
              const { data: partnerProfile } = await db.profiles.get(partnerId);
              if (partnerProfile) {
                setPartner({
                  id: partnerId,
                  email: partnerProfile.email || '',
                  nickname: partnerProfile.nickname || '',
                  inviteCode: '',
                  birthDate: partnerProfile.birth_date ? parseDateAsLocal(partnerProfile.birth_date) : undefined,
                  preferences: partnerProfile.preferences || {},
                  createdAt: partnerProfile.created_at ? new Date(partnerProfile.created_at) : new Date(),
                });
              }
            }

            Alert.alert(
              t('onboarding.pairing.reconnected'),
              t('onboarding.pairing.reconnectedMessage'),
              [
                {
                  text: t('onboarding.confirm'),
                  onPress: () => {
                    setIsOnboardingComplete(true);
                    router.replace('/(tabs)');
                  },
                },
              ]
            );
            return;
          }
        }
        onNext();
      }
    } else {
      handleJoin();
    }
  };

  // Validation
  // - Test mode creator: can proceed after code is saved (partner enters same code on their device)
  // - Production creator: must wait for partner connection
  // - Joiner: must have valid code length
  const isValid = isCreatingCode
    ? isPairingConnected || (isInTestMode() && isCodeSaved)
    : pairingCode.length >= 4;

  return (
    <View style={[styles.centeredStepContainer]}>
      {/* Title fixed at top */}
      <View style={styles.nicknameTitleContainer}>
        <Text style={styles.stepTitle}>{t('onboarding.pairing.title')}</Text>
        <Text style={styles.stepDescription}>
          {t('onboarding.pairing.subtitle')}
        </Text>
      </View>

      {/* Content centered in remaining space */}
      <View style={[styles.nicknameCenterArea, { paddingTop: 40 }]}>
        {/* Toggle */}
        <View style={[styles.toggleRow, { marginBottom: SPACING.xl }]}>
          <Pressable
            style={[styles.toggleButton, isCreatingCode && styles.toggleButtonActive]}
            onPress={() => {
              setIsCreatingCode(true);
              setError(null);
            }}
          >
            <Text style={[styles.toggleButtonText, isCreatingCode && styles.toggleButtonTextActive]}>
              {t('onboarding.pairing.generateCode')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleButton, !isCreatingCode && styles.toggleButtonActive]}
            onPress={() => {
              setIsCreatingCode(false);
              setError(null);
            }}
          >
            <Text style={[styles.toggleButtonText, !isCreatingCode && styles.toggleButtonTextActive]}>
              {t('onboarding.pairing.enterCode')}
            </Text>
          </Pressable>
        </View>

        {/* Dynamic content with fixed height */}
        <View style={styles.pairingContentArea}>
          {isCreatingCode ? (
            <View style={styles.codeDisplayContainer}>
              <View style={styles.codeLabelRow}>
                <Text style={styles.codeLabel}>{t('onboarding.pairing.myCode')}</Text>
                {isCodeSaved && <Text style={styles.codeTimer}>({timeRemaining})</Text>}
              </View>
              <View style={styles.codeBoxRow}>
                {isCodeSaved ? (
                  <Text style={styles.codeText}>{generatedCode}</Text>
                ) : (
                  <ActivityIndicator size="small" color={COLORS.black} />
                )}
                <Pressable
                  style={[styles.shareButton, !isCodeSaved && { opacity: 0.3 }]}
                  onPress={isCodeSaved ? handleShareCode : undefined}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  disabled={!isCodeSaved}
                >
                  <Ionicons name="share-outline" size={24} color="rgba(0,0,0,0.5)" />
                </Pressable>
              </View>
              {isPairingConnected ? (
                <Text style={[styles.codeHint, { color: '#4CAF50' }]}>
                  {t('onboarding.pairing.connected')}
                </Text>
              ) : error ? (
                <Text style={[styles.codeHint, { color: '#FF6B6B' }]}>
                  {error}
                </Text>
              ) : isCodeSaved ? (
                <Text style={styles.codeHint}>
                  {t('onboarding.pairing.waitingPartner')}
                </Text>
              ) : (
                <Text style={styles.codeHint}>
                  {t('onboarding.pairing.generatingCode')}
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.codeInputArea}>
              <TextInput
                style={[styles.textInput, styles.codeInput]}
                value={pairingCode}
                onChangeText={(text) => {
                  setPairingCode(text.toUpperCase().trim());
                  setError(null);
                }}
                autoCapitalize="characters"
                maxLength={6}
                editable={!isLoading && !isPairingConnected}
              />
              <Text style={styles.codeInputHint}>{t('onboarding.pairing.enterCodePlaceholder')}</Text>
              {error && (
                <Text style={[styles.codeInputHint, { color: '#FF6B6B', marginTop: 8 }]}>
                  {error}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Buttons fixed at bottom */}
      <View style={styles.buttonRow}>
        {!hideBackButton && (
          <Pressable
            style={[styles.secondaryButton, (isLoading || isPairingConnected) && styles.secondaryButtonDisabled]}
            onPress={onBack}
            disabled={isLoading || isPairingConnected}
          >
            <Text style={[styles.secondaryButtonText, (isLoading || isPairingConnected) && styles.secondaryButtonTextDisabled]}>{t('onboarding.previous')}</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.primaryButton, hideBackButton ? { flex: 1 } : styles.buttonFlex, (!isValid || isPairingConnected) && styles.primaryButtonDisabled]}
          onPress={handleConnect}
          disabled={!isValid || isLoading || isPairingConnected}
        >
          <Text style={styles.primaryButtonText}>
            {isLoading ? t('onboarding.pairing.connecting') : (isCreatingCode && !isPairingConnected && !isInTestMode()) ? t('onboarding.pairing.waitingConnection') : t('onboarding.pairing.connect')}
          </Text>
        </Pressable>
      </View>

      {/* Copy Toast */}
      {copied && (
        <View style={styles.copyToastOverlay}>
          <View style={styles.copyToastBox}>
            <Text style={styles.copyToastText}>{t('onboarding.pairing.copied')}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// Couple Info Step - Anniversary date input
function CoupleInfoStep({
  relationshipType,
  setRelationshipType,
  anniversaryDate,
  setAnniversaryDate,
  onNext,
  onBack,
}: {
  relationshipType: RelationshipType;
  setRelationshipType: (type: RelationshipType) => void;
  anniversaryDate: Date | null;
  setAnniversaryDate: (date: Date | null) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [showAnniversaryPicker, setShowAnniversaryPicker] = useState(false);

  const ensureAnniversaryDate = (date: Date | string | null): Date => {
    if (!date) return new Date();
    if (date instanceof Date) return date;
    return new Date(date);
  };

  const [tempAnniversaryDate, setTempAnniversaryDate] = useState(ensureAnniversaryDate(anniversaryDate));

  const formatDate = (date: Date | string | null) => {
    const d = date instanceof Date ? date : date ? new Date(date) : new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  const handleAnniversaryDateChange = (_event: unknown, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowAnniversaryPicker(false);
      if (selectedDate) {
        setAnniversaryDate(selectedDate);
      }
    } else {
      if (selectedDate) {
        setTempAnniversaryDate(selectedDate);
      }
    }
  };

  const handleConfirmAnniversaryDate = () => {
    setAnniversaryDate(tempAnniversaryDate);
    setShowAnniversaryPicker(false);
  };

  const getAnniversaryLabel = () => {
    switch (relationshipType) {
      case 'dating': return t('onboarding.coupleInfo.datingLabel');
      case 'married': return t('onboarding.coupleInfo.marriedLabel');
      default: return t('onboarding.coupleInfo.datingLabel');
    }
  };

  const isValid = anniversaryDate !== null;

  return (
    <View style={styles.centeredStepContainer}>
      {/* Title fixed at top */}
      <View style={styles.nicknameTitleContainer}>
        <Text style={styles.stepTitle}>{t('onboarding.coupleInfo.title')}</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.basicInfoScrollView}
        contentContainerStyle={styles.basicInfoScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Relationship Type Selection */}
        <View style={styles.basicInfoSection}>
          <Text style={styles.basicInfoLabel}>{t('onboarding.coupleInfo.relationship')}</Text>
          <View style={styles.relationshipTypeRow}>
            <Pressable
              style={[styles.relationshipTypeButton, relationshipType === 'dating' && styles.relationshipTypeButtonActive]}
              onPress={() => setRelationshipType('dating')}
            >
              <Text style={[styles.relationshipTypeButtonText, relationshipType === 'dating' && styles.relationshipTypeButtonTextActive]}>
                {t('onboarding.relationship.dating')}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.relationshipTypeButton, relationshipType === 'married' && styles.relationshipTypeButtonActive]}
              onPress={() => setRelationshipType('married')}
            >
              <Text style={[styles.relationshipTypeButtonText, relationshipType === 'married' && styles.relationshipTypeButtonTextActive]}>
                {t('onboarding.relationship.married')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Anniversary Date */}
        <View style={styles.basicInfoSection}>
          <Text style={styles.basicInfoLabel}>{getAnniversaryLabel()}</Text>
          <Pressable
            style={styles.basicInfoDateButton}
            onPress={() => setShowAnniversaryPicker(true)}
          >
            <Text style={[styles.basicInfoDateText, anniversaryDate && styles.basicInfoDateTextSelected]}>
              {anniversaryDate ? formatDate(anniversaryDate) : t('onboarding.coupleInfo.selectDate', { label: getAnniversaryLabel() })}
            </Text>
            <Calendar color={anniversaryDate ? COLORS.black : 'rgba(0, 0, 0, 0.4)'} size={20} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Anniversary Date Picker Modals */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showAnniversaryPicker}
          transparent
          animationType="slide"
        >
          <View style={styles.datePickerModal}>
            <View style={styles.datePickerModalContent}>
              <View style={styles.datePickerHeader}>
                <Pressable onPress={() => setShowAnniversaryPicker(false)}>
                  <Text style={styles.datePickerCancel}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable onPress={handleConfirmAnniversaryDate}>
                  <Text style={styles.datePickerConfirm}>{t('common.confirm')}</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={tempAnniversaryDate}
                mode="date"
                display="spinner"
                onChange={handleAnniversaryDateChange}
                maximumDate={new Date()}
                locale="ko-KR"
                style={styles.datePicker}
              />
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'android' && showAnniversaryPicker && (
        <DateTimePicker
          value={tempAnniversaryDate}
          mode="date"
          display="default"
          onChange={handleAnniversaryDateChange}
          maximumDate={new Date()}
        />
      )}

      {/* Buttons fixed at bottom */}
      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>{t('onboarding.previous')}</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.primaryButtonDisabled]}
          onPress={onNext}
          disabled={!isValid}
        >
          <Text style={styles.primaryButtonText}>{t('onboarding.next')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Preferences Intro Step
function PreferencesIntroStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.centeredStepContainer}>
      {/* Title fixed at top */}
      <View style={[styles.nicknameTitleContainer, { paddingTop: SPACING.xxxl + 60 }]}>
        <Text style={styles.stepTitle}>
          {t('onboarding.preferencesIntro.title')}
        </Text>
        <Text style={styles.stepDescription}>
          {t('onboarding.preferencesIntro.subtitle')}
        </Text>
      </View>

      {/* Centered content */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', width: '100%', paddingHorizontal: SPACING.xl }}>
        <View style={[styles.preferencesInfoBoxInline, { alignItems: 'center' }]}>
          <Text style={[styles.preferencesInfoText, { textAlign: 'center' }]}>
            {t('onboarding.preferencesIntro.hint')}
          </Text>
        </View>
      </View>

      {/* Bottom button - consistent position with other steps */}
      <View style={{ width: '100%', paddingBottom: SPACING.lg + ANDROID_BOTTOM_PADDING }}>
        <Pressable style={[styles.primaryButton, styles.primaryButtonFullWidth]} onPress={onNext}>
          <Text style={styles.primaryButtonText}>{t('onboarding.preferencesIntro.startAnalysis')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// MBTI Step
function MBTIStep({
  mbti,
  setMbti,
  onNext,
  onBack,
}: {
  mbti: string;
  setMbti: (mbti: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.centeredStepContainer}>
      {/* Title at top */}
      <View style={{ width: '100%', paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxxl + 40, alignItems: 'center' }}>
        <Text style={styles.stepTitle}>{t('onboarding.mbti.title')}</Text>
      </View>

      {/* Centered content - moved up */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 150, width: '100%' }}>
        <View style={styles.mbtiGrid}>
          {MBTI_OPTIONS.map((option) => (
            <Pressable
              key={option}
              style={[styles.mbtiButton, mbti === option && styles.mbtiButtonActive]}
              onPress={() => setMbti(option)}
            >
              <Text style={[styles.mbtiButtonText, mbti === option && styles.mbtiButtonTextActive]}>
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Bottom button - consistent position */}
      <View style={{ width: '100%', paddingBottom: SPACING.lg }}>
        <View style={styles.buttonRow}>
          <Pressable style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>{t('onboarding.previous')}</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, styles.buttonFlex, !mbti && styles.buttonDisabled]}
            onPress={mbti ? onNext : undefined}
            disabled={!mbti}
          >
            <Text style={[styles.primaryButtonText, !mbti && styles.buttonTextDisabled]}>{t('onboarding.next')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Activity Type Step
function ActivityTypeStep({
  activityTypes,
  setActivityTypes,
  onNext,
  onBack,
}: {
  activityTypes: ActivityType[];
  setActivityTypes: (types: ActivityType[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const toggleActivity = (type: ActivityType) => {
    if (activityTypes.includes(type)) {
      setActivityTypes(activityTypes.filter((t) => t !== type));
    } else {
      setActivityTypes([...activityTypes, type]);
    }
  };

  const isValid = activityTypes.length > 0;

  return (
    <View style={styles.centeredStepContainer}>
      {/* Title at top */}
      <View style={{ width: '100%', paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxxl + 40, alignItems: 'center' }}>
        <Text style={styles.stepTitle}>{t('onboarding.preferences.title')}</Text>
        <Text style={styles.stepDescription}>
          {t('onboarding.preferences.subtitle')}
        </Text>
      </View>

      {/* Centered content */}
      <View style={styles.topCenteredContent}>
        <ScrollView
          style={{ width: '100%' }}
          contentContainerStyle={{ alignItems: 'center', paddingBottom: SPACING.md }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
          bounces={false}
        >
          <View style={styles.activityGrid3Col}>
            {ACTIVITY_TYPE_OPTIONS.map((option) => (
              <Pressable
                key={option.id}
                style={[styles.activityButtonSmall, activityTypes.includes(option.id) && styles.activityButtonActive]}
                onPress={() => toggleActivity(option.id)}
              >
                <Text style={styles.activityIconSmall}>{option.icon}</Text>
                <Text style={[styles.activityButtonTextSmall, activityTypes.includes(option.id) && styles.activityButtonTextActive]}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Bottom button - consistent position */}
      <View style={{ width: '100%', paddingBottom: SPACING.lg }}>
        <View style={styles.buttonRow}>
          <Pressable style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>{t('onboarding.previous')}</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.buttonDisabled]}
            onPress={isValid ? onNext : undefined}
            disabled={!isValid}
          >
            <Text style={[styles.primaryButtonText, !isValid && styles.buttonTextDisabled]}>{t('onboarding.next')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Date Worries Step - Multiple Selection
function DateWorriesStep({
  dateWorries,
  setDateWorries,
  onNext,
  onBack,
}: {
  dateWorries: DateWorry[];
  setDateWorries: (worries: DateWorry[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const worries = dateWorries || [];

  const toggleWorry = (worry: DateWorry) => {
    if (worries.includes(worry)) {
      setDateWorries(worries.filter((w) => w !== worry));
    } else {
      setDateWorries([...worries, worry]);
    }
  };

  const isValid = worries.length > 0;

  return (
    <View style={styles.centeredStepContainer}>
      {/* Title at top */}
      <View style={{ width: '100%', paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxxl + 40, alignItems: 'center' }}>
        <Text style={styles.stepTitle}>
          {t('onboarding.concerns.title')}
        </Text>
        <Text style={styles.stepDescription}>
          {t('onboarding.concerns.subtitle')}
        </Text>
      </View>

      <View style={[styles.topCenteredContent, { paddingTop: SPACING.lg }]}>
        <ScrollView
          style={styles.dateWorryList}
          contentContainerStyle={styles.dateWorryContent}
          showsVerticalScrollIndicator={false}
        >
          {DATE_WORRY_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.dateWorryButton, worries.includes(option.id) && styles.dateWorryButtonActive]}
              onPress={() => toggleWorry(option.id)}
            >
              <View style={styles.dateWorryLeft}>
                <Text style={styles.dateWorryIcon}>{option.icon}</Text>
                <Text style={[styles.dateWorryButtonText, worries.includes(option.id) && styles.dateWorryButtonTextActive]}>
                  {t(option.labelKey)}
                </Text>
              </View>
              <View style={styles.checkIconPlaceholder}>
                {worries.includes(option.id) && <Check color={COLORS.black} size={20} />}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.bottomButtonArea}>
        <View style={styles.buttonRow}>
          <Pressable style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>{t('onboarding.previous')}</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.buttonDisabled]}
            onPress={isValid ? onNext : undefined}
            disabled={!isValid}
          >
            <Text style={[styles.primaryButtonText, !isValid && styles.buttonTextDisabled]}>{t('onboarding.next')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Constraints Step
function ConstraintsStep({
  constraints,
  setConstraints,
  onNext,
  onBack,
}: {
  constraints: Constraint[];
  setConstraints: (cons: Constraint[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const toggleConstraint = (con: Constraint) => {
    if (con === 'none') {
      // If "없음" is selected, clear all others and select only "없음"
      if (constraints.includes('none')) {
        setConstraints([]);
      } else {
        setConstraints(['none']);
      }
    } else {
      // If other option is selected, remove "없음" if present
      if (constraints.includes(con)) {
        setConstraints(constraints.filter((c) => c !== con));
      } else {
        setConstraints([...constraints.filter((c) => c !== 'none'), con]);
      }
    }
  };

  const isValid = constraints.length > 0;

  return (
    <View style={styles.centeredStepContainer}>
      {/* Title at top */}
      <View style={{ width: '100%', paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxxl + 40, alignItems: 'center' }}>
        <Text style={styles.stepTitle}>{t('onboarding.constraints.title')}</Text>
        <Text style={styles.stepDescription}>
          {t('onboarding.constraints.subtitle')}
        </Text>
      </View>

      <View style={[styles.topCenteredContent, { paddingTop: SPACING.lg }]}>
        <View style={styles.constraintGrid}>
          {CONSTRAINT_OPTIONS.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.constraintButton, constraints.includes(option.id) && styles.constraintButtonActive]}
              onPress={() => toggleConstraint(option.id)}
            >
              <Text style={styles.constraintIcon}>{option.icon}</Text>
              <Text style={[styles.constraintButtonText, constraints.includes(option.id) && styles.constraintButtonTextActive]}>
                {t(option.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.bottomButtonArea}>
        <View style={styles.buttonRow}>
          <Pressable style={styles.secondaryButton} onPress={onBack}>
            <Text style={styles.secondaryButtonText}>{t('onboarding.previous')}</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.buttonDisabled]}
            onPress={isValid ? onNext : undefined}
            disabled={!isValid}
          >
            <Text style={[styles.primaryButtonText, !isValid && styles.buttonTextDisabled]}>{t('onboarding.complete')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// Complete Step
function CompleteStep({
  nickname,
  onComplete,
}: {
  nickname: string;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.centeredStepContainer}>
      <View style={styles.centeredContent}>
        <View style={styles.celebrationIconContainer}>
          <Gift color={COLORS.black} size={48} />
        </View>

        <Text style={styles.celebrationTitle}>
          {t('onboarding.completeStep.title', { nickname })}
        </Text>

        <Text style={styles.celebrationDescription}>
          {t('onboarding.completeStep.subtitle')}
        </Text>
      </View>

      <View style={{ width: '100%', paddingBottom: SPACING.lg + ANDROID_BOTTOM_PADDING }}>
        <Pressable style={[styles.primaryButton, styles.primaryButtonFullWidth]} onPress={onComplete}>
          <Text style={styles.primaryButtonText}>{t('onboarding.start')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ========== STYLES ==========

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  whiteContainer: {
    backgroundColor: '#FFFFFF',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    pointerEvents: 'none',
  },
  whiteBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    pointerEvents: 'none',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    position: 'absolute',
    top: scale(60),
    left: scale(SPACING.lg),
    right: scale(SPACING.lg),
    zIndex: 20,
  },
  progressBar: {
    height: scale(4),
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: scale(2),
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.black,
    borderRadius: scale(2),
  },
  scrollView: {
    flex: 1,
    zIndex: 10,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: scale(SPACING.lg),
    paddingTop: scale(90),
    paddingBottom: scale(40),
  },
  content: {
    flex: 1,
  },
  stepContainer: {
    alignItems: 'center',
  },
  centeredStepContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nicknameTitleContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.xxxl + 40),
    height: scale(180),
  },
  nicknameCenterArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: scale(10),
    paddingBottom: scale(200),
    paddingHorizontal: scale(SPACING.md),
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingBottom: scale(100),
  },
  welcomeCenteredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingBottom: scale(140),
  },
  welcomeLogo: {
    width: scale(240),
    height: scale(80),
  },
  welcomeLogoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: scale(60),
    paddingBottom: scale(100),
  },
  welcomeStepContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
  },
  welcomeTaglineContainer: {
    width: '100%',
    paddingHorizontal: '7.5%', // Match social login button left margin (85% width centered)
    paddingTop: height * 0.10, // Responsive 10% from top
    alignItems: 'flex-start',
  },
  welcomeTagline: {
    // fontFamily, letterSpacing, lineHeight applied dynamically based on language
    // Bricolage Grotesque ExtraBold for en/es (letterSpacing -4%), Jua for ko/ja/zh-TW
    fontSize: scaleFont(48),
    color: '#000000',
    textAlign: 'left',
  },
  welcomeBottomContainer: {
    width: '100%',
    paddingBottom: scale(SPACING.lg) + ANDROID_BOTTOM_PADDING,
  },
  welcomeSubtitle: {
    fontFamily: TYPOGRAPHY.fontFamily.display,
    fontSize: scaleFont(18),
    color: 'rgba(0, 0, 0, 0.9)',
    textAlign: 'center',
    marginTop: scale(SPACING.xxl),
    lineHeight: scale(28),
    letterSpacing: scale(0.5),
  },
  welcomeIconWrapper: {
    marginTop: 0,
    marginBottom: scale(SPACING.xxl),
  },
  topCenteredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: scale(SPACING.sm),
    width: '100%',
  },
  fixedHeaderArea: {
    alignItems: 'center',
    width: '100%',
  },
  bottomButtonArea: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: scale(SPACING.lg),
  },
  welcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: scale(SPACING.lg) + ANDROID_BOTTOM_PADDING,
  },
  welcomeContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: scale(96),
    height: scale(96),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(SPACING.xxl),
  },
  iconContainerSmall: {
    width: scale(80),
    height: scale(80),
    borderRadius: scale(40),
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(SPACING.lg),
    borderWidth: scale(1),
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  welcomeTitle: {
    fontSize: scaleFont(40),
    color: COLORS.black,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: scale(48),
    marginBottom: scale(SPACING.lg),
  },
  welcomeDescription: {
    fontSize: scaleFont(16),
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
    lineHeight: scale(24),
    marginBottom: scale(SPACING.xxxl),
  },
  stepTitle: {
    fontSize: scaleFont(28),
    color: COLORS.black,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: scale(36),
    marginBottom: scale(SPACING.md),
    minHeight: scale(72),
  },
  stepSubtitle: {
    fontSize: scaleFont(18),
    color: COLORS.black,
    fontWeight: '600',
    textAlign: 'center',
  },
  fixedTitleContainer: {
    height: scale(80),
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  stepDescription: {
    fontSize: scaleFont(14),
    color: 'rgba(0, 0, 0, 0.6)',
    textAlign: 'center',
    lineHeight: scale(20),
    marginBottom: scale(SPACING.md),
  },
  sectionLabel: {
    fontSize: scaleFont(14),
    color: 'rgba(0, 0, 0, 0.8)',
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginBottom: scale(SPACING.sm),
    marginLeft: scale(SPACING.xs),
  },
  inputContainer: {
    width: '100%',
    marginBottom: scale(SPACING.lg),
  },
  textInput: {
    width: '100%',
    height: scale(56),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    paddingHorizontal: scale(SPACING.lg),
    fontSize: scaleFont(16),
    color: COLORS.black,
  },
  codeInput: {
    fontSize: scaleFont(24),
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: scale(1),
  },
  codeInputHint: {
    fontSize: scaleFont(12),
    color: 'rgba(0, 0, 0, 0.5)',
    textAlign: 'center',
    marginTop: scale(SPACING.sm),
  },
  buttonRow: {
    flexDirection: 'row',
    gap: scale(12),
    width: '100%',
    paddingBottom: ANDROID_BOTTOM_PADDING,
  },
  buttonFlex: {
    flex: 1,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: scale(52),
    backgroundColor: COLORS.black,
    borderRadius: scale(RADIUS.full),
  },
  primaryButtonFullWidth: {
    width: '100%',
    flex: undefined,
  },
  primaryButtonDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  primaryButtonText: {
    fontSize: scaleFont(16),
    color: COLORS.white,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  buttonTextDisabled: {
    color: 'rgba(0, 0, 0, 0.4)',
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: scale(52),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  secondaryButtonText: {
    fontSize: scaleFont(16),
    color: COLORS.black,
    fontWeight: '600',
  },
  secondaryButtonDisabled: {
    backgroundColor: '#f5f5f5',
    borderColor: '#e0e0e0',
  },
  secondaryButtonTextDisabled: {
    color: 'rgba(0, 0, 0, 0.3)',
  },
  // Social Login Styles
  socialLoginContainer: {
    width: '100%',
    marginBottom: scale(SPACING.lg),
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '85%',
    height: scale(50),
    borderRadius: scale(RADIUS.md),
    marginBottom: scale(SPACING.lg),
  },
  socialIconContainer: {
    width: IS_TABLET ? 24 : scale(24),
    height: IS_TABLET ? 24 : scale(24),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: IS_TABLET ? 8 : scale(8),
  },
  socialIcon: {
    width: scale(20),
    height: scale(20),
  },
  googleButton: {
    backgroundColor: '#ffffff',
    borderWidth: scale(1),
    borderColor: '#dbdbdb',
    paddingLeft: scale(10),
  },
  kakaoButton: {
    backgroundColor: '#FEE500',
    paddingLeft: scale(3),
  },
  appleButton: {
    backgroundColor: '#ffffff',
    borderWidth: scale(1),
    borderColor: '#dbdbdb',
  },
  appleButtonText: {
    fontSize: scaleFont(15),
    color: '#000000',
    fontWeight: '500',
  },
  googleButtonText: {
    fontSize: scaleFont(15),
    color: '#000000',
    fontWeight: '500',
  },
  kakaoButtonText: {
    fontSize: scaleFont(15),
    color: '#3C1E1E',
    fontWeight: '500',
  },
  disabledButton: {
    opacity: 0.5,
  },
  // Terms disclaimer styles
  termsDisclaimerContainer: {
    marginTop: scale(SPACING.sm),
    width: '85%',
    alignSelf: 'center',
  },
  termsDisclaimerText: {
    fontSize: scaleFont(12),
    color: 'rgba(0, 0, 0, 0.5)',
    textAlign: 'center',
    lineHeight: scale(18),
  },
  termsDisclaimerLink: {
    color: 'rgba(0, 0, 0, 0.7)',
    textDecorationLine: 'underline',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: scale(SPACING.md),
    marginBottom: scale(SPACING.sm),
  },
  dividerLine: {
    flex: 1,
    height: scale(1),
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  dividerText: {
    paddingHorizontal: scale(SPACING.md),
    fontSize: scaleFont(13),
    color: 'rgba(0, 0, 0, 0.5)',
  },
  skipButton: {
    marginTop: scale(SPACING.lg),
    paddingVertical: scale(SPACING.md),
  },
  skipButtonText: {
    fontSize: scaleFont(14),
    color: 'rgba(0, 0, 0, 0.6)',
    fontWeight: '500',
  },
  skipButtonTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingVertical: scale(SPACING.sm),
    paddingHorizontal: scale(SPACING.md),
    zIndex: 10,
  },
  skipButtonTopRightText: {
    fontSize: scaleFont(14),
    color: 'rgba(0, 0, 0, 0.6)',
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: scale(12),
    width: '100%',
    marginBottom: scale(SPACING.md),
  },
  toggleButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scale(12),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  toggleButtonSmall: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scale(8),
    paddingHorizontal: scale(20),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  toggleButtonActive: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.black,
  },
  toggleButtonText: {
    fontSize: scaleFont(14),
    color: '#666',
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: COLORS.white,
  },
  pairingContentArea: {
    width: '100%',
    minHeight: scale(160),
    marginBottom: scale(SPACING.lg),
  },
  codeInputArea: {
    width: '100%',
  },
  codeDisplayContainer: {
    width: '100%',
    padding: scale(SPACING.xl),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: scaleFont(13),
    color: 'rgba(0, 0, 0, 0.6)',
    fontWeight: '500',
  },
  codeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(SPACING.md),
    gap: scale(SPACING.sm),
  },
  codeTimer: {
    fontSize: scaleFont(13),
    color: 'rgba(0, 0, 0, 0.5)',
    fontWeight: '400',
  },
  codeBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(SPACING.sm),
    position: 'relative',
    width: '100%',
  },
  codeText: {
    fontSize: scaleFont(32),
    color: COLORS.black,
    fontWeight: '700',
    letterSpacing: scale(6),
    textAlign: 'center',
  },
  shareButton: {
    position: 'absolute',
    right: 0,
    padding: scale(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButton: {
    position: 'absolute',
    top: scale(72),
    left: scale(SPACING.lg),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(SPACING.xs),
    paddingVertical: scale(SPACING.sm),
    zIndex: 20,
  },
  logoutButtonText: {
    color: COLORS.black,
    fontSize: scaleFont(14),
    fontWeight: '500',
  },
  deleteAccountButton: {
    position: 'absolute',
    top: scale(72),
    right: scale(SPACING.lg),
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(SPACING.xs),
    paddingVertical: scale(SPACING.sm),
    zIndex: 20,
  },
  deleteAccountButtonText: {
    color: '#FF4444',
    fontSize: scaleFont(14),
    fontWeight: '500',
  },
  copyToastOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  copyToastBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: scale(SPACING.xl),
    paddingVertical: scale(SPACING.md),
    borderRadius: scale(RADIUS.lg),
  },
  copyToastText: {
    fontSize: scaleFont(15),
    color: COLORS.white,
    fontWeight: '500',
  },
  deleteAccountLink: {
    alignSelf: 'center',
    paddingVertical: scale(SPACING.md),
    marginTop: scale(SPACING.sm),
  },
  deleteAccountLinkText: {
    fontSize: scaleFont(13),
    color: 'rgba(0, 0, 0, 0.4)',
    textDecorationLine: 'underline',
  },
  // Email login styles
  emailLoginLink: {
    alignSelf: 'center',
    paddingVertical: scale(SPACING.xs),
    marginBottom: 0,
  },
  emailLoginLinkText: {
    fontSize: scaleFont(14),
    color: 'rgba(0, 0, 0, 0.6)',
    textDecorationLine: 'underline',
  },
  emailModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(SPACING.lg),
  },
  emailModalContent: {
    backgroundColor: COLORS.white,
    borderRadius: scale(24),
    padding: scale(SPACING.xl),
    width: '100%',
    maxWidth: scale(400),
  },
  emailModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(SPACING.xl),
  },
  emailModalTitle: {
    fontSize: scaleFont(20),
    color: COLORS.black,
    fontWeight: '700',
  },
  emailModalCloseButton: {
    padding: scale(SPACING.xs),
  },
  emailInput: {
    width: '100%',
    height: scale(52),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    paddingHorizontal: scale(SPACING.lg),
    fontSize: scaleFont(16),
    color: COLORS.black,
    marginBottom: scale(SPACING.md),
  },
  emailSubmitButton: {
    width: '100%',
    height: scale(52),
    backgroundColor: COLORS.black,
    borderRadius: scale(RADIUS.lg),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: scale(SPACING.sm),
  },
  emailSubmitText: {
    fontSize: scaleFont(16),
    color: COLORS.white,
    fontWeight: '600',
  },
  emailToggleButton: {
    alignSelf: 'center',
    marginTop: scale(SPACING.lg),
    padding: scale(SPACING.sm),
  },
  emailToggleText: {
    fontSize: scaleFont(14),
    color: COLORS.accent,
    fontWeight: '500',
  },
  codeHint: {
    fontSize: scaleFont(12),
    color: 'rgba(0, 0, 0, 0.5)',
    textAlign: 'center',
    lineHeight: scale(18),
    marginTop: scale(SPACING.sm),
  },
  termsContainer: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    marginBottom: scale(SPACING.lg),
    overflow: 'hidden',
  },
  termsAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: scale(SPACING.lg),
    gap: scale(SPACING.md),
  },
  termsAllText: {
    fontSize: scaleFont(16),
    color: COLORS.black,
    fontWeight: '600',
  },
  termsDivider: {
    height: scale(1),
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  termsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scale(SPACING.md),
    paddingHorizontal: scale(SPACING.lg),
  },
  termsCheckboxArea: {
    padding: scale(SPACING.sm),
  },
  termsTextArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: scale(SPACING.sm),
    paddingLeft: scale(SPACING.sm),
  },
  termsItemText: {
    flex: 1,
    fontSize: scaleFont(14),
    color: 'rgba(0, 0, 0, 0.8)',
  },
  checkbox: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(6),
    backgroundColor: '#f5f5f5',
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  termsStepContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  termsTitleContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.xxxl),
    height: scale(140),
  },
  termsContentArea: {
    flex: 1,
    width: '100%',
    paddingBottom: scale(7),
  },
  termsScrollView: {
    flex: 1,
    width: '100%',
  },
  termsScrollContent: {
    paddingBottom: scale(SPACING.md),
  },
  termsItemWrapper: {
    width: '100%',
  },
  termsDescriptionBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: scale(RADIUS.sm),
    padding: scale(SPACING.md),
    marginLeft: scale(SPACING.lg + 24 + SPACING.md),
    marginRight: scale(SPACING.lg),
    marginBottom: scale(SPACING.sm),
  },
  termsDescriptionText: {
    fontSize: scaleFont(12),
    color: 'rgba(0, 0, 0, 0.6)',
    lineHeight: scale(18),
  },
  policyModalContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  policyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.md),
    borderBottomWidth: scale(1),
    borderBottomColor: '#f0f0f0',
    position: 'relative',
  },
  policyModalTitle: {
    fontSize: scaleFont(18),
    fontWeight: '600',
    color: COLORS.black,
  },
  policyModalCloseButton: {
    position: 'absolute',
    right: scale(SPACING.md),
    width: scale(40),
    height: scale(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  webViewLoading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: scale(-20),
    marginTop: scale(-20),
    zIndex: 10,
  },
  webView: {
    flex: 1,
  },
  relationshipRow: {
    flexDirection: 'row',
    gap: scale(12),
    width: '100%',
    marginBottom: scale(SPACING.xl),
  },
  relationshipButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scale(16),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  relationshipButtonActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  relationshipButtonText: {
    fontSize: scaleFont(15),
    color: '#666',
    fontWeight: '600',
  },
  relationshipButtonTextActive: {
    color: COLORS.black,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: scale(56),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    paddingHorizontal: scale(SPACING.lg),
    gap: scale(SPACING.md),
    marginBottom: scale(SPACING.lg),
  },
  datePickerText: {
    fontSize: scaleFont(16),
    color: 'rgba(0, 0, 0, 0.4)',
  },
  datePickerTextSelected: {
    color: COLORS.black,
  },
  datePickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  datePickerModalContent: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: scale(20),
    borderTopRightRadius: scale(20),
    paddingBottom: scale(40),
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: scale(SPACING.lg),
    borderBottomWidth: scale(1),
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  datePickerCancel: {
    fontSize: scaleFont(16),
    color: 'rgba(255, 255, 255, 0.6)',
  },
  datePickerConfirm: {
    fontSize: scaleFont(16),
    color: COLORS.white,
    fontWeight: '600',
  },
  datePicker: {
    height: scale(200),
    alignSelf: 'center',
    width: '100%',
  },
  preferencesInfoBox: {
    width: '100%',
    padding: scale(SPACING.lg),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    marginBottom: scale(SPACING.xl),
  },
  preferencesInfoBoxBottom: {
    width: '100%',
    padding: scale(SPACING.lg),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    marginBottom: scale(SPACING.lg),
    marginTop: scale(SPACING.xxl),
    marginHorizontal: scale(SPACING.xl),
    alignSelf: 'center',
  },
  preferencesInfoBoxMiddle: {
    position: 'absolute',
    top: '48%',
    left: scale(SPACING.lg),
    right: scale(SPACING.lg),
    padding: scale(SPACING.lg),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  preferencesInfoBoxInline: {
    width: '100%',
    padding: scale(SPACING.lg),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  preferencesInfoText: {
    fontSize: scaleFont(14),
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
    lineHeight: scale(22),
  },
  mbtiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(10),
    width: '100%',
    marginBottom: scale(SPACING.xl),
  },
  mbtiButton: {
    width: scale((width - SPACING.lg * 2 - 30) / 4),
    height: scale(44),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.sm),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  mbtiButtonActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  mbtiButtonText: {
    fontSize: scaleFont(13),
    color: '#666',
    fontWeight: '600',
  },
  mbtiButtonTextActive: {
    color: COLORS.black,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(10),
    width: '100%',
    marginBottom: scale(SPACING.xl),
  },
  optionButton: {
    width: scale((width - SPACING.lg * 2 - 10) / 2),
    paddingVertical: scale(14),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  optionButtonActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  optionButtonText: {
    fontSize: scaleFont(14),
    color: '#666',
    fontWeight: '500',
  },
  optionButtonTextActive: {
    color: COLORS.black,
  },
  styleButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scale(16),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  styleButtonActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  styleButtonText: {
    fontSize: scaleFont(15),
    color: '#666',
    fontWeight: '600',
  },
  styleButtonTextActive: {
    color: COLORS.black,
  },
  activityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(10),
    width: '100%',
    marginBottom: scale(SPACING.xl),
  },
  activityGrid3Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(8),
    width: '100%',
    paddingTop: scale(SPACING.md),
  },
  activityButton: {
    width: scale((width - SPACING.lg * 2 - 10) / 2),
    paddingVertical: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    gap: scale(6),
  },
  activityButtonSmall: {
    width: scale((width - SPACING.lg * 2 - 16) / 3),
    paddingVertical: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.sm),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    gap: scale(4),
  },
  activityButtonActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  activityIcon: {
    fontSize: scaleFont(24),
  },
  activityIconSmall: {
    fontSize: scaleFont(20),
  },
  activityButtonText: {
    fontSize: scaleFont(13),
    color: '#666',
    fontWeight: '500',
  },
  activityButtonTextSmall: {
    fontSize: scaleFont(11),
    color: '#666',
    fontWeight: '500',
  },
  activityButtonTextActive: {
    color: COLORS.black,
  },
  dateWorryList: {
    width: '100%',
    maxHeight: scale(420),
  },
  dateWorryContent: {
    gap: scale(10),
    paddingBottom: scale(SPACING.md),
  },
  dateWorryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: scale(14),
    paddingHorizontal: scale(SPACING.lg),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  dateWorryButtonActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  dateWorryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(SPACING.md),
  },
  dateWorryIcon: {
    fontSize: scaleFont(20),
  },
  dateWorryButtonText: {
    fontSize: scaleFont(14),
    color: '#666',
    fontWeight: '500',
  },
  dateWorryButtonTextActive: {
    color: COLORS.black,
  },
  checkIconPlaceholder: {
    width: scale(20),
    height: scale(20),
    alignItems: 'center',
    justifyContent: 'center',
  },
  constraintGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(10),
    width: '100%',
    marginBottom: scale(SPACING.xl),
  },
  constraintButton: {
    width: scale((width - SPACING.lg * 2 - 10) / 2),
    paddingVertical: scale(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    gap: scale(6),
  },
  constraintButtonActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  constraintIcon: {
    fontSize: scaleFont(24),
  },
  constraintButtonText: {
    fontSize: scaleFont(13),
    color: '#666',
    fontWeight: '500',
  },
  constraintButtonTextActive: {
    color: COLORS.black,
  },
  constraintButtonVertical: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: scale(16),
    paddingHorizontal: scale(SPACING.lg),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
  },
  constraintButtonVerticalActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  constraintButtonVerticalText: {
    fontSize: scaleFont(14),
    color: '#666',
    fontWeight: '500',
    flex: 1,
  },
  constraintButtonVerticalTextActive: {
    color: COLORS.black,
  },
  celebrationIconContainer: {
    width: scale(96),
    height: scale(96),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(SPACING.xxl),
  },
  celebrationTitle: {
    fontSize: scaleFont(36),
    color: COLORS.black,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: scale(SPACING.md),
  },
  celebrationDescription: {
    fontSize: scaleFont(16),
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
    lineHeight: scale(24),
    marginBottom: scale(SPACING.xxxl),
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  confettiEmoji: {
    position: 'absolute',
    fontSize: scaleFont(32),
  },
  confetti1: {
    top: '15%',
    left: '10%',
  },
  confetti2: {
    top: '20%',
    right: '15%',
  },
  confetti3: {
    top: '35%',
    left: '20%',
  },
  confetti4: {
    top: '30%',
    right: '10%',
  },
  rewardBadge: {
    backgroundColor: '#f5f5f5',
    paddingVertical: scale(SPACING.md),
    paddingHorizontal: scale(SPACING.lg),
    borderRadius: scale(RADIUS.lg),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    marginTop: scale(SPACING.xl),
  },
  rewardBadgeText: {
    fontSize: scaleFont(15),
    color: COLORS.black,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Calendar Type Toggle
  calendarTypeToggle: {
    flexDirection: 'row',
    gap: scale(8),
    width: '100%',
  },
  calendarTypeButton: {
    flex: 1,
    paddingVertical: scale(SPACING.sm),
    paddingHorizontal: scale(SPACING.md),
    borderRadius: scale(RADIUS.lg),
    backgroundColor: '#f5f5f5',
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    alignItems: 'center',
  },
  calendarTypeButtonActive: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.black,
  },
  calendarTypeButtonText: {
    fontSize: scaleFont(12),
    fontWeight: '600',
    color: '#666',
  },
  calendarTypeButtonTextActive: {
    color: COLORS.white,
  },
  // Basic Info styles
  basicInfoScrollView: {
    flex: 1,
    width: '100%',
  },
  basicInfoScrollContent: {
    paddingHorizontal: scale(SPACING.md),
    paddingTop: scale(SPACING.lg),
    paddingBottom: scale(SPACING.xxxl),
  },
  basicInfoSection: {
    marginBottom: scale(SPACING.huge),
  },
  basicInfoLabel: {
    fontSize: scaleFont(16),
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: scale(SPACING.sm),
    marginLeft: scale(SPACING.xs),
  },
  basicInfoInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.lg),
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.md),
    fontSize: scaleFont(16),
    color: COLORS.black,
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    height: scale(50),
    letterSpacing: 0,
  },
  basicInfoDateButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.lg),
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  birthDateRow: {
    flexDirection: 'row',
    gap: scale(SPACING.sm),
    alignItems: 'center',
  },
  birthDateButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.lg),
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: scale(50),
    flex: 1,
  },
  calendarTypeButtons: {
    flexDirection: 'row',
    gap: scale(4),
  },
  calendarTypeButtonSmall: {
    width: scale(56),
    height: scale(50),
    borderRadius: scale(RADIUS.lg),
    backgroundColor: '#f5f5f5',
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  birthDateButtonFull: {
    width: '100%',
    height: scale(50),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.lg),
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  anniversaryDateRow: {
    flexDirection: 'row',
    gap: scale(SPACING.sm),
    alignItems: 'center',
  },
  anniversaryDateButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.lg),
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.md),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: scale(50),
    flex: 1,
  },
  relationshipTypeButtons: {
    flexDirection: 'row',
    gap: scale(SPACING.xs),
  },
  relationshipTypeButtonSmall: {
    width: scale(50),
    height: scale(50),
    borderRadius: scale(RADIUS.lg),
    backgroundColor: '#f5f5f5',
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  basicInfoDateText: {
    fontSize: scaleFont(16),
    color: 'rgba(0, 0, 0, 0.4)',
  },
  basicInfoDateTextSelected: {
    color: COLORS.black,
  },
  calendarTypeRow: {
    flexDirection: 'row',
    gap: scale(SPACING.xs),
    marginBottom: scale(SPACING.sm),
  },
  relationshipTypeRow: {
    flexDirection: 'row',
    gap: scale(SPACING.sm),
  },
  relationshipTypeButton: {
    flex: 1,
    height: scale(50),
    borderRadius: scale(RADIUS.lg),
    backgroundColor: '#f5f5f5',
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  relationshipTypeButtonActive: {
    backgroundColor: COLORS.black,
    borderColor: COLORS.black,
  },
  relationshipTypeButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    color: '#666',
  },
  relationshipTypeButtonTextActive: {
    color: COLORS.white,
  },
  relationshipDropdownButton: {
    width: scale(70),
    height: scale(50),
    borderRadius: scale(RADIUS.lg),
    backgroundColor: '#f5f5f5',
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(SPACING.xs),
  },
  relationshipDropdownText: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: COLORS.black,
  },
  relationshipDropdownMenu: {
    marginTop: scale(SPACING.sm),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.lg),
    borderWidth: scale(1),
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  relationshipDropdownItem: {
    paddingVertical: scale(SPACING.md),
    paddingHorizontal: scale(SPACING.lg),
    borderBottomWidth: scale(1),
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  relationshipDropdownItemActive: {
    backgroundColor: '#e8f5e9',
  },
  relationshipDropdownItemText: {
    fontSize: scaleFont(15),
    fontWeight: '500',
    color: COLORS.black,
    textAlign: 'center',
  },
  relationshipDropdownItemTextActive: {
    fontWeight: '700',
  },
});
