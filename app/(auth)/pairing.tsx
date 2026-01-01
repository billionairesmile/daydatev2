import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import {
  Copy,
  Share2,
  ArrowRight,
  Users,
  Link as LinkIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { useAuthStore } from '@/stores';

export default function PairingScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

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
          <View style={styles.card}>
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
              <View style={styles.codeActions}>
                <TouchableOpacity
                  onPress={handleCopyCode}
                  style={styles.codeActionButton}
                  activeOpacity={0.7}
                >
                  <Copy size={20} color="rgba(0, 0, 0, 0.6)" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleShareCode}
                  style={styles.codeActionButton}
                  activeOpacity={0.7}
                >
                  <Share2 size={20} color="rgba(0, 0, 0, 0.6)" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={handleCopyCode}
                style={[styles.secondaryButton, styles.halfButton]}
                activeOpacity={0.7}
              >
                <Copy size={18} color={COLORS.white} />
                <Text style={styles.secondaryButtonText}>복사하기</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShareCode}
                style={[styles.primaryButton, styles.halfButton]}
                activeOpacity={0.7}
              >
                <Share2 size={18} color={COLORS.white} />
                <Text style={styles.primaryButtonText}>공유하기</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case 'enter':
        return (
          <View style={styles.card}>
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

            <TextInput
              style={styles.textInput}
              placeholder="XXXXXX"
              placeholderTextColor="rgba(0, 0, 0, 0.4)"
              value={partnerCode}
              onChangeText={(text) => setPartnerCode(text.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
            />

            <TouchableOpacity
              onPress={handleConnect}
              style={[styles.primaryButton, styles.fullWidthButton, partnerCode.length !== 6 && styles.buttonDisabled]}
              activeOpacity={0.7}
              disabled={partnerCode.length !== 6}
            >
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.primaryButtonText}>연결하기</Text>
              )}
            </TouchableOpacity>
          </View>
        );

      default:
        return (
          <View style={styles.card}>
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
                <ArrowRight size={20} color="rgba(0, 0, 0, 0.4)" />
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
                <ArrowRight size={20} color="rgba(0, 0, 0, 0.4)" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>나중에 연결하기</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
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
    backgroundColor: COLORS.white,
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
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    marginRight: SPACING.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.black,
    borderRadius: 2,
  },
  progressText: {
    color: 'rgba(0, 0, 0, 0.6)',
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
    color: 'rgba(0, 0, 0, 0.6)',
    fontSize: TYPOGRAPHY.fontSize.sm,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  cardTitle: {
    fontSize: TYPOGRAPHY.fontSize.xl,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  cardDescription: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: 'rgba(0, 0, 0, 0.7)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  codeContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  codeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  codeActionButton: {
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  codeText: {
    fontSize: TYPOGRAPHY.fontSize.xxl,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
    color: COLORS.black,
    textAlign: 'center',
    letterSpacing: 6,
    flex: 1,
  },
  textInput: {
    width: '100%',
    height: 56,
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: SPACING.lg,
    fontSize: TYPOGRAPHY.fontSize.xxl,
    color: COLORS.black,
    textAlign: 'center',
    letterSpacing: 6,
    marginBottom: SPACING.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  halfButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  primaryButton: {
    height: 52,
    backgroundColor: COLORS.black,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
  },
  primaryButtonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.white,
  },
  secondaryButton: {
    height: 52,
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingVertical: SPACING.md,
  },
  secondaryButtonText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    color: COLORS.black,
  },
  fullWidthButton: {
    width: '100%',
  },
  buttonDisabled: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  optionContainer: {
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
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
    color: COLORS.black,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: 'rgba(0, 0, 0, 0.6)',
  },
  skipButton: {
    padding: SPACING.md,
    alignItems: 'center',
  },
  skipText: {
    color: 'rgba(0, 0, 0, 0.5)',
    fontSize: TYPOGRAPHY.fontSize.md,
  },
});
