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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Heart, Mail, Lock, Eye, EyeOff } from 'lucide-react-native';
import { useRouter, Link } from 'expo-router';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { GlassCard, GlassButton, GlassInput } from '@/components/glass';
import { useAuthStore } from '@/stores';
import { supabase, isDemoMode } from '@/lib/supabase';

const { width, height } = Dimensions.get('window');
const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800';

export default function LoginScreen() {
  const router = useRouter();
  const { setUser, setIsAuthenticated, setIsLoading, setError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('알림', '이메일과 비밀번호를 입력해주세요.');
      return;
    }

    // 데모 모드에서는 바로 체험 모드로 전환
    if (isDemoMode || !supabase) {
      Alert.alert(
        '데모 모드',
        'Supabase가 설정되지 않았습니다. 체험 모드로 이동합니다.',
        [{ text: '확인', onPress: handleDemoLogin }]
      );
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // Fetch user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profile) {
          setUser(profile);
          setIsAuthenticated(true);

          // Check if user has completed onboarding
          if (profile.coupleId) {
            router.replace('/(tabs)');
          } else {
            router.replace('/(auth)/pairing');
          }
        }
      }
    } catch (error: any) {
      Alert.alert('로그인 실패', error.message || '다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  // Demo mode - skip auth for development
  const handleDemoLogin = () => {
    setIsAuthenticated(true);
    router.replace('/(tabs)');
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View style={styles.iconContainer}>
              <Heart color={COLORS.primary} size={36} fill={COLORS.primary} />
            </View>
            <Text style={styles.logoText}>Daydate</Text>
            <Text style={styles.tagline}>매일, 새로운 데이트</Text>
          </View>

          {/* Login Form */}
          <GlassCard style={styles.formCard}>
            <Text style={styles.title}>로그인</Text>

            <GlassInput
              placeholder="이메일"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon={<Mail size={20} color={COLORS.glass.white60} />}
            />

            <GlassInput
              placeholder="비밀번호"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              leftIcon={<Lock size={20} color={COLORS.glass.white60} />}
              rightIcon={
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <EyeOff size={20} color={COLORS.glass.white60} />
                  ) : (
                    <Eye size={20} color={COLORS.glass.white60} />
                  )}
                </TouchableOpacity>
              }
            />

            <GlassButton
              onPress={handleLogin}
              variant="primary"
              fullWidth
              loading={loading}
              style={styles.loginButton}
            >
              로그인
            </GlassButton>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>또는</Text>
              <View style={styles.dividerLine} />
            </View>

            <GlassButton
              onPress={handleDemoLogin}
              variant="secondary"
              fullWidth
            >
              체험해보기
            </GlassButton>
          </GlassCard>

          {/* Sign up link */}
          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>계정이 없으신가요? </Text>
            <Link href="/(auth)/signup" asChild>
              <TouchableOpacity>
                <Text style={styles.signupLink}>회원가입</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xxxl,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.glass.white20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.glass.white30,
  },
  logoText: {
    fontSize: TYPOGRAPHY.fontSize.hero,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  tagline: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.glass.white70,
  },
  formCard: {
    padding: SPACING.xl,
  },
  title: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  loginButton: {
    marginTop: SPACING.sm,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.glass.white20,
  },
  dividerText: {
    color: COLORS.glass.white60,
    fontSize: TYPOGRAPHY.fontSize.sm,
    marginHorizontal: SPACING.md,
  },
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: SPACING.xl,
  },
  signupText: {
    color: COLORS.glass.white70,
    fontSize: TYPOGRAPHY.fontSize.md,
  },
  signupLink: {
    color: COLORS.primary,
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
});
