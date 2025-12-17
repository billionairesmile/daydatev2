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
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useOnboardingStore, useAuthStore, useMemoryStore } from '@/stores';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { db, isDemoMode } from '@/lib/supabase';

const { width } = Dimensions.get('window');

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data } = useOnboardingStore();
  const { signOut, couple } = useAuthStore();
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

  // Account deletion modal
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const calculateDaysTogether = () => {
    // 온보딩 완료 후 커플 생성 시점(couple.createdAt)부터 현재까지 계산
    if (!couple?.createdAt) return 0;
    const start = new Date(couple.createdAt);
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
    setShowDeleteAccountModal(true);
  };

  const handleDeleteAccountConfirm = async () => {
    if (deleteConfirmText !== t('settings.deleteAccount.confirmText')) return;

    setIsDeleting(true);
    const { user } = useAuthStore.getState();
    const { cleanup: cleanupSync } = useCoupleSyncStore.getState();

    try {
      // Cleanup realtime subscriptions first
      cleanupSync();

      // Delete all data from database
      if (!isDemoMode && user?.id) {
        const result = await db.account.deleteAccount(user.id, couple?.id || null);
        if (!result.success) {
          console.error('[Settings] Account deletion errors:', result.errors);
        }
      }

      // Clear all local storage
      await db.account.clearLocalStorage();

      // Clear Zustand stores
      signOut();

      setShowDeleteAccountModal(false);
      setDeleteConfirmText('');
      setIsDeleting(false);

      Alert.alert(
        t('settings.deleteAccount.success'),
        t('settings.deleteAccount.successMessage'),
        [
          {
            text: t('common.confirm'),
            onPress: () => router.replace('/(auth)/onboarding'),
          },
        ]
      );
    } catch (error) {
      console.error('[Settings] Account deletion error:', error);
      setIsDeleting(false);
      Alert.alert(t('common.error'), t('settings.deleteAccount.error'));
    }
  };

  const handleUnpairConfirm = async () => {
    if (unpairConfirmText === t('settings.unpair.confirmText')) {
      setShowUnpairConfirmModal(false);
      setShowUnpairModal(false);
      setUnpairConfirmText('');

      const { user, setCouple, setPartner, setIsOnboardingComplete } = useAuthStore.getState();
      const { cleanup: cleanupSync } = useCoupleSyncStore.getState();

      try {
        // Soft delete - disconnect couple in database (30-day recovery period)
        if (!isDemoMode && couple?.id && user?.id) {
          const { error } = await db.couples.disconnect(couple.id, user.id);
          if (error) {
            console.error('[Settings] Error disconnecting couple:', error);
            Alert.alert(t('common.error'), t('settings.unpair.error'));
            return;
          }
        }

        // Cleanup realtime subscriptions
        cleanupSync();

        // Clear couple and partner from local state (but keep user logged in)
        setCouple(null);
        setPartner(null);

        // Set onboarding incomplete to show pairing screen
        setIsOnboardingComplete(false);

        Alert.alert(
          t('settings.unpair.success'),
          t('settings.unpair.successMessage'),
          [
            {
              text: t('common.confirm'),
              onPress: () => {
                // Navigate to pairing screen
                router.replace('/(auth)/onboarding');
              },
            },
          ]
        );
      } catch (error) {
        console.error('[Settings] Unpair error:', error);
        Alert.alert(t('common.error'), t('settings.unpair.error'));
      }
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
          <Text style={styles.modalTitle}>{t('settings.unpair.title')}</Text>
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

          <Text style={styles.warningTitle}>{t('settings.unpair.warningTitle')}</Text>
          <Text style={styles.warningDescription}>
            {t('settings.unpair.warningText')}
          </Text>

          {/* Info Cards */}
          <View style={styles.infoSection}>
            <Text style={styles.infoSectionTitle}>{t('settings.unpair.checkTitle')}</Text>

            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Text style={styles.infoCardIcon}>📅</Text>
                <Text style={styles.infoCardLabel}>{t('settings.unpair.daysTogether')}</Text>
              </View>
              <Text style={styles.infoCardValue}>{calculateDaysTogether()}{t('settings.unpair.daysUnit')}</Text>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Text style={styles.infoCardIcon}>✅</Text>
                <Text style={styles.infoCardLabel}>{t('settings.unpair.completedMissions')}</Text>
              </View>
              <Text style={styles.infoCardValue}>{memories.length}{t('settings.unpair.missionsUnit')}</Text>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Text style={styles.infoCardIcon}>🔄</Text>
                <Text style={styles.infoCardLabel}>{t('settings.unpair.recoveryPeriod')}</Text>
              </View>
              <Text style={styles.infoCardValue}>{getRecoveryPeriod()}</Text>
              <Text style={styles.infoCardSubtext}>{t('settings.unpair.recoveryHint')}</Text>
            </View>
          </View>

          {/* Warning List */}
          <View style={styles.warningList}>
            <Text style={styles.warningListTitle}>{t('settings.unpair.warningsTitle')}</Text>
            <View style={styles.warningListItem}>
              <Text style={styles.warningBullet}>•</Text>
              <Text style={styles.warningListText}>{t('settings.unpair.warning1')}</Text>
            </View>
            <View style={styles.warningListItem}>
              <Text style={styles.warningBullet}>•</Text>
              <Text style={styles.warningListText}>{t('settings.unpair.warning2')}</Text>
            </View>
            <View style={styles.warningListItem}>
              <Text style={styles.warningBullet}>•</Text>
              <Text style={styles.warningListText}>{t('settings.unpair.warning3')}</Text>
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
            <Text style={styles.unpairButtonText}>{t('settings.unpair.button')}</Text>
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
          <Text style={styles.confirmModalTitle}>{t('settings.unpair.confirmTitle')}</Text>
          <Text style={styles.confirmModalDescription}>
            {t('settings.unpair.confirmPrompt')}
          </Text>

          <TextInput
            style={styles.confirmInput}
            value={unpairConfirmText}
            onChangeText={setUnpairConfirmText}
            placeholder={t('settings.unpair.confirmText')}
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
              <Text style={styles.confirmCancelButtonText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.confirmUnpairButton,
                unpairConfirmText !== t('settings.unpair.confirmText') && styles.confirmUnpairButtonDisabled,
              ]}
              onPress={handleUnpairConfirm}
              disabled={unpairConfirmText !== t('settings.unpair.confirmText')}
            >
              <Text style={styles.confirmUnpairButtonText}>{t('settings.unpair.button')}</Text>
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
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Push Notifications */}
        <Text style={styles.sectionTitle}>{t('settings.sections.notifications')}</Text>
        <View style={styles.settingCard}>
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Bell color={COLORS.black} size={20} />
              </View>
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemLabel}>{t('settings.notifications.push')}</Text>
                <Text style={styles.settingItemDescription}>{t('settings.notifications.pushDesc')}</Text>
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
                <Text style={styles.settingItemLabel}>{t('settings.notifications.mission')}</Text>
                <Text style={styles.settingItemDescription}>{t('settings.notifications.missionDesc')}</Text>
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
                <Text style={styles.settingItemLabel}>{t('settings.notifications.message')}</Text>
                <Text style={styles.settingItemDescription}>{t('settings.notifications.messageDesc')}</Text>
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
        <Text style={styles.sectionTitle}>{t('settings.sections.marketing')}</Text>
        <View style={styles.settingCard}>
          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Megaphone color={COLORS.black} size={20} />
              </View>
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemLabel}>{t('settings.marketing.news')}</Text>
                <Text style={styles.settingItemDescription}>{t('settings.marketing.newsDesc')}</Text>
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
                <Text style={styles.settingItemLabel}>{t('settings.marketing.info')}</Text>
                <Text style={styles.settingItemDescription}>{t('settings.marketing.infoDesc')}</Text>
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
        <Text style={styles.sectionTitle}>{t('settings.sections.other')}</Text>
        <View style={styles.settingCard}>
          <Pressable style={styles.menuItem} onPress={() => {}}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <FileText color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.termsOfService')}</Text>
            </View>
            <ChevronRight color="#999" size={20} />
          </Pressable>

          <View style={styles.settingDivider} />

          <Pressable style={styles.menuItem} onPress={() => {}}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Shield color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.privacyPolicy')}</Text>
            </View>
            <ChevronRight color="#999" size={20} />
          </Pressable>

          <View style={styles.settingDivider} />

          <View style={styles.versionItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Info color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.version', { version: '1.0.0' })}</Text>
            </View>
            <Text style={styles.versionStatus}>{t('settings.other.latestVersion')}</Text>
          </View>
        </View>

        {/* Account Actions */}
        <Text style={styles.sectionTitle}>{t('settings.sections.account')}</Text>
        <View style={styles.settingCard}>
          <Pressable style={styles.dangerItem} onPress={handleAccountDeletion}>
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: '#ffebee' }]}>
                <UserX color="#f44336" size={20} />
              </View>
              <Text style={styles.dangerItemLabel}>{t('settings.account.deleteAccount')}</Text>
            </View>
          </Pressable>

          <View style={styles.settingDivider} />

          <Pressable style={styles.dangerItem} onPress={() => setShowUnpairModal(true)}>
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: '#fff3e0' }]}>
                <Link2Off color="#ff9800" size={20} />
              </View>
              <Text style={[styles.dangerItemLabel, { color: '#ff9800' }]}>{t('settings.account.unpair')}</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* Modals */}
      {renderUnpairInfoModal()}
      {renderUnpairConfirmModal()}

      {/* Account Deletion Confirmation Modal */}
      <Modal
        visible={showDeleteAccountModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeleting) {
            setShowDeleteAccountModal(false);
            setDeleteConfirmText('');
          }
        }}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContent}>
            <View style={styles.deleteWarningIcon}>
              <AlertTriangle color="#f44336" size={32} />
            </View>
            <Text style={styles.confirmModalTitle}>{t('settings.deleteAccount.title')}</Text>
            <Text style={styles.confirmModalDescription}>
              {t('settings.deleteAccount.warningText')}
              <Text style={styles.deleteWarningText}>{t('settings.deleteAccount.permanentDelete')}</Text>
              {t('settings.deleteAccount.warningEnd')}{'\n\n'}
              {t('settings.deleteAccount.dataList')}
            </Text>
            <Text style={styles.deleteConfirmHint}>
              {t('settings.deleteAccount.confirmPrompt')}
            </Text>

            <TextInput
              style={styles.confirmInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={t('settings.deleteAccount.confirmText')}
              placeholderTextColor="#ccc"
              autoFocus
              editable={!isDeleting}
            />

            <View style={styles.confirmButtonRow}>
              <Pressable
                style={styles.confirmCancelButton}
                onPress={() => {
                  setShowDeleteAccountModal(false);
                  setDeleteConfirmText('');
                }}
                disabled={isDeleting}
              >
                <Text style={styles.confirmCancelButtonText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmDeleteButton,
                  (deleteConfirmText !== t('settings.deleteAccount.confirmText') || isDeleting) && styles.confirmDeleteButtonDisabled,
                ]}
                onPress={handleDeleteAccountConfirm}
                disabled={deleteConfirmText !== t('settings.deleteAccount.confirmText') || isDeleting}
              >
                {isDeleting ? (
                  <Text style={styles.confirmDeleteButtonText}>{t('settings.deleteAccount.deleting')}</Text>
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>{t('settings.deleteAccount.button')}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  // Account Deletion Modal Styles
  deleteWarningIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#ffebee',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  deleteWarningText: {
    color: '#f44336',
    fontWeight: '700',
  },
  deleteConfirmHint: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  confirmDeleteButton: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f44336',
    borderRadius: RADIUS.full,
  },
  confirmDeleteButtonDisabled: {
    backgroundColor: '#ffcdd2',
  },
  confirmDeleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
});
