import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, Camera, Sparkles, ChevronRight, ChevronLeft, Check } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { useAuthStore } from '@/stores';

const { width, height } = Dimensions.get('window');

const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800';

// Onboarding slides
const SLIDES = [
  {
    id: 'welcome',
    icon: Heart,
    title: '매일 새로운 데이트',
    description: '특별한 미션과 함께\n잊지 못할 순간을 만들어요',
  },
  {
    id: 'mission',
    icon: Sparkles,
    title: 'AI 맞춤 미션',
    description: '두 사람의 취향을 분석해\n딱 맞는 데이트를 추천해요',
  },
  {
    id: 'memory',
    icon: Camera,
    title: '추억 기록하기',
    description: '완료한 미션을 사진으로 남기고\n소중한 순간을 간직해요',
  },
];

// Personality questions for AI matching
const QUESTIONS = [
  {
    id: 1,
    question: '주말에 주로 어떤 활동을 선호하시나요?',
    options: ['집에서 휴식', '야외 활동', '문화생활', '맛집 탐방'],
  },
  {
    id: 2,
    question: '데이트할 때 선호하는 분위기는?',
    options: ['조용하고 아늑한', '활기차고 신나는', '로맨틱한', '캐주얼한'],
  },
  {
    id: 3,
    question: '새로운 것을 시도하는 것에 대해 어떻게 생각하시나요?',
    options: ['매우 좋아함', '가끔 좋아함', '익숙한 것 선호', '상황에 따라'],
  },
];

type OnboardingStep = 'slides' | 'profile' | 'pairing' | 'questions' | 'celebration';

