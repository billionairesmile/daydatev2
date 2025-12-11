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
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Heart,
  ChevronRight,
  Check,
  Calendar,
  Gift,
  Copy,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';

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
  type Gender,
} from '@/stores/onboardingStore';
import { useBackground } from '@/contexts';
import { db, isDemoMode, supabase } from '@/lib/supabase';

const { width, height } = Dimensions.get('window');

// UUID v4 generator function
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Step configuration for progress bar
const STEP_A = ['terms', 'pairing', 'basic_info', 'couple_info'];
const STEP_B = ['mbti', 'activity_type', 'date_worries', 'constraints'];

export default function OnboardingScreen() {
  const router = useRouter();
  const { backgroundImage } = useBackground();
  const { setIsOnboardingComplete, updateNickname, setCouple, setUser, setPartner } = useAuthStore();
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

          // Upsert profile with birth date and preferences
          await db.profiles.upsert({
            id: currentUser.id,
            nickname: data.nickname,
            birth_date: data.birthDate ? data.birthDate.toISOString().split('T')[0] : undefined,
            preferences,
          });

          // Update couple with anniversary date (couple was already created in pairing step)
          if (data.anniversaryDate && currentCouple?.id) {
            await db.couples.update(currentCouple.id, {
              dating_start_date: data.anniversaryDate.toISOString().split('T')[0],
              wedding_date: data.relationshipType === 'married' ? data.anniversaryDate.toISOString().split('T')[0] : undefined,
            });

            // Update couple in authStore with anniversary
            setCouple({
              ...currentCouple,
              anniversaryDate: data.anniversaryDate,
              datingStartDate: data.anniversaryDate,
              weddingDate: data.relationshipType === 'married' ? data.anniversaryDate : undefined,
            });
          }
        }
      } catch (error) {
        console.error('Error saving onboarding data to Supabase:', error);
        Alert.alert(
          '저장 오류',
          '온보딩 정보를 저장하는 중 문제가 발생했습니다. 나중에 프로필에서 수정할 수 있습니다.',
          [{ text: '확인' }]
        );
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
  }, [data.nickname, data.birthDate, data.anniversaryDate, data.relationshipType, updateNickname, setIsOnboardingComplete, router, setUser, setCouple]);

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
            <WelcomeStep onNext={() => animateTransition(() => setStep('terms'))} />
          )}
          {currentStep === 'terms' && (
            <TermsStep
              onNext={handleNext}
              onBack={() => animateTransition(() => setStep('welcome'))}
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
              onNext={handleNext}
              onBack={handleBack}
            />
          )}
          {currentStep === 'basic_info' && (
            <BasicInfoStep
              nickname={data.nickname}
              setNickname={(name) => updateData({ nickname: name })}
              gender={data.gender}
              setGender={(gender) => updateData({ gender })}
              birthDate={data.birthDate}
              setBirthDate={(date) => updateData({ birthDate: date })}
              calendarType={data.birthDateCalendarType}
              setCalendarType={(type) => updateData({ birthDateCalendarType: type })}
              onNext={() => {
                // Creator (isCreatingCode): Skip couple_info, go directly to preferences_intro
                // Joiner (!isCreatingCode): Go to couple_info to enter anniversary date
                if (data.isCreatingCode) {
                  animateTransition(() => setStep('preferences_intro'));
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
              onNext={handleNext}
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
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.centeredStepContainer}>
      <View style={styles.welcomeCenteredContent}>
        <View style={styles.welcomeIconWrapper}>
          <View style={styles.iconContainer}>
            <Heart color={COLORS.white} size={48} fill={COLORS.white} />
          </View>
        </View>

        <Text style={styles.welcomeTitle}>
          Daydate에{'\n'}오신 것을 환영해요
        </Text>

        <Text style={styles.welcomeDescription}>
          두 사람의 특별한 순간들을{'\n'}함께 기록하고 공유해보세요
        </Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={onNext}>
        <Text style={styles.primaryButtonText}>시작하기</Text>
      </Pressable>
    </View>
  );
}

// Basic Info Step - Nickname, gender, and birthdate only
function BasicInfoStep({
  nickname,
  setNickname,
  gender,
  setGender,
  birthDate,
  setBirthDate,
  calendarType,
  setCalendarType,
  onNext,
  onBack,
}: {
  nickname: string;
  setNickname: (name: string) => void;
  gender: Gender | null;
  setGender: (gender: Gender) => void;
  birthDate: Date | null;
  setBirthDate: (date: Date | null) => void;
  calendarType: CalendarType;
  setCalendarType: (type: CalendarType) => void;
  onNext: () => void;
  onBack: () => void;
}) {
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

  const isValid = nickname.trim().length >= 1 && gender !== null && birthDate !== null;

  return (
    <View style={styles.centeredStepContainer}>
      {/* Title fixed at top */}
      <View style={styles.nicknameTitleContainer}>
        <Text style={styles.stepTitle}>기본 정보를{'\n'}입력해주세요</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.basicInfoScrollView}
        contentContainerStyle={styles.basicInfoScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Nickname */}
        <View style={styles.basicInfoSection}>
          <Text style={styles.basicInfoLabel}>닉네임</Text>
          <TextInput
            style={styles.basicInfoInput}
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            placeholder="닉네임 입력"
            value={nickname}
            onChangeText={setNickname}
            autoCapitalize="none"
            maxLength={10}
          />
        </View>

        {/* Gender */}
        <View style={styles.basicInfoSection}>
          <Text style={styles.basicInfoLabel}>성별</Text>
          <View style={styles.genderButtons}>
            <Pressable
              style={[styles.genderButton, gender === 'male' && styles.genderButtonActive]}
              onPress={() => setGender('male')}
            >
              <Text style={[styles.genderButtonText, gender === 'male' && styles.genderButtonTextActive]}>남</Text>
            </Pressable>
            <Pressable
              style={[styles.genderButton, gender === 'female' && styles.genderButtonActive]}
              onPress={() => setGender('female')}
            >
              <Text style={[styles.genderButtonText, gender === 'female' && styles.genderButtonTextActive]}>여</Text>
            </Pressable>
          </View>
        </View>

        {/* Birth Date */}
        <View style={styles.basicInfoSection}>
          <Text style={styles.basicInfoLabel}>생년월일</Text>
          <View style={styles.birthDateRow}>
            {/* Date picker button */}
            <Pressable
              style={styles.birthDateButton}
              onPress={() => setShowBirthDatePicker(true)}
            >
              <Text style={[styles.basicInfoDateText, birthDate && styles.basicInfoDateTextSelected]}>
                {birthDate ? formatDate(birthDate) : '생년월일 선택'}
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
                  양력
                </Text>
              </Pressable>
              <Pressable
                style={[styles.calendarTypeButtonSmall, calendarType === 'lunar' && styles.calendarTypeButtonActive]}
                onPress={() => setCalendarType('lunar')}
              >
                <Text style={[styles.calendarTypeButtonText, calendarType === 'lunar' && styles.calendarTypeButtonTextActive]}>
                  음력
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
                  <Text style={styles.datePickerCancel}>취소</Text>
                </Pressable>
                <Pressable onPress={handleConfirmBirthDate}>
                  <Text style={styles.datePickerConfirm}>확인</Text>
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
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>이전</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.primaryButtonDisabled]}
          onPress={onNext}
          disabled={!isValid}
        >
          <Text style={styles.primaryButtonText}>다음</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Terms Step
function TermsStep({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [serviceTerms, setServiceTerms] = useState(false);
  const [privacyTerms, setPrivacyTerms] = useState(false);

  const allAgreed = serviceTerms && privacyTerms;

  const handleAgreeAll = () => {
    const newValue = !allAgreed;
    setServiceTerms(newValue);
    setPrivacyTerms(newValue);
  };

  return (
    <View style={styles.centeredStepContainer}>
      {/* Title fixed at top */}
      <View style={styles.nicknameTitleContainer}>
        <Text style={[styles.stepTitle, { minHeight: 36 }]}>이용약관 동의</Text>
        <Text style={styles.stepDescription}>
          서비스 이용을 위해 약관에 동의해주세요
        </Text>
      </View>

      {/* Content centered in remaining space */}
      <View style={styles.nicknameCenterArea}>
        <View style={styles.termsContainer}>
          <Pressable style={styles.termsAllButton} onPress={handleAgreeAll}>
            <View style={[styles.checkbox, allAgreed && styles.checkboxChecked]}>
              {allAgreed && <Check color={COLORS.black} size={16} />}
            </View>
            <Text style={styles.termsAllText}>전체 동의</Text>
          </Pressable>

          <View style={styles.termsDivider} />

          <View style={styles.termsItem}>
            <Pressable
              style={styles.termsCheckboxArea}
              onPress={() => setServiceTerms(!serviceTerms)}
            >
              <View style={[styles.checkbox, serviceTerms && styles.checkboxChecked]}>
                {serviceTerms && <Check color={COLORS.black} size={16} />}
              </View>
            </Pressable>
            <Pressable style={styles.termsTextArea} onPress={() => { }}>
              <Text style={styles.termsItemText}>[필수] 서비스 이용약관</Text>
              <ChevronRight color="rgba(255,255,255,0.4)" size={20} />
            </Pressable>
          </View>

          <View style={styles.termsItem}>
            <Pressable
              style={styles.termsCheckboxArea}
              onPress={() => setPrivacyTerms(!privacyTerms)}
            >
              <View style={[styles.checkbox, privacyTerms && styles.checkboxChecked]}>
                {privacyTerms && <Check color={COLORS.black} size={16} />}
              </View>
            </Pressable>
            <Pressable style={styles.termsTextArea} onPress={() => { }}>
              <Text style={styles.termsItemText}>[필수] 개인정보처리방침</Text>
              <ChevronRight color="rgba(255,255,255,0.4)" size={20} />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Buttons fixed at bottom */}
      <View style={styles.buttonRow}>
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryButtonText}>이전</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, styles.buttonFlex, !allAgreed && styles.primaryButtonDisabled]}
          onPress={onNext}
          disabled={!allAgreed}
        >
          <Text style={styles.primaryButtonText}>다음</Text>
        </Pressable>
      </View>
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
  onNext: () => void;
  onBack: () => void;
}) {
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
          const tempUserId = generateUUID();

          // Save code to DB
          const { data: createdCode, error: createError } = await db.pairingCodes.create(codeToUse, tempUserId);
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

          // Create profile for creator in DB
          const { error: profileError } = await db.profiles.create({
            id: tempUserId,
            nickname: '', // Will be updated in handleComplete
            invite_code: codeToUse,
          });

          if (profileError) {
            console.error('Error creating profile:', profileError);
          }

          // Create couple for this user (creator is user1)
          const { data: newCouple, error: coupleError } = await db.couples.create({
            user1_id: tempUserId,
          });

          if (coupleError) {
            console.error('Error creating couple:', coupleError);
          } else if (newCouple) {
            // Link couple_id to pairing code
            await db.pairingCodes.setCoupleId(codeToUse, newCouple.id);

            // Set couple in authStore
            setCouple({
              id: newCouple.id,
              user1Id: tempUserId,
              anniversaryDate: new Date(),
              anniversaryType: '연애 시작일',
              status: 'pending',
              createdAt: new Date(),
            });

            // Set user in authStore
            setUser({
              id: tempUserId,
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

          setIsCodeSaved(true);

          // Set expiration time (24 hours from now)
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);
          setCodeExpiresAt(expiresAt);

          // Subscribe to changes (realtime)
          channelRef.current = db.pairingCodes.subscribeToCode(codeToUse, (payload) => {
            if (payload.status === 'connected') {
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
        anniversaryType: '연애 시작일',
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
  }, [isCreatingCode, generatedCode, isCodeSaved, setIsPairingConnected, setGeneratedCode, codeExpiresAt, setCouple, setUser]);

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
        anniversaryType: '연애 시작일',
        status: 'active',
        createdAt: new Date(),
      });
      setIsPairingConnected(true);
      onNext();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get pairing code with couple_id
      const { data: existingCode, error: findError } = await db.pairingCodes.getWithCouple(pairingCode);

      if (findError || !existingCode) {
        setError('유효하지 않은 코드입니다. 코드를 확인해주세요.');
        setIsLoading(false);
        return;
      }

      // Check if code already used
      if (existingCode.status === 'connected') {
        setError('이미 사용된 코드입니다.');
        setIsLoading(false);
        return;
      }

      // Check if couple_id exists
      if (!existingCode.couple_id) {
        setError('파트너가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
        setIsLoading(false);
        return;
      }

      const joinerId = generateUUID();

      // Update pairing code status
      const { error: joinError } = await db.pairingCodes.join(pairingCode, joinerId);

      if (joinError) {
        setError('연결 중 오류가 발생했습니다. 다시 시도해주세요.');
        setIsLoading(false);
        return;
      }

      // Create profile for joiner in DB
      const { error: profileError } = await db.profiles.create({
        id: joinerId,
        nickname: '', // Will be updated in handleComplete
        invite_code: '',
      });

      if (profileError) {
        console.error('Error creating joiner profile:', profileError);
      }

      // Add joiner to couple as user2
      const { data: updatedCouple, error: coupleJoinError } = await db.couples.joinCouple(existingCode.couple_id, joinerId);

      if (coupleJoinError) {
        console.error('Error joining couple:', coupleJoinError);
        setError('커플 연결 중 오류가 발생했습니다.');
        setIsLoading(false);
        return;
      }

      // Set user in authStore
      setUser({
        id: joinerId,
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

      // Set couple in authStore
      if (updatedCouple) {
        setCouple({
          id: updatedCouple.id,
          user1Id: updatedCouple.user1_id,
          user2Id: joinerId,
          anniversaryDate: updatedCouple.dating_start_date ? new Date(updatedCouple.dating_start_date) : new Date(),
          anniversaryType: '연애 시작일',
          status: 'active',
          createdAt: updatedCouple.created_at ? new Date(updatedCouple.created_at) : new Date(),
        });

        // Set partner info (creator's info)
        setPartner({
          id: updatedCouple.user1_id,
          email: '',
          nickname: '',
          inviteCode: pairingCode,
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

      setIsPairingConnected(true);
      onNext();
    } catch (err) {
      console.error('Join error:', err);
      setError('연결 중 오류가 발생했습니다.');
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
    <View style={styles.centeredStepContainer}>
      {/* Title fixed at top */}
      <View style={styles.nicknameTitleContainer}>
        <Text style={styles.stepTitle}>파트너와{'\n'}연결해주세요</Text>
        <Text style={styles.stepDescription}>
          페어링 코드로 파트너와 데이터를 공유해요
        </Text>
      </View>

      {/* Content centered in remaining space */}
      <View style={[styles.nicknameCenterArea, { paddingTop: 60 }]}>
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
              코드 생성
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
              코드 입력
            </Text>
          </Pressable>
        </View>

        {/* Dynamic content with fixed height */}
        <View style={styles.pairingContentArea}>
          {isCreatingCode ? (
            <View style={styles.codeDisplayContainer}>
              <View style={styles.codeLabelRow}>
                <Text style={styles.codeLabel}>파트너에게 공유할 코드</Text>
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
                  파트너와 연결되었습니다!{'\n'}다음으로 진행하세요
                </Text>
              ) : (
                <Text style={styles.codeHint}>
                  파트너가 이 코드를 입력하면{'\n'}자동으로 연결됩니다
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
              <Text style={styles.codeInputHint}>파트너가 생성한 코드를 입력하세요</Text>
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
        <Pressable style={styles.secondaryButton} onPress={onBack} disabled={isLoading}>
          <Text style={styles.secondaryButtonText}>이전</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.primaryButtonDisabled]}
          onPress={handleConnect}
          disabled={!isValid || isLoading}
        >
          <Text style={styles.primaryButtonText}>
            {isLoading ? '연결 중...' : (isCreatingCode && !isPairingConnected && !isDemoMode) ? '연결 대기중' : '연결'}
          </Text>
        </Pressable>
      </View>

      {/* Copy Toast */}
      {copied && (
        <View style={styles.copyToastOverlay}>
          <View style={styles.copyToastBox}>
            <Text style={styles.copyToastText}>복사되었습니다</Text>
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
      case 'dating': return '사귄 날';
      case 'married': return '결혼 기념일';
      default: return '사귄 날';
    }
  };

  const isValid = anniversaryDate !== null;

  return (
    <View style={styles.centeredStepContainer}>
      {/* Title fixed at top */}
      <View style={styles.nicknameTitleContainer}>
        <Text style={styles.stepTitle}>커플 정보를{'\n'}입력해주세요</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.basicInfoScrollView}
        contentContainerStyle={styles.basicInfoScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Relationship Type Selection */}
        <View style={styles.basicInfoSection}>
          <Text style={styles.basicInfoLabel}>관계</Text>
          <View style={styles.relationshipTypeRow}>
            <Pressable
              style={[styles.relationshipTypeButton, relationshipType === 'dating' && styles.relationshipTypeButtonActive]}
              onPress={() => setRelationshipType('dating')}
            >
              <Text style={[styles.relationshipTypeButtonText, relationshipType === 'dating' && styles.relationshipTypeButtonTextActive]}>
                연애
              </Text>
            </Pressable>
            <Pressable
              style={[styles.relationshipTypeButton, relationshipType === 'married' && styles.relationshipTypeButtonActive]}
              onPress={() => setRelationshipType('married')}
            >
              <Text style={[styles.relationshipTypeButtonText, relationshipType === 'married' && styles.relationshipTypeButtonTextActive]}>
                결혼
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
              {anniversaryDate ? formatDate(anniversaryDate) : `${getAnniversaryLabel()} 선택`}
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
                  <Text style={styles.datePickerCancel}>취소</Text>
                </Pressable>
                <Pressable onPress={handleConfirmAnniversaryDate}>
                  <Text style={styles.datePickerConfirm}>확인</Text>
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
          <Text style={styles.secondaryButtonText}>이전</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.primaryButtonDisabled]}
          onPress={onNext}
          disabled={!isValid}
        >
          <Text style={styles.primaryButtonText}>다음</Text>
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
  return (
    <View style={styles.centeredStepContainer}>
      {/* Title fixed at top */}
      <View style={[styles.nicknameTitleContainer, { paddingTop: SPACING.xxxl + 60 }]}>
        <Text style={styles.stepTitle}>
          맞춤형 미션을 위해{'\n'}취향을 알려주세요
        </Text>
        <Text style={styles.stepDescription}>
          두 분의 취향을 분석해서{'\n'}적절한 데이트 미션을 추천해드릴게요
        </Text>
      </View>

      {/* Centered content */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 300, width: '100%', paddingHorizontal: SPACING.xl }}>
        <View style={[styles.preferencesInfoBoxInline, { alignItems: 'center' }]}>
          <Text style={[styles.preferencesInfoText, { textAlign: 'center' }]}>
            약 1분 정도 소요되며,{'\n'}
            '더보기 {'>'} 내 프로필'에서{'\n'}
            언제든 수정할 수 있어요
          </Text>
        </View>
      </View>

      {/* Bottom button */}
      <View style={{ width: '100%', paddingBottom: SPACING.lg, paddingHorizontal: SPACING.xl }}>
        <Pressable style={styles.primaryButton} onPress={onNext}>
          <Text style={styles.primaryButtonText}>취향 분석 시작</Text>
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
  return (
    <View style={styles.centeredStepContainer}>
      {/* Title at top */}
      <View style={{ width: '100%', paddingHorizontal: SPACING.xl, paddingTop: SPACING.xxxl + 40, alignItems: 'center' }}>
        <Text style={styles.stepTitle}>MBTI를{'\n'}선택해주세요</Text>
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
            <Text style={styles.secondaryButtonText}>이전</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, styles.buttonFlex, !mbti && styles.buttonDisabled]}
            onPress={mbti ? onNext : undefined}
            disabled={!mbti}
          >
            <Text style={[styles.primaryButtonText, !mbti && styles.buttonTextDisabled]}>다음</Text>
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
        <Text style={styles.stepTitle}>선호하는 활동을{'\n'}선택해주세요</Text>
        <Text style={styles.stepDescription}>
          여러 개 선택할 수 있어요
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
            <Text style={styles.secondaryButtonText}>이전</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.buttonDisabled]}
            onPress={isValid ? onNext : undefined}
            disabled={!isValid}
          >
            <Text style={[styles.primaryButtonText, !isValid && styles.buttonTextDisabled]}>다음</Text>
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
          데이트할 때{'\n'}어떤 게 고민이에요?
        </Text>
        <Text style={styles.stepDescription}>
          여러 개 선택할 수 있어요
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
            <Text style={styles.secondaryButtonText}>이전</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.buttonDisabled]}
            onPress={isValid ? onNext : undefined}
            disabled={!isValid}
          >
            <Text style={[styles.primaryButtonText, !isValid && styles.buttonTextDisabled]}>다음</Text>
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
        <Text style={styles.stepTitle}>미션을 줄 때{'\n'}참고할 사항은?</Text>
        <Text style={styles.stepDescription}>
          해당하는 것을 모두 선택해주세요
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
            <Text style={styles.secondaryButtonText}>이전</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, styles.buttonFlex, !isValid && styles.buttonDisabled]}
            onPress={isValid ? onNext : undefined}
            disabled={!isValid}
          >
            <Text style={[styles.primaryButtonText, !isValid && styles.buttonTextDisabled]}>완료</Text>
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
  return (
    <View style={styles.centeredStepContainer}>
      <View style={styles.centeredContent}>
        <View style={styles.celebrationIconContainer}>
          <Gift color={COLORS.white} size={48} />
        </View>

        <Text style={styles.celebrationTitle}>
          {nickname}님, 환영해요!
        </Text>

        <Text style={styles.celebrationDescription}>
          모든 설정이 완료되었어요{'\n'}
          특별한 순간들을 함께 만들어가요!
        </Text>
      </View>

      <Pressable style={styles.primaryButton} onPress={onComplete}>
        <Text style={styles.primaryButtonText}>시작하기</Text>
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
    paddingVertical: 16,
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
  nicknameGenderRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
  },
  nicknameInputWrapper: {
    flex: 1,
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
  genderButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  genderButton: {
    flex: 1,
    height: 50,
    borderRadius: RADIUS.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  genderButtonActive: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  genderButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  genderButtonTextActive: {
    color: COLORS.black,
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
