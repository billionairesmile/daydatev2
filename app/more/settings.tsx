import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
  Switch,
  Modal,
  TextInput,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  Bell,
  Megaphone,
  UserX,
  Link2Off,
  AlertTriangle,
  X,
  FileText,
  Shield,
  Info,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useOnboardingStore, useAuthStore, useMemoryStore } from '@/stores';

const { width } = Dimensions.get('window');

export default function SettingsScreen() {
  const router = useRouter();
  const { data } = useOnboardingStore();
  const { signOut } = useAuthStore();
  const { memories } = useMemoryStore();

  // Notification settings
  const [pushEnabled, setPushEnabled] = useState(true);
  const [missionAlert, setMissionAlert] = useState(true);
  const [partnerActivity, setPartnerActivity] = useState(true);
  const [newsEnabled, setNewsEnabled] = useState(false);
  const [marketingEnabled, setMarketingEnabled] = useState(false);

  // Unpair modal
  const [showUnpairModal, setShowUnpairModal] = useState(false);
  const [showUnpairConfirmModal, setShowUnpairConfirmModal] = useState(false);
  const [unpairConfirmText, setUnpairConfirmText] = useState('');

  const calculateDaysTogether = () => {
    if (!data.anniversaryDate) return 0;
    const start = new Date(data.anniversaryDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getRecoveryPeriod = () => {
    const now = new Date();
    const startDate = new Date(now);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 30);

    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    };

    return `${formatDate(startDate)} ~ ${formatDate(endDate)}`;
  };

  const handleAccountDeletion = () => {
    Alert.alert(
      '계정 탈퇴',
      '정말로 계정을 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴',
          style: 'destructive',
          onPress: () => {
            signOut();
            router.replace('/(auth)/onboarding');
          },
        },
      ]
    );
  };

  const handleUnpairConfirm = () => {
    if (unpairConfirmText === '페어링끊기') {
      setShowUnpairConfirmModal(false);
      setShowUnpairModal(false);
      setUnpairConfirmText('');
      // Perform unpair action
      Alert.alert('페어링 해제', '페어링이 해제되었습니다.');
      signOut();
      router.replace('/(auth)/onboarding');
    }
  };

  const renderUnpairInfoModal = () => (
    <Modal
      visible={showUnpairModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowUnpairModal(false)}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Pressable onPress={() => setShowUnpairModal(false)} style={styles.modalCloseButton}>
            <X color={COLORS.black} size={24} />
          </Pressable>
          <Text style={styles.modalTitle}>페어링 끊기</Text>
          <View style={styles.modalHeaderSpacer} />
        </View>

        <ScrollView
          style={styles.modalScrollView}
          contentContainerStyle={styles.modalContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Warning Icon */}
          <View style={styles.warningIconWrapper}>
            <AlertTriangle color="#ff5722" size={48} />
          </View>

          <Text style={styles.warningTitle}>정말 페어링을 끊으시겠어요?</Text>
          <Text style={styles.warningDescription}>
            페어링을 끊으면 파트너와의 연결이 해제되고,{'\n'}
            일부 데이터에 접근할 수 없게 됩니다.
          </Text>

          {/* Info Cards */}
          <View style={styles.infoSection}>
            <Text style={styles.infoSectionTitle}>연결 끊기 전 확인해주세요</Text>

            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Text style={styles.infoCardIcon}>📅</Text>
                <Text style={styles.infoCardLabel}>함께한 기간</Text>
              </View>
              <Text style={styles.infoCardValue}>{calculateDaysTogether()}일</Text>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Text style={styles.infoCardIcon}>✅</Text>
                <Text style={styles.infoCardLabel}>함께 완료한 미션</Text>
              </View>
              <Text style={styles.infoCardValue}>{memories.length}개</Text>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Text style={styles.infoCardIcon}>🔄</Text>
                <Text style={styles.infoCardLabel}>복구 가능한 기간</Text>
              </View>
              <Text style={styles.infoCardValue}>{getRecoveryPeriod()}</Text>
              <Text style={styles.infoCardSubtext}>최대 30일 동안 복구할 수 있어요</Text>
            </View>
          </View>

          {/* Warning List */}
          <View style={styles.warningList}>
            <Text style={styles.warningListTitle}>주의사항</Text>
            <View style={styles.warningListItem}>
              <Text style={styles.warningBullet}>•</Text>
              <Text style={styles.warningListText}>상대방에게 페어링 해제 알림이 전송됩니다</Text>
            </View>
            <View style={styles.warningListItem}>
              <Text style={styles.warningBullet}>•</Text>
              <Text style={styles.warningListText}>미션 히스토리는 개별 계정에 보관됩니다</Text>
            </View>
            <View style={styles.warningListItem}>
              <Text style={styles.warningBullet}>•</Text>
              <Text style={styles.warningListText}>30일 이내 같은 파트너와 재연결 가능합니다</Text>
            </View>
          </View>
        </ScrollView>

        {/* Bottom Button */}
        <View style={styles.modalBottomButton}>
          <Pressable
            style={styles.unpairButton}
            onPress={() => {
              setShowUnpairModal(false);
              setShowUnpairConfirmModal(true);
            }}
          >
            <Link2Off color={COLORS.white} size={20} />
            <Text style={styles.unpairButtonText}>페어링 끊기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );

  const renderUnpairConfirmModal = () => (
    <Modal
      visible={showUnpairConfirmModal}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setShowUnpairConfirmModal(false);
        setUnpairConfirmText('');
      }}
    >
      <View style={styles.confirmModalOverlay}>
        <View style={styles.confirmModalContent}>
          <Text style={styles.confirmModalTitle}>페어링 끊기 확인</Text>
          <Text style={styles.confirmModalDescription}>
            계속하려면 아래에 '페어링끊기'를{'\n'}정확히 입력해주세요
          </Text>

          <TextInput
            style={styles.confirmInput}
            value={unpairConfirmText}
            onChangeText={setUnpairConfirmText}
            placeholder="페어링끊기"
            placeholderTextColor="#ccc"
            autoFocus
          />

          <View style={styles.confirmButtonRow}>
            <Pressable
              style={styles.confirmCancelButton}
              onPress={() => {
                setShowUnpairConfirmModal(false);
                setUnpairConfirmText('');
              }}
            >
              <Text style={styles.confirmCancelButtonText}>취소</Text>
            </Pressable>
            <Pressable
              style={[
                styles.confirmUnpairButton,
                unpairConfirmText !== '페어링끊기' && styles.confirmUnpairButtonDisabled,
              ]}
              onPress={handleUnpairConfirm}
              disabled={unpairConfirmText !== '페어링끊기'}
            >
              <Text style={styles.confirmUnpairButtonText}>페어링 끊기</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>설정</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Push Notifications */}
        <Text style={styles.sectionTitle}>알림</Text>
        <View style={styles.settingCard}>
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Bell color={COLORS.black} size={20} />
              </View>
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemLabel}>푸시 알림</Text>
                <Text style={styles.settingItemDescription}>모든 알림 받기</Text>
              </View>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={setPushEnabled}
              trackColor={{ false: '#e0e0e0', true: '#4caf50' }}
              thumbColor={COLORS.white}
            />
          </View>

          <View style={styles.settingDivider} />

          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapperEmpty} />
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemLabel}>미션 알림</Text>
                <Text style={styles.settingItemDescription}>새로운 미션이 도착하면 알림</Text>
              </View>
            </View>
            <Switch
              value={missionAlert}
              onValueChange={setMissionAlert}
              trackColor={{ false: '#e0e0e0', true: '#4caf50' }}
              thumbColor={COLORS.white}
              disabled={!pushEnabled}
            />
          </View>

          <View style={styles.settingDivider} />

          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapperEmpty} />
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemLabel}>서로에게 한마디 미작성 알림</Text>
                <Text style={styles.settingItemDescription}>한마디를 작성하지 않으면 알림</Text>
              </View>
            </View>
            <Switch
              value={partnerActivity}
              onValueChange={setPartnerActivity}
              trackColor={{ false: '#e0e0e0', true: '#4caf50' }}
              thumbColor={COLORS.white}
              disabled={!pushEnabled}
            />
          </View>
        </View>

        {/* Marketing Notifications */}
        <Text style={styles.sectionTitle}>마케팅</Text>
        <View style={styles.settingCard}>
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Megaphone color={COLORS.black} size={20} />
              </View>
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemLabel}>소식 알림 받기</Text>
                <Text style={styles.settingItemDescription}>이벤트 및 업데이트 소식</Text>
              </View>
            </View>
            <Switch
              value={newsEnabled}
              onValueChange={setNewsEnabled}
              trackColor={{ false: '#e0e0e0', true: '#4caf50' }}
              thumbColor={COLORS.white}
            />
          </View>

          <View style={styles.settingDivider} />

          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapperEmpty} />
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemLabel}>마케팅 정보 수신</Text>
                <Text style={styles.settingItemDescription}>프로모션 및 할인 정보</Text>
              </View>
            </View>
            <Switch
              value={marketingEnabled}
              onValueChange={setMarketingEnabled}
              trackColor={{ false: '#e0e0e0', true: '#4caf50' }}
              thumbColor={COLORS.white}
            />
          </View>
        </View>

        {/* Others */}
        <Text style={styles.sectionTitle}>기타</Text>
        <View style={styles.settingCard}>
          <Pressable style={styles.menuItem} onPress={() => {}}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <FileText color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>서비스 이용약관</Text>
            </View>
            <ChevronRight color="#999" size={20} />
          </Pressable>

          <View style={styles.settingDivider} />

          <Pressable style={styles.menuItem} onPress={() => {}}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Shield color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>개인정보 처리방침</Text>
            </View>
            <ChevronRight color="#999" size={20} />
          </Pressable>

          <View style={styles.settingDivider} />

          <View style={styles.versionItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Info color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>버전 1.0.0</Text>
            </View>
            <Text style={styles.versionStatus}>최신버전</Text>
          </View>
        </View>

        {/* Account Actions */}
        <Text style={styles.sectionTitle}>계정</Text>
        <View style={styles.settingCard}>
          <Pressable style={styles.dangerItem} onPress={handleAccountDeletion}>
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: '#ffebee' }]}>
                <UserX color="#f44336" size={20} />
              </View>
              <Text style={styles.dangerItemLabel}>계정 탈퇴</Text>
            </View>
          </Pressable>

          <View style={styles.settingDivider} />

          <Pressable style={styles.dangerItem} onPress={() => setShowUnpairModal(true)}>
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: '#fff3e0' }]}>
                <Link2Off color="#ff9800" size={20} />
              </View>
              <Text style={[styles.dangerItemLabel, { color: '#ff9800' }]}>페어링 끊기</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* Modals */}
      {renderUnpairInfoModal()}
      {renderUnpairConfirmModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: SPACING.lg,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    marginLeft: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: '#f8f8f8',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  iconWrapperEmpty: {
    width: 36,
    marginRight: SPACING.md,
  },
  settingItemContent: {
    flex: 1,
  },
  settingItemLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.black,
    marginBottom: 2,
  },
  settingItemDescription: {
    fontSize: 13,
    color: '#999',
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#e8e8e8',
    marginLeft: SPACING.lg + 36 + SPACING.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  versionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  versionStatus: {
    fontSize: 13,
    color: '#999',
    fontWeight: '400',
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  dangerItemLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#f44336',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  modalHeaderSpacer: {
    width: 40,
  },
  modalScrollView: {
    flex: 1,
  },
  modalContent: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  warningIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff3e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  warningTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  warningDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  infoSection: {
    width: '100%',
    marginBottom: SPACING.lg,
  },
  infoSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: SPACING.md,
  },
  infoCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: RADIUS.sm,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  infoCardIcon: {
    fontSize: 18,
    marginRight: SPACING.sm,
  },
  infoCardLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoCardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.black,
    marginLeft: 28,
  },
  infoCardSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    marginLeft: 28,
  },
  warningList: {
    width: '100%',
    backgroundColor: '#fff8e1',
    borderRadius: RADIUS.sm,
    padding: SPACING.lg,
  },
  warningListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f57c00',
    marginBottom: SPACING.sm,
  },
  warningListItem: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
  warningBullet: {
    fontSize: 14,
    color: '#ff9800',
    marginRight: SPACING.sm,
  },
  warningListText: {
    fontSize: 13,
    color: '#666',
    flex: 1,
    lineHeight: 18,
  },
  modalBottomButton: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  unpairButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    backgroundColor: '#ff5722',
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
  },
  unpairButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  // Confirm Modal
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  confirmModalContent: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: SPACING.sm,
  },
  confirmModalDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  confirmInput: {
    width: '100%',
    height: 52,
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    fontSize: 16,
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  confirmButtonRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmCancelButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: RADIUS.full,
  },
  confirmCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  confirmUnpairButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f44336',
    borderRadius: RADIUS.full,
  },
  confirmUnpairButtonDisabled: {
    backgroundColor: '#ffcdd2',
  },
  confirmUnpairButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
});
