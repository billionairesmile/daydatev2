import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, Mail, Lock, Eye, EyeOff, User, ArrowLeft } from 'lucide-react-native';
import { useRouter, Link } from 'expo-router';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY, IS_TABLET, scale, scaleFont } from '@/constants/design';
import { GlassCard, GlassButton, GlassInput } from '@/components/glass';
import { useAuthStore } from '@/stores';
import { supabase, isDemoMode } from '@/lib/supabase';

const { width, height } = Dimensions.get('window');
const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800';

export default function SignupScreen() {
  const router = useRouter();
  const { setUser, setIsAuthenticated } = useAuthStore();

  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!nickname || !email || !password || !confirmPassword) {
      Alert.alert('알림', '모든 항목을 입력해주세요.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('알림', '비밀번호가 일치하지 않습니다.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('알림', '비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    // 데모 모드에서는 바로 로그인 화면으로 이동
    if (isDemoMode || !supabase) {
      Alert.alert(
        '데모 모드',
        'Supabase가 설정되지 않았습니다. 체험 모드를 이용해주세요.',
        [{ text: '확인', onPress: () => router.replace('/(auth)/onboarding') }]
      );
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nickname,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // Create user profile
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          email,
          nickname,
        });

        if (profileError) throw profileError;

        Alert.alert(
          '회원가입 완료',
          '이메일을 확인하여 계정을 인증해주세요.',
          [{ text: '확인', onPress: () => router.replace('/(auth)/onboarding') }]
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '다시 시도해주세요.';
      Alert.alert('회원가입 실패', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={{ uri: BACKGROUND_IMAGE }}
        style={styles.backgroundImage}
        blurRadius={25}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)']}
          style={styles.overlay}
        />
      </ImageBackground>

      <KeyboardAvoidingView
        behavior="padding"
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={scale(24)} color={COLORS.white} />
          </TouchableOpacity>

          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.iconContainer}>
              <Heart color={COLORS.primary} size={scale(32)} fill={COLORS.primary} />
            </View>
            <Text style={styles.logoText}>Daydate</Text>
          </View>

          {/* Signup Form */}
          <GlassCard style={styles.formCard}>
            <Text style={styles.title}>회원가입</Text>
            <Text style={styles.subtitle}>
              연인과 함께하는 특별한 여정을 시작하세요
            </Text>

            <GlassInput
              label="닉네임"
              placeholder="사용할 닉네임을 입력해주세요"
              value={nickname}
              onChangeText={setNickname}
              autoCapitalize="none"
              leftIcon={<User size={scale(20)} color={COLORS.glass.white60} />}
            />

            <GlassInput
              label="이메일"
              placeholder="example@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Mail size={scale(20)} color={COLORS.glass.white60} />}
            />

            <GlassInput
              label="비밀번호"
              placeholder="6자 이상 입력해주세요"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              leftIcon={<Lock size={scale(20)} color={COLORS.glass.white60} />}
              rightIcon={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <EyeOff size={scale(20)} color={COLORS.glass.white60} />
                  ) : (
                    <Eye size={scale(20)} color={COLORS.glass.white60} />
                  )}
                </TouchableOpacity>
              }
            />

            <GlassInput
              label="비밀번호 확인"
              placeholder="비밀번호를 다시 입력해주세요"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              leftIcon={<Lock size={scale(20)} color={COLORS.glass.white60} />}
            />

            <GlassButton
              onPress={handleSignup}
              variant="primary"
              fullWidth
              loading={loading}
              style={styles.signupButton}
            >
              회원가입
            </GlassButton>
          </GlassCard>

          {/* Login link */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>이미 계정이 있으신가요? </Text>
            <Link href="/(auth)/onboarding" asChild>
              <TouchableOpacity>
                <Text style={styles.loginLink}>로그인</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  backgroundImage: {
    position: 'absolute',
    width,
    height,
  },
  overlay: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.massive,
    paddingBottom: SPACING.xxxl,
  },
  backButton: {
    width: scale(44),
    height: scale(44),
    borderRadius: scale(22),
    backgroundColor: COLORS.glass.white20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  iconContainer: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    backgroundColor: COLORS.glass.white20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    borderWidth: scale(1),
    borderColor: COLORS.glass.white30,
  },
  logoText: {
    fontSize: TYPOGRAPHY.fontSize.xxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.white,
  },
  formCard: {
    padding: SPACING.xl,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.glass.white60,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  signupButton: {
    marginTop: SPACING.md,
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  loginText: {
    color: COLORS.glass.white70,
    fontSize: TYPOGRAPHY.fontSize.md,
  },
  loginLink: {
    color: COLORS.primary,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
});
