import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  Pressable,
  TextInput,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
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
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { signInWithGoogle, signInWithKakao, onAuthStateChange } from '@/lib/socialAuth';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useAuthStore } from '@/stores';
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
} from '@/stores/onboardingStore';
import { useBackground } from '@/contexts';
import { db, isDemoMode, supabase } from '@/lib/supabase';
import { formatDateToLocal } from '@/lib/dateUtils';

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
const STEP_A = ['terms', 'pairing', 'basic_info', 'couple_info'];
const STEP_B = ['mbti', 'activity_type', 'date_worries', 'constraints'];

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { backgroundImage } = useBackground();
  const { setIsOnboardingComplete, updateNickname, setCouple, setUser, setPartner, user: currentUser, couple } = useAuthStore();
  const {
    currentStep,
    data,
    setStep,
    nextStep,
    prevStep,
    updateData,
  } = useOnboardingStore();

  // Local state
  const [generatedCode, setGeneratedCode] = useState(() => generatePairingCode());
  const [hasExistingPreferences, setHasExistingPreferences] = useState(false);

  // On app restart: If user has a paired couple (both user1Id and user2Id set), skip to basic_info
  useEffect(() => {
    const earlySteps = ['welcome', 'login', 'terms', 'pairing'];
    if (couple?.user1Id && couple?.user2Id && earlySteps.includes(currentStep)) {
      console.log('[Onboarding] User has paired couple, skipping to basic_info');
      setStep('basic_info');
    }
  }, [couple?.user1Id, couple?.user2Id, currentStep, setStep]);

  // Check if user has existing onboarding answers (for conditional preference skipping)
  useEffect(() => {
    const checkExistingPreferences = async () => {
      if (!isDemoMode && currentUser?.id) {
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

  // Animation
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const animateTransition = useCallback((callback: () => void) => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      callback();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);

  const handleNext = useCallback(() => {
    animateTransition(() => nextStep());
  }, [animateTransition, nextStep]);

  const handleBack = useCallback(() => {
    animateTransition(() => prevStep());
  }, [animateTransition, prevStep]);

  // Social Login Handler
  const handleSocialLogin = useCallback(async (provider: 'google' | 'kakao') => {
    try {
      console.log(`[Onboarding] Starting ${provider} login...`);

      let session = null;
      if (provider === 'google') {
        session = await signInWithGoogle();
      } else {
        session = await signInWithKakao();
      }

      if (session && session.user) {
        console.log(`[Onboarding] ${provider} login successful:`, session.user.id);

        // Extract user info from session
        const userMetadata = (session.user.user_metadata || {}) as Record<string, string | undefined>;
        const email = session.user.email || userMetadata.email || '';
        const name = userMetadata.full_name || userMetadata.name || '';
        const avatarUrl = userMetadata.avatar_url || userMetadata.picture || '';

        // Create a basic user object
        const newUser = {
          id: session.user.id,
          email,
          nickname: name || email.split('@')[0] || t('onboarding.defaultUser'),
          avatarUrl,
          inviteCode: generatePairingCode(),
          preferences: {} as any,
          createdAt: new Date(),
        };

        // Set user in auth store
        setUser(newUser);

        // Update nickname in onboarding data
        if (name) {
          updateData({ nickname: name });
        }

        // Create or update profile in Supabase
        try {
          const { error: profileError } = await db.profiles.upsert({
            id: session.user.id,
            nickname: newUser.nickname,
            invite_code: newUser.inviteCode,
          });

          if (profileError) {
            console.error('[Onboarding] Profile upsert error:', profileError);
          }

          // Check if user already has a completed couple (already paired)
          const { data: existingCouple } = await db.couples.getActiveByUserId(session.user.id);

          if (existingCouple && existingCouple.user1_id && existingCouple.user2_id) {
            console.log('[Onboarding] User already paired, skipping to basic_info');

            // Set couple in auth store
            setCouple({
              id: existingCouple.id,
              user1Id: existingCouple.user1_id,
              user2Id: existingCouple.user2_id,
              anniversaryDate: existingCouple.dating_start_date ? parseDateAsLocal(existingCouple.dating_start_date) : new Date(),
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

            // Skip to basic_info step (after pairing)
            Alert.alert(
              t('onboarding.login.welcomeBack'),
              t('onboarding.login.alreadyConnected'),
              [
                {
                  text: t('onboarding.continue'),
                  onPress: () => animateTransition(() => setStep('basic_info')),
                },
              ]
            );
            return;
          }
        } catch (dbError) {
          console.error('[Onboarding] DB error:', dbError);
        }

        // Move to terms step (for new users)
        Alert.alert(
          t('onboarding.login.success'),
          t('onboarding.login.successMessage', { provider: provider === 'google' ? 'Google' : 'Kakao' }),
          [
            {
              text: t('onboarding.continue'),
              onPress: () => animateTransition(() => setStep('terms')),
            },
          ]
        );
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

    // Save onboarding data to Supabase if not in demo mode
    if (!isDemoMode) {
      try {
        if (currentUser?.id) {
          // Prepare preferences object for DB storage
          const preferences = {
            mbti: data.mbti,
            gender: data.gender,
            birthDateCalendarType: data.birthDateCalendarType,
            activityTypes: data.activityTypes,
            dateWorries: data.dateWorries,
            constraints: data.constraints,
            relationshipType: data.relationshipType,
          };

          // Update profile with birth date and preferences (profile already exists from pairing step)
          const { error: profileError } = await db.profiles.update(currentUser.id, {
            nickname: data.nickname,
            birth_date: data.birthDate ? formatDateToLocal(data.birthDate) : null,
            preferences,
          });

          if (profileError) {
            console.error('Profile update error:', profileError);
          }

          // Update couple with anniversary date (couple was already created in pairing step)
          console.log('Checking couple update conditions:', {
            hasAnniversaryDate: !!data.anniversaryDate,
            coupleId: currentCouple?.id,
            anniversaryDate: data.anniversaryDate?.toISOString(),
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

  // Progress calculation
  const getProgress = () => {
    if (currentStep === 'welcome' || currentStep === 'login') return 0;
    if (currentStep === 'complete') return 1;

    const stepAIndex = STEP_A.indexOf(currentStep);
    if (stepAIndex !== -1) {
      return (stepAIndex + 1) / STEP_A.length * 0.5;
    }

    if (currentStep === 'preferences_intro') return 0.5;

    const stepBIndex = STEP_B.indexOf(currentStep);
    if (stepBIndex !== -1) {
      return 0.5 + ((stepBIndex + 1) / STEP_B.length * 0.5);
    }

    return 0;
  };

  const showProgress = !['welcome', 'login', 'complete'].includes(currentStep);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      enabled={currentStep !== 'basic_info' && currentStep !== 'pairing'}
    >
      {/* Background */}
      <ImageBackground
        source={backgroundImage}
        style={styles.backgroundImage}
        resizeMode="cover"
        blurRadius={40}
      />
      <View style={styles.overlay} />

      {/* Progress Bar */}
      {showProgress && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${getProgress() * 100}%` }]} />
          </View>
        </View>
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
          {currentStep === 'welcome' && (
            <WelcomeStep
              onNext={() => animateTransition(() => setStep('terms'))}
              onSocialLogin={handleSocialLogin}
            />
          )}
          {currentStep === 'terms' && (
            <TermsStep
              onNext={handleNext}
              onBack={() => animateTransition(() => setStep('welcome'))}
              updateData={updateData}
            />
          )}
          {currentStep === 'pairing' && (
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
              onBack={handleBack}
            />
          )}
          {currentStep === 'basic_info' && (
            <BasicInfoStep
              nickname={data.nickname}
              setNickname={(name) => updateData({ nickname: name })}
              birthDate={data.birthDate}
              setBirthDate={(date) => updateData({ birthDate: date })}
              calendarType={data.birthDateCalendarType}
              setCalendarType={(type) => updateData({ birthDateCalendarType: type })}
              onNext={() => {
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
          {currentStep === 'couple_info' && (
            <CoupleInfoStep
              relationshipType={data.relationshipType}
              setRelationshipType={(type) => updateData({ relationshipType: type })}
              anniversaryDate={data.anniversaryDate}
              setAnniversaryDate={(date) => updateData({ anniversaryDate: date })}
              onNext={() => {
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
          {currentStep === 'preferences_intro' && (
            <PreferencesIntroStep
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 'mbti' && (
            <MBTIStep
              mbti={data.mbti}
              setMbti={(mbti) => updateData({ mbti })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 'activity_type' && (
            <ActivityTypeStep
              activityTypes={data.activityTypes}
              setActivityTypes={(types) => updateData({ activityTypes: types })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 'date_worries' && (
            <DateWorriesStep
              dateWorries={data.dateWorries || []}
              setDateWorries={(worries) => updateData({ dateWorries: worries })}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 'constraints' && (
            <ConstraintsStep
              constraints={data.constraints}
              setConstraints={(cons) => updateData({ constraints: cons })}
              onNext={() => animateTransition(() => setStep('complete'))}
              onBack={handleBack}
            />
          )}
          {currentStep === 'complete' && (
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
function WelcomeStep({ onNext, onSocialLogin }: { onNext: () => void; onSocialLogin: (provider: 'google' | 'kakao') => void }) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState<'google' | 'kakao' | null>(null);

  const handleSocialLogin = async (provider: 'google' | 'kakao') => {
    if (isLoading) return;

    setIsLoading(provider);
    try {
      if (isDemoMode) {
        Alert.alert(
          t('onboarding.login.demoMode'),
          t('onboarding.login.demoModeMessage'),
          [{ text: t('onboarding.confirm') }]
        );
        return;
      }

      onSocialLogin(provider);
    } catch (error) {
      console.error(`[WelcomeStep] ${provider} login error:`, error);
      Alert.alert(
        t('onboarding.login.failed'),
        t('onboarding.login.failedProvider', { provider: provider === 'google' ? 'Google' : 'Kakao' }),
        [{ text: t('onboarding.confirm') }]
      );
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <View style={styles.centeredStepContainer}>
      <View style={styles.welcomeCenteredContent}>
        <View style={styles.welcomeIconWrapper}>
          <View style={styles.iconContainer}>
            <Heart color={COLORS.white} size={48} fill={COLORS.white} />
          </View>
        </View>

        <Text style={styles.welcomeTitle}>
          {t('onboarding.welcomeTitle')}
        </Text>

        <Text style={styles.welcomeDescription}>
          {t('onboarding.welcomeSubtitle')}
        </Text>
      </View>

      <View style={styles.socialLoginContainer}>
        {/* Google Login Button */}
        <Pressable
          style={[styles.socialButton, styles.googleButton]}
          onPress={() => handleSocialLogin('google')}
          disabled={isLoading !== null}
        >
          {isLoading === 'google' ? (
            <ActivityIndicator size="small" color="#757575" />
          ) : (
            <>
              <Image
                source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
                style={styles.socialIcon}
              />
              <Text style={styles.googleButtonText}>{t('onboarding.login.google')}</Text>
            </>
          )}
        </Pressable>

        {/* Kakao Login Button */}
        <Pressable
          style={[styles.socialButton, styles.kakaoButton]}
          onPress={() => handleSocialLogin('kakao')}
          disabled={isLoading !== null}
        >
          {isLoading === 'kakao' ? (
            <ActivityIndicator size="small" color="#3C1E1E" />
          ) : (
            <>
              <Image
                source={{ uri: 'https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png' }}
                style={styles.kakaoIcon}
              />
              <Text style={styles.kakaoButtonText}>{t('onboarding.login.kakao')}</Text>
            </>
          )}
        </Pressable>

        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{t('onboarding.login.or')}</Text>
          <View style={styles.dividerLine} />
        </View>
      </View>

      <Pressable style={styles.primaryButton} onPress={onNext}>
        <Text style={styles.primaryButtonText}>{t('onboarding.start')}</Text>
      </Pressable>
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
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
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
              <Calendar color={birthDate ? COLORS.white : 'rgba(255, 255, 255, 0.4)'} size={20} />
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
    try {
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
    if (isCreatingCode && !isDemoMode && !isCodeSaved) {
      const setupPairing = async (codeToUse: string, retryCount = 0) => {
        try {
          // Use existing user ID if logged in, otherwise generate new ID
          const creatorUserId = currentUser?.id || generateUUID();
          const isExistingUser = !!currentUser?.id;
          console.log('[PairingStep] Creator setup:', { creatorUserId, isExistingUser });

          // Save code to DB
          const { data: createdCode, error: createError } = await db.pairingCodes.create(codeToUse, creatorUserId);
          if (createError) {
            // Handle duplicate key error by generating a new code
            if (createError.code === '23505' && retryCount < 3) {
              const newCode = generatePairingCode();
              setGeneratedCode(newCode);
              // Retry with new code
              setupPairing(newCode, retryCount + 1);
              return;
            }
            console.error('Error creating pairing code:', createError);
            return;
          }

          // Create or update profile for creator in DB
          if (isExistingUser) {
            // Update existing profile with new invite code
            const { error: profileError } = await db.profiles.update(creatorUserId, {
              invite_code: codeToUse,
            });
            if (profileError) {
              console.error('Error updating profile:', profileError);
            }
          } else {
            // Create new profile
            const { error: profileError } = await db.profiles.create({
              id: creatorUserId,
              nickname: '', // Will be updated in handleComplete
              invite_code: codeToUse,
            });
            if (profileError) {
              console.error('Error creating profile:', profileError);
            }
          }

          // Create couple for this user (creator is user1)
          const { data: newCouple, error: coupleError } = await db.couples.create({
            user1_id: creatorUserId,
          });

          if (coupleError) {
            console.error('Error creating couple:', coupleError);
          } else if (newCouple) {
            // Link couple_id to pairing code
            await db.pairingCodes.setCoupleId(codeToUse, newCouple.id);

            // Set couple in authStore
            setCouple({
              id: newCouple.id,
              user1Id: creatorUserId,
              anniversaryDate: new Date(),
              anniversaryType: t('onboarding.anniversary.datingStart'),
              status: 'pending',
              createdAt: new Date(),
            });

            // Only update user in authStore if not already logged in
            if (!isExistingUser) {
              setUser({
                id: creatorUserId,
                email: '',
                nickname: '',
                inviteCode: codeToUse,
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

          setIsCodeSaved(true);

          // Set expiration time (24 hours from now)
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          setCodeExpiresAt(expiresAt);

          // Subscribe to changes (realtime)
          channelRef.current = db.pairingCodes.subscribeToCode(codeToUse, async (payload) => {
            // When joiner proceeds to next screen, auto-follow
            if (payload.joiner_proceeded_at) {
              onNext();
              return;
            }

            if (payload.status === 'connected' && payload.joiner_id) {
              // Fetch updated couple data
              const { data: pairingData } = await db.pairingCodes.getWithCouple(codeToUse);
              if (pairingData?.couple_id) {
                const { data: coupleData } = await db.couples.get(pairingData.couple_id);
                if (coupleData) {
                  // Update couple with user2Id
                  setCouple({
                    id: coupleData.id,
                    user1Id: coupleData.user1_id,
                    user2Id: coupleData.user2_id,
                    anniversaryDate: coupleData.dating_start_date ? parseDateAsLocal(coupleData.dating_start_date) : new Date(),
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
                }
              }
              setIsPairingConnected(true);
            }
          });
        } catch (err) {
          console.error('Pairing setup error:', err);
        }
      };

      setupPairing(generatedCode);
    } else if (isCreatingCode && isDemoMode && !codeExpiresAt) {
      // Demo mode: set fake expiration and create demo couple
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      setCodeExpiresAt(expiresAt);

      // Set demo couple in authStore
      const demoUserId = generateUUID();
      const demoCoupleId = generateUUID();
      setUser({
        id: demoUserId,
        email: '',
        nickname: '',
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
      setCouple({
        id: demoCoupleId,
        user1Id: demoUserId,
        anniversaryDate: new Date(),
        anniversaryType: t('onboarding.anniversary.datingStart'),
        status: 'pending',
        createdAt: new Date(),
      });
    }

    // Cleanup subscription on unmount
    return () => {
      if (channelRef.current) {
        db.pairingCodes.unsubscribe(channelRef.current);
      }
    };
  }, [isCreatingCode, generatedCode, isCodeSaved, setIsPairingConnected, setGeneratedCode, codeExpiresAt, setCouple, setUser, currentUser?.id]);

  // Separate useEffect for polling - runs when code is saved but not yet connected
  React.useEffect(() => {
    if (isCreatingCode && !isDemoMode && isCodeSaved && !isPairingConnected && generatedCode) {
      // Start polling as fallback (every 1.5 seconds)
      pollingRef.current = setInterval(async () => {
        try {
          if (supabase) {
            const { data: checkData } = await supabase
              .from('pairing_codes')
              .select('status')
              .eq('code', generatedCode)
              .single();

            if (checkData?.status === 'connected') {
              setIsPairingConnected(true);
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
  }, [isCreatingCode, isCodeSaved, isPairingConnected, generatedCode, setIsPairingConnected]);

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

  // Handle join (for code enterer)
  const handleJoin = async () => {
    if (isDemoMode) {
      // Demo mode: create demo joiner and couple
      const demoJoinerId = generateUUID();
      const demoCoupleId = generateUUID();
      setUser({
        id: demoJoinerId,
        email: '',
        nickname: '',
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
      setCouple({
        id: demoCoupleId,
        user1Id: generateUUID(),
        user2Id: demoJoinerId,
        anniversaryDate: new Date(),
        anniversaryType: t('onboarding.anniversary.datingStart'),
        status: 'active',
        createdAt: new Date(),
      });
      setIsPairingConnected(true);
      // Navigation will be handled by useEffect that detects paired couple
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get pairing code with couple_id
      const { data: existingCode, error: findError } = await db.pairingCodes.getWithCouple(pairingCode);

      if (findError || !existingCode) {
        setError(t('onboarding.pairing.invalidCode'));
        setIsLoading(false);
        return;
      }

      // Check if code already used
      if (existingCode.status === 'connected') {
        setError(t('onboarding.pairing.alreadyPaired'));
        setIsLoading(false);
        return;
      }

      // Check if couple_id exists
      if (!existingCode.couple_id) {
        setError(t('onboarding.pairing.partnerNotReady'));
        setIsLoading(false);
        return;
      }

      // Get creator's user ID from the couple
      const { data: creatorCouple } = await db.couples.get(existingCode.couple_id);
      const creatorId = creatorCouple?.user1_id;

      // Use existing user ID if logged in via social login, otherwise generate new one
      const joinerId = currentUser?.id || generateUUID();
      const isExistingUser = !!currentUser?.id;

      // Check for disconnected couple within 30 days (reconnection scenario)
      if (isExistingUser && creatorId) {
        const { data: disconnectedCouple } = await db.couples.findDisconnectedCouple(joinerId, creatorId);

        if (disconnectedCouple) {
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
              anniversaryDate: restoredCouple.dating_start_date ? parseDateAsLocal(restoredCouple.dating_start_date) : new Date(),
              datingStartDate: restoredCouple.dating_start_date ? parseDateAsLocal(restoredCouple.dating_start_date) : undefined,
              weddingDate: restoredCouple.wedding_date ? parseDateAsLocal(restoredCouple.wedding_date) : undefined,
              anniversaryType: t('onboarding.anniversary.datingStart'),
              relationshipType: restoredCouple.wedding_date ? 'married' : 'dating',
              status: 'active',
              createdAt: restoredCouple.created_at ? new Date(restoredCouple.created_at) : new Date(),
            });

            // Fetch partner profile
            const partnerId = restoredCouple.user1_id === joinerId ? restoredCouple.user2_id : restoredCouple.user1_id;
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

            // Mark pairing code as used
            await db.pairingCodes.join(pairingCode, joinerId);

            // 30일 내 재연결: 온보딩 스킵하고 바로 홈으로
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
          }
        }
      }

      // Normal flow: new pairing (no reconnection)
      // Update pairing code status
      const { error: joinError } = await db.pairingCodes.join(pairingCode, joinerId);

      if (joinError) {
        setError(t('onboarding.pairing.connectionError'));
        setIsLoading(false);
        return;
      }

      // Create or update profile for joiner in DB
      const joinerInviteCode = currentUser?.inviteCode || generateUUID().slice(0, 8).toUpperCase();

      if (isExistingUser) {
        // Update existing profile's couple_id will be handled by joinCouple
        console.log('[PairingStep] Using existing user profile:', joinerId);
      } else {
        // Create new profile for anonymous joiner
        const { error: profileError } = await db.profiles.create({
          id: joinerId,
          nickname: '', // Will be updated in handleComplete
          invite_code: joinerInviteCode,
        });

        if (profileError) {
          console.error('Error creating joiner profile:', profileError);
        }
      }

      // Add joiner to couple as user2
      const { data: updatedCouple, error: coupleJoinError } = await db.couples.joinCouple(existingCode.couple_id, joinerId);

      if (coupleJoinError) {
        console.error('Error joining couple:', coupleJoinError);
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
          inviteCode: joinerInviteCode,
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
          anniversaryDate: updatedCouple.dating_start_date ? parseDateAsLocal(updatedCouple.dating_start_date) : new Date(),
          datingStartDate: updatedCouple.dating_start_date ? parseDateAsLocal(updatedCouple.dating_start_date) : undefined,
          anniversaryType: t('onboarding.anniversary.datingStart'),
          status: 'active',
          createdAt: updatedCouple.created_at ? new Date(updatedCouple.created_at) : new Date(),
        });

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
      }

      setIsPairingConnected(true);

      // Mark that joiner has proceeded (for creator to auto-follow)
      await db.pairingCodes.markJoinerProceeded(pairingCode);

      // Navigation will be handled by useEffect that detects paired couple
    } catch (err) {
      console.error('Join error:', err);
      setError(t('onboarding.pairing.connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle connect button press
  const handleConnect = () => {
    if (isCreatingCode) {
      if (isPairingConnected || isDemoMode) {
        onNext();
      }
    } else {
      handleJoin();
    }
  };

  // Validation
  const isValid = isCreatingCode
    ? (isPairingConnected || isDemoMode)
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
                <Text style={styles.codeTimer}>({timeRemaining})</Text>
              </View>
              <View style={styles.codeBoxRow}>
                <View style={styles.codeBoxSpacer} />
                <Text style={styles.codeText}>{generatedCode}</Text>
                <Pressable
                  style={styles.copyButton}
                  onPress={handleCopyCode}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Copy size={20} color="rgba(255,255,255,0.7)" />
                </Pressable>
              </View>
              {isPairingConnected ? (
                <Text style={[styles.codeHint, { color: '#4CAF50' }]}>
                  {t('onboarding.pairing.connected')}
                </Text>
              ) : (
                <Text style={styles.codeHint}>
                  {t('onboarding.pairing.waitingPartner')}
                </Text>
              )}
            </View>
          ) : (
            <View style={styles.codeInputArea}>
              <TextInput
                style={[styles.textInput, styles.codeInput]}
                value={pairingCode}
                onChangeText={(text) => {
                  setPairingCode(text.toUpperCase());
                  setError(null);
                }}
                autoCapitalize="characters"
                maxLength={6}
                editable={!isLoading}
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
        <Pressable
          style={[styles.secondaryButton, (isLoading || isPairingConnected) && styles.secondaryButtonDisabled]}
          onPress={onBack}
          disabled={isLoading || isPairingConnected}
        >
          <Text style={[styles.secondaryButtonText, (isLoading || isPairingConnected) && styles.secondaryButtonTextDisabled]}>{t('onboarding.previous')}</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.primaryButtonDisabled]}
          onPress={handleConnect}
          disabled={!isValid || isLoading}
        >
          <Text style={styles.primaryButtonText}>
            {isLoading ? t('onboarding.pairing.connecting') : (isCreatingCode && !isPairingConnected && !isDemoMode) ? t('onboarding.pairing.waitingConnection') : t('onboarding.pairing.connect')}
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
            <Calendar color={anniversaryDate ? COLORS.white : 'rgba(255, 255, 255, 0.4)'} size={20} />
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 300, width: '100%', paddingHorizontal: SPACING.xl }}>
        <View style={[styles.preferencesInfoBoxInline, { alignItems: 'center' }]}>
          <Text style={[styles.preferencesInfoText, { textAlign: 'center' }]}>
            {t('onboarding.preferencesIntro.hint')}
          </Text>
        </View>
      </View>

      {/* Bottom button */}
      <View style={{ width: '100%', paddingBottom: SPACING.lg, paddingHorizontal: SPACING.xl }}>
        <Pressable style={styles.primaryButton} onPress={onNext}>
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

      {/* Bottom button */}
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
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Bottom button */}
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
                  {option.label}
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
                {option.label}
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
          <Gift color={COLORS.white} size={48} />
        </View>

        <Text style={styles.celebrationTitle}>
          {t('onboarding.completeStep.title', { nickname })}
        </Text>

        <Text style={styles.celebrationDescription}>
          {t('onboarding.completeStep.subtitle')}
        </Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={onComplete}>
        <Text style={styles.primaryButtonText}>{t('onboarding.start')}</Text>
      </Pressable>
    </View>
  );
}

// ========== STYLES ==========

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
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
  },
  progressContainer: {
    position: 'absolute',
    top: 60,
    left: SPACING.lg,
    right: SPACING.lg,
    zIndex: 20,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: 90,
    paddingBottom: 40,
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
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xxxl + 40,
    height: 180,
  },
  nicknameCenterArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 200,
    paddingHorizontal: SPACING.md,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  welcomeCenteredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingBottom: 140,
  },
  welcomeIconWrapper: {
    marginTop: 0,
    marginBottom: SPACING.xxl,
  },
  topCenteredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: SPACING.sm,
    width: '100%',
  },
  fixedHeaderArea: {
    alignItems: 'center',
    width: '100%',
  },
  bottomButtonArea: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: SPACING.lg,
  },
  welcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: SPACING.lg,
  },
  welcomeContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xxl,
  },
  iconContainerSmall: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  welcomeTitle: {
    fontSize: 40,
    color: COLORS.white,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 48,
    marginBottom: SPACING.lg,
  },
  welcomeDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xxxl,
  },
  stepTitle: {
    fontSize: 28,
    color: COLORS.white,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: SPACING.md,
    minHeight: 72,
  },
  stepSubtitle: {
    fontSize: 18,
    color: COLORS.white,
    fontWeight: '600',
    textAlign: 'center',
  },
  fixedTitleContainer: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  stepDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  sectionLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '600',
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  inputContainer: {
    width: '100%',
    marginBottom: SPACING.lg,
  },
  textInput: {
    width: '100%',
    height: 56,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: SPACING.lg,
    fontSize: 16,
    color: COLORS.white,
  },
  codeInput: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 1,
  },
  codeInputHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  buttonFlex: {
    flex: 1,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 52,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.full,
  },
  primaryButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  primaryButtonText: {
    fontSize: 16,
    color: COLORS.black,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  buttonTextDisabled: {
    color: 'rgba(0, 0, 0, 0.4)',
  },
  secondaryButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
  },
  secondaryButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  secondaryButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  // Social Login Styles
  socialLoginContainer: {
    width: '100%',
    marginBottom: SPACING.lg,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  googleButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbdbdb',
  },
  kakaoButton: {
    backgroundColor: '#FEE500',
  },
  socialIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  kakaoIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
    borderRadius: 4,
  },
  googleButtonText: {
    fontSize: 15,
    color: '#757575',
    fontWeight: '500',
  },
  kakaoButtonText: {
    fontSize: 15,
    color: '#3C1E1E',
    fontWeight: '500',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dividerText: {
    paddingHorizontal: SPACING.md,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  skipButton: {
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  skipButtonText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  skipButtonTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    zIndex: 10,
  },
  skipButtonTopRightText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: SPACING.md,
  },
  toggleButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  toggleButtonSmall: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  toggleButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  toggleButtonText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: COLORS.black,
  },
  pairingContentArea: {
    width: '100%',
    minHeight: 160,
    marginBottom: SPACING.lg,
  },
  codeInputArea: {
    width: '100%',
  },
  codeDisplayContainer: {
    width: '100%',
    padding: SPACING.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
  },
  codeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  codeTimer: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '400',
  },
  codeBoxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  codeBoxSpacer: {
    width: 30,
  },
  codeText: {
    fontSize: 32,
    color: COLORS.white,
    fontWeight: '700',
    letterSpacing: 8,
  },
  copyButton: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
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
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
  },
  copyToastText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '500',
  },
  codeHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: SPACING.sm,
  },
  termsContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: SPACING.lg,
    overflow: 'hidden',
  },
  termsAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  termsAllText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
  },
  termsDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  termsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  termsCheckboxArea: {
    padding: SPACING.sm,
  },
  termsTextArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingLeft: SPACING.sm,
  },
  termsItemText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
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
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xxxl,
    height: 140,
  },
  termsContentArea: {
    flex: 1,
    width: '100%',
    paddingBottom: 7,
  },
  termsScrollView: {
    flex: 1,
    width: '100%',
  },
  termsScrollContent: {
    paddingBottom: SPACING.md,
  },
  termsItemWrapper: {
    width: '100%',
  },
  termsDescriptionBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: RADIUS.sm,
    padding: SPACING.md,
    marginLeft: SPACING.lg + 24 + SPACING.md,
    marginRight: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  termsDescriptionText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 18,
  },
  policyModalContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  policyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    position: 'relative',
  },
  policyModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  policyModalCloseButton: {
    position: 'absolute',
    right: SPACING.md,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webViewLoading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
    zIndex: 10,
  },
  webView: {
    flex: 1,
  },
  relationshipRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginBottom: SPACING.xl,
  },
  relationshipButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  relationshipButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  relationshipButtonText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '600',
  },
  relationshipButtonTextActive: {
    color: COLORS.black,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 56,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  datePickerText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  datePickerTextSelected: {
    color: COLORS.white,
  },
  datePickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  datePickerModalContent: {
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  datePickerCancel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  datePickerConfirm: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
  },
  datePicker: {
    height: 200,
    alignSelf: 'center',
    width: '100%',
  },
  preferencesInfoBox: {
    width: '100%',
    padding: SPACING.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: SPACING.xl,
  },
  preferencesInfoBoxBottom: {
    width: '100%',
    padding: SPACING.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: SPACING.lg,
    marginTop: SPACING.xxl,
    marginHorizontal: SPACING.xl,
    alignSelf: 'center',
  },
  preferencesInfoBoxMiddle: {
    position: 'absolute',
    top: '48%',
    left: SPACING.lg,
    right: SPACING.lg,
    padding: SPACING.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  preferencesInfoBoxInline: {
    width: '100%',
    padding: SPACING.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  preferencesInfoText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 22,
  },
  mbtiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    marginBottom: SPACING.xl,
  },
  mbtiButton: {
    width: (width - SPACING.lg * 2 - 30) / 4,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  mbtiButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  mbtiButtonText: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: '600',
  },
  mbtiButtonTextActive: {
    color: COLORS.black,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    marginBottom: SPACING.xl,
  },
  optionButton: {
    width: (width - SPACING.lg * 2 - 10) / 2,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  optionButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  optionButtonText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '500',
  },
  optionButtonTextActive: {
    color: COLORS.black,
  },
  styleButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  styleButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  styleButtonText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '600',
  },
  styleButtonTextActive: {
    color: COLORS.black,
  },
  activityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    marginBottom: SPACING.xl,
  },
  activityGrid3Col: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    paddingTop: SPACING.md,
  },
  activityButton: {
    width: (width - SPACING.lg * 2 - 10) / 2,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 6,
  },
  activityButtonSmall: {
    width: (width - SPACING.lg * 2 - 16) / 3,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 4,
  },
  activityButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  activityIcon: {
    fontSize: 24,
  },
  activityIconSmall: {
    fontSize: 20,
  },
  activityButtonText: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: '500',
  },
  activityButtonTextSmall: {
    fontSize: 11,
    color: COLORS.white,
    fontWeight: '500',
  },
  activityButtonTextActive: {
    color: COLORS.black,
  },
  dateWorryList: {
    width: '100%',
    maxHeight: 420,
  },
  dateWorryContent: {
    gap: 10,
    paddingBottom: SPACING.md,
  },
  dateWorryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  dateWorryButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  dateWorryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  dateWorryIcon: {
    fontSize: 20,
  },
  dateWorryButtonText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '500',
  },
  dateWorryButtonTextActive: {
    color: COLORS.black,
  },
  checkIconPlaceholder: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  constraintGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    marginBottom: SPACING.xl,
  },
  constraintButton: {
    width: (width - SPACING.lg * 2 - 10) / 2,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 6,
  },
  constraintButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  constraintIcon: {
    fontSize: 24,
  },
  constraintButtonText: {
    fontSize: 13,
    color: COLORS.white,
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
    paddingVertical: 16,
    paddingHorizontal: SPACING.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  constraintButtonVerticalActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  constraintButtonVerticalText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '500',
    flex: 1,
  },
  constraintButtonVerticalTextActive: {
    color: COLORS.black,
  },
  celebrationIconContainer: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xxl,
  },
  celebrationTitle: {
    fontSize: 36,
    color: COLORS.white,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  celebrationDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xxxl,
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
    fontSize: 32,
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginTop: SPACING.xl,
  },
  rewardBadgeText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Calendar Type Toggle
  calendarTypeToggle: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  calendarTypeButton: {
    flex: 1,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
  },
  calendarTypeButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  calendarTypeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
  },
  calendarTypeButtonTextActive: {
    color: COLORS.black,
  },
  // Basic Info styles
  basicInfoScrollView: {
    flex: 1,
    width: '100%',
  },
  basicInfoScrollContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  basicInfoSection: {
    marginBottom: SPACING.huge,
  },
  basicInfoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  basicInfoInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: 16,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    height: 50,
    letterSpacing: 0,
  },
  basicInfoDateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  birthDateRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  birthDateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    flex: 1,
  },
  calendarTypeButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  calendarTypeButtonSmall: {
    width: 56,
    height: 50,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  birthDateButtonFull: {
    width: '100%',
    height: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  anniversaryDateRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  anniversaryDateButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    flex: 1,
  },
  relationshipTypeButtons: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  relationshipTypeButtonSmall: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  basicInfoDateText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  basicInfoDateTextSelected: {
    color: COLORS.white,
  },
  calendarTypeRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  relationshipTypeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  relationshipTypeButton: {
    flex: 1,
    height: 50,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  relationshipTypeButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  relationshipTypeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  relationshipTypeButtonTextActive: {
    color: COLORS.black,
  },
  relationshipDropdownButton: {
    width: 70,
    height: 50,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  relationshipDropdownText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  relationshipDropdownMenu: {
    marginTop: SPACING.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  relationshipDropdownItem: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  relationshipDropdownItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  relationshipDropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.white,
    textAlign: 'center',
  },
  relationshipDropdownItemTextActive: {
    fontWeight: '700',
  },
});
