import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  TouchableOpacity,
  Alert,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Heart,
  Copy,
  Share2,
  ArrowRight,
  Users,
  Link as LinkIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { GlassCard, GlassButton, GlassInput } from '@/components/glass';
import { useAuthStore } from '@/stores';

const { width, height } = Dimensions.get('window');
const BACKGROUND_IMAGE = 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=800';

export default function PairingScreen() {
  const router = useRouter();
  const { user, setIsOnboardingComplete } = useAuthStore();

  const [mode, setMode] = useState<'select' | 'share' | 'enter'>('select');
  const [partnerCode, setPartnerCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [myCode] = useState(user?.inviteCode || generateInviteCode());

  function generateInviteCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  const handleCopyCode = async () => {
    await Clipboard.setStringAsync(myCode);
    Alert.alert('복사 완료', '초대 코드가 클립보드에 복사되었습니다.');
  };

  const handleShareCode = async () => {
    try {
      await Share.share({
        message: `Daydate에서 함께 특별한 데이트를 만들어가요! 내 초대 코드: ${myCode}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleConnect = async () => {
    if (!partnerCode || partnerCode.length !== 6) {
      Alert.alert('알림', '6자리 초대 코드를 입력해주세요.');
      return;
    }

    if (partnerCode.toUpperCase() === myCode) {
      Alert.alert('알림', '자신의 초대 코드는 입력할 수 없습니다.');
      return;
    }

    setLoading(true);
    // TODO: Implement actual pairing logic with Supabase
    setTimeout(() => {
      setLoading(false);
      Alert.alert('연결 완료', '연인과 성공적으로 연결되었습니다!', [
        {
          text: '다음',
          onPress: () => router.replace('/(auth)/anniversary'),
        },
      ]);
    }, 1500);
  };

  const handleSkip = () => {
    Alert.alert(
      '건너뛰기',
      '나중에 설정에서 연인을 초대할 수 있습니다. 건너뛰시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '건너뛰기',
          onPress: () => router.replace('/(auth)/anniversary'),
        },
      ]
    );
  };

  const renderContent = () => {
    switch (mode) {
      case 'share':
        return (
          <GlassCard style={styles.card}>
            <View style={styles.cardHeader}>
              <TouchableOpacity
                onPress={() => setMode('select')}
                style={styles.backLink}
              >
                <Text style={styles.backLinkText}>← 뒤로</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.iconWrapper}>
              <Share2 size={32} color={COLORS.primary} />
            </View>

            <Text style={styles.cardTitle}>내 초대 코드</Text>
            <Text style={styles.cardDescription}>
              아래 코드를 연인에게 공유해주세요
            </Text>

            <View style={styles.codeContainer}>
              <Text style={styles.codeText}>{myCode}</Text>
            </View>

            <View style={styles.buttonRow}>
              <GlassButton
                onPress={handleCopyCode}
                variant="secondary"
                icon={<Copy size={18} color={COLORS.white} />}
                style={styles.halfButton}
              >
                복사하기
              </GlassButton>
              <GlassButton
                onPress={handleShareCode}
                variant="primary"
                icon={<Share2 size={18} color={COLORS.black} />}
                style={styles.halfButton}
              >
                공유하기
              </GlassButton>
            </View>
          </GlassCard>
        );

      case 'enter':
        return (
          <GlassCard style={styles.card}>
            <View style={styles.cardHeader}>
              <TouchableOpacity
                onPress={() => setMode('select')}
                style={styles.backLink}
              >
                <Text style={styles.backLinkText}>← 뒤로</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.iconWrapper}>
              <LinkIcon size={32} color={COLORS.primary} />
            </View>

            <Text style={styles.cardTitle}>초대 코드 입력</Text>
            <Text style={styles.cardDescription}>
              연인에게 받은 6자리 코드를 입력해주세요
            </Text>

            <GlassInput
              placeholder="XXXXXX"
              value={partnerCode}
              onChangeText={(text) => setPartnerCode(text.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
              inputStyle={styles.codeInput}
            />

            <GlassButton
              onPress={handleConnect}
              variant="primary"
              fullWidth
              loading={loading}
              disabled={partnerCode.length !== 6}
            >
              연결하기
            </GlassButton>
          </GlassCard>
        );

      default:
        return (
          <GlassCard style={styles.card}>
            <View style={styles.iconWrapper}>
              <Users size={40} color={COLORS.primary} />
            </View>

            <Text style={styles.cardTitle}>연인과 연결하기</Text>
            <Text style={styles.cardDescription}>
              Daydate는 두 사람이 함께 사용하는 앱이에요.{'\n'}
              연인과 연결하고 특별한 추억을 만들어보세요!
            </Text>

            <View style={styles.optionContainer}>
              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => setMode('share')}
                activeOpacity={0.7}
              >
                <View style={styles.optionIcon}>
                  <Share2 size={24} color={COLORS.primary} />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>초대 코드 공유</Text>
                  <Text style={styles.optionDescription}>
                    내 코드를 연인에게 보내기
                  </Text>
                </View>
                <ArrowRight size={20} color={COLORS.glass.white40} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                onPress={() => setMode('enter')}
                activeOpacity={0.7}
              >
                <View style={styles.optionIcon}>
                  <LinkIcon size={24} color={COLORS.primary} />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>초대 코드 입력</Text>
                  <Text style={styles.optionDescription}>
                    연인에게 받은 코드 입력하기
                  </Text>
                </View>
                <ArrowRight size={20} color={COLORS.glass.white40} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>나중에 연결하기</Text>
            </TouchableOpacity>
          </GlassCard>
        );
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

      <View style={styles.content}>
        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '33%' }]} />
          </View>
          <Text style={styles.progressText}>1/3</Text>
        </View>

        {renderContent()}
      </View>
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
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xxl,
    paddingHorizontal: SPACING.sm,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.glass.white20,
    borderRadius: 2,
    marginRight: SPACING.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  progressText: {
    color: COLORS.glass.white60,
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  card: {
    padding: SPACING.xl,
  },
  cardHeader: {
    marginBottom: SPACING.md,
  },
  backLink: {
    padding: SPACING.xs,
  },
  backLinkText: {
    color: COLORS.glass.white60,
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.glass.white10,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  cardTitle: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  cardDescription: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.glass.white70,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  codeContainer: {
    backgroundColor: COLORS.glass.white10,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.glass.white20,
  },
  codeText: {
    fontSize: TYPOGRAPHY.fontSize.hero,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.white,
    textAlign: 'center',
    letterSpacing: 8,
  },
  codeInput: {
    fontSize: TYPOGRAPHY.fontSize.xxl,
    textAlign: 'center',
    letterSpacing: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  halfButton: {
    flex: 1,
  },
  optionContainer: {
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.glass.white10,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.glass.white20,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.glass.white10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.white,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.glass.white60,
  },
  skipButton: {
    padding: SPACING.md,
    alignItems: 'center',
  },
  skipText: {
    color: COLORS.glass.white50,
    fontSize: TYPOGRAPHY.fontSize.md,
  },
});