export default function OnboardingScreen() {
  const router = useRouter();
  const { setIsOnboardingComplete } = useAuthStore();

  const [step, setStep] = useState<OnboardingStep>('slides');
  const [slideIndex, setSlideIndex] = useState(0);
  const [nickname, setNickname] = useState('');
  const [pairingMode, setPairingMode] = useState<'create' | 'join' | null>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;

  // Celebration animation
  useEffect(() => {
    if (step === 'celebration') {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [step]);

  const handleSlideNext = () => {
    if (slideIndex < SLIDES.length - 1) {
      animateTransition(() => setSlideIndex(slideIndex + 1));
    } else {
      animateTransition(() => setStep('profile'));
    }
  };

  const handleProfileNext = () => {
    if (nickname.trim()) {
      animateTransition(() => setStep('pairing'));
    }
  };

  const handlePairingNext = () => {
    animateTransition(() => setStep('questions'));
  };

  const handleQuestionAnswer = (answer: string) => {
    setAnswers({ ...answers, [currentQuestion]: answer });

    if (currentQuestion < QUESTIONS.length - 1) {
      animateTransition(() => setCurrentQuestion(currentQuestion + 1));
    } else {
      animateTransition(() => setStep('celebration'));
    }
  };

  const handleComplete = () => {
    setIsOnboardingComplete(true);
    router.replace('/(tabs)');
  };

  const animateTransition = (callback: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      callback();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  };

  const getProgress = () => {
    switch (step) {
      case 'slides': return (slideIndex + 1) / (SLIDES.length + 4);
      case 'profile': return (SLIDES.length + 1) / (SLIDES.length + 4);
      case 'pairing': return (SLIDES.length + 2) / (SLIDES.length + 4);
      case 'questions': return (SLIDES.length + 2 + (currentQuestion + 1) / QUESTIONS.length) / (SLIDES.length + 4);
      case 'celebration': return 1;
      default: return 0;
    }
  };

  const renderSlides = () => {
    const slide = SLIDES[slideIndex];
    const IconComponent = slide.icon;

    return (
      <Animated.View style={[styles.slideContent, { opacity: fadeAnim }]}>
        <View style={styles.iconContainer}>
          <IconComponent color={COLORS.white} size={48} strokeWidth={1.5} />
        </View>

        <Text style={styles.slideTitle}>{slide.title}</Text>
        <Text style={styles.slideDescription}>{slide.description}</Text>

        <View style={styles.dotsContainer}>
          {SLIDES.map((_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                index === slideIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <Pressable style={styles.primaryButton} onPress={handleSlideNext}>
          <Text style={styles.primaryButtonText}>
            {slideIndex === SLIDES.length - 1 ? '시작하기' : '다음'}
          </Text>
          <ChevronRight color={COLORS.black} size={20} />
        </Pressable>
      </Animated.View>
    );
  };

  const renderProfile = () => (
    <Animated.View style={[styles.stepContent, { opacity: fadeAnim }]}>
      <Text style={styles.stepTitle}>프로필 설정</Text>
      <Text style={styles.stepDescription}>
        상대방에게 보여질 닉네임을 입력해주세요
      </Text>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="닉네임"
          placeholderTextColor="rgba(255, 255, 255, 0.4)"
          value={nickname}
          onChangeText={setNickname}
          autoCapitalize="none"
        />
      </View>

      <Pressable
        style={[
          styles.primaryButton,
          !nickname.trim() && styles.primaryButtonDisabled,
        ]}
        onPress={handleProfileNext}
        disabled={!nickname.trim()}
      >
        <Text style={styles.primaryButtonText}>다음</Text>
        <ChevronRight color={COLORS.black} size={20} />
      </Pressable>
    </Animated.View>
  );

  const renderPairing = () => (
    <Animated.View style={[styles.stepContent, { opacity: fadeAnim }]}>
      <Text style={styles.stepTitle}>파트너 연결</Text>
      <Text style={styles.stepDescription}>
        상대방과 연결하는 방법을 선택해주세요
      </Text>

      {!pairingMode ? (
        <View style={styles.pairingOptions}>
          <Pressable
            style={styles.pairingOption}
            onPress={() => setPairingMode('create')}
          >
            <Text style={styles.pairingOptionTitle}>초대 코드 생성</Text>
            <Text style={styles.pairingOptionDescription}>
              새로운 커플 코드를 생성하고{'\n'}상대방에게 공유하세요
            </Text>
          </Pressable>

          <Pressable
            style={styles.pairingOption}
            onPress={() => setPairingMode('join')}
          >
            <Text style={styles.pairingOptionTitle}>초대 코드 입력</Text>
            <Text style={styles.pairingOptionDescription}>
              상대방에게 받은{'\n'}초대 코드를 입력하세요
            </Text>
          </Pressable>
        </View>
      ) : pairingMode === 'create' ? (
        <View style={styles.pairingContent}>
          <View style={styles.codeDisplay}>
            <Text style={styles.codeText}>ABC123</Text>
          </View>
          <Text style={styles.codeHint}>
            이 코드를 상대방에게 공유하세요
          </Text>
          <Pressable style={styles.primaryButton} onPress={handlePairingNext}>
            <Text style={styles.primaryButtonText}>연결 완료</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.pairingContent}>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="초대 코드 입력"
              placeholderTextColor="rgba(255, 255, 255, 0.4)"
              value={pairingCode}
              onChangeText={setPairingCode}
              autoCapitalize="characters"
            />
          </View>
          <Pressable
            style={[
              styles.primaryButton,
              !pairingCode.trim() && styles.primaryButtonDisabled,
            ]}
            onPress={handlePairingNext}
            disabled={!pairingCode.trim()}
          >
            <Text style={styles.primaryButtonText}>연결하기</Text>
          </Pressable>
        </View>
      )}

      {pairingMode && (
        <Pressable
          style={styles.backButton}
          onPress={() => setPairingMode(null)}
        >
          <ChevronLeft color={COLORS.white} size={20} />
          <Text style={styles.backButtonText}>다른 방법 선택</Text>
        </Pressable>
      )}
    </Animated.View>
  );

  const renderQuestions = () => {
    const question = QUESTIONS[currentQuestion];

    return (
      <Animated.View style={[styles.stepContent, { opacity: fadeAnim }]}>
        <Text style={styles.questionCounter}>
          {currentQuestion + 1} / {QUESTIONS.length}
        </Text>
        <Text style={styles.questionTitle}>{question.question}</Text>

        <View style={styles.optionsContainer}>
          {question.options.map((option, index) => (
            <Pressable
              key={index}
              style={[
                styles.optionButton,
                answers[currentQuestion] === option && styles.optionButtonSelected,
              ]}
              onPress={() => handleQuestionAnswer(option)}
            >
              <Text
                style={[
                  styles.optionText,
                  answers[currentQuestion] === option && styles.optionTextSelected,
                ]}
              >
                {option}
              </Text>
              {answers[currentQuestion] === option && (
                <Check color={COLORS.black} size={20} />
              )}
            </Pressable>
          ))}
        </View>
      </Animated.View>
    );
  };

  const renderCelebration = () => (
    <Animated.View
      style={[
        styles.celebrationContent,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <View style={styles.celebrationIconContainer}>
        <Heart color={COLORS.white} size={64} fill={COLORS.white} strokeWidth={0} />
      </View>

      <Text style={styles.celebrationTitle}>연결 완료!</Text>
      <Text style={styles.celebrationDescription}>
        이제 매일 새로운 미션과 함께{'\n'}특별한 순간을 만들어보세요
      </Text>

      <Pressable style={styles.primaryButton} onPress={handleComplete}>
        <Text style={styles.primaryButtonText}>시작하기</Text>
        <ChevronRight color={COLORS.black} size={20} />
      </Pressable>
    </Animated.View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Background */}
      <ImageBackground
        source={{ uri: BACKGROUND_IMAGE }}
        style={styles.backgroundImage}
        blurRadius={20}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.6)']}
          style={styles.overlay}
        />
      </ImageBackground>

      {/* Progress Bar */}
      {step !== 'celebration' && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: `${getProgress() * 100}%` },
              ]}
            />
          </View>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {step === 'slides' && renderSlides()}
        {step === 'profile' && renderProfile()}
        {step === 'pairing' && renderPairing()}
        {step === 'questions' && renderQuestions()}
        {step === 'celebration' && renderCelebration()}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  backgroundImage: {
    position: 'absolute',
    width: width,
    height: height,
  },
  overlay: {
    flex: 1,
  },
  progressContainer: {
    position: 'absolute',
    top: 60,
    left: SPACING.lg,
    right: SPACING.lg,
    zIndex: 10,
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
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  slideContent: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  slideTitle: {
    fontSize: 32,
    color: COLORS.white,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  slideDescription: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: SPACING.xxl,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: SPACING.xxl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  dotActive: {
    width: 24,
    backgroundColor: COLORS.white,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    gap: 8,
  },
  primaryButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  primaryButtonText: {
    fontSize: 17,
    color: COLORS.black,
    fontWeight: '600',
  },
  stepContent: {
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 28,
    color: COLORS.white,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  stepDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  inputContainer: {
    width: '100%',
    marginBottom: SPACING.lg,
  },
  textInput: {
    width: '100%',
    height: 56,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: SPACING.lg,
    fontSize: 17,
    color: COLORS.white,
  },
  pairingOptions: {
    width: '100%',
    gap: 12,
    marginBottom: SPACING.lg,
  },
  pairingOption: {
    width: '100%',
    padding: SPACING.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  pairingOptionTitle: {
    fontSize: 18,
    color: COLORS.white,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  pairingOptionDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 20,
  },
  pairingContent: {
    width: '100%',
    alignItems: 'center',
  },
  codeDisplay: {
    width: '100%',
    paddingVertical: SPACING.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  codeText: {
    fontSize: 36,
    color: COLORS.white,
    fontWeight: '700',
    letterSpacing: 8,
  },
  codeHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: SPACING.xl,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    gap: 4,
  },
  backButtonText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  questionCounter: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: SPACING.sm,
  },
  questionTitle: {
    fontSize: 24,
    color: COLORS.white,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 32,
  },
  optionsContainer: {
    width: '100%',
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: SPACING.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  optionButtonSelected: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.white,
  },
  optionText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '500',
  },
  optionTextSelected: {
    color: COLORS.black,
  },
  celebrationContent: {
    alignItems: 'center',
  },
  celebrationIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 182, 193, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xxl,
  },
  celebrationTitle: {
    fontSize: 36,
    color: COLORS.white,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  celebrationDescription: {
    fontSize: 17,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: SPACING.xxl,
  },
});
