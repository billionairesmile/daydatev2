import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  StatusBar,
  Animated,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Link2Off,
  AlertTriangle,
  Calendar,
  CheckCircle,
  RotateCcw,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useAuthStore, useMemoryStore, useOnboardingStore } from '@/stores';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { cancelHourlyReminders } from '@/lib/pushNotifications';
import { db, isDemoMode } from '@/lib/supabase';
import { notifyPartnerUnpaired } from '@/lib/pushNotifications';

export default function UnpairScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { couple } = useAuthStore();
  const { memories, loadFromDB } = useMemoryStore();

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  // Load fresh memory count from database when screen opens
  useEffect(() => {
    if (couple?.id) {
      loadFromDB(couple.id);
    }
  }, [couple?.id, loadFromDB]);

  // Keyboard animation for modal
  const modalAnimatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(modalAnimatedValue, {
          toValue: -e.endCoordinates.height / 3,
          duration: Platform.OS === 'ios' ? 250 : 100,
          useNativeDriver: true,
        }).start();
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        Animated.timing(modalAnimatedValue, {
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
  }, [modalAnimatedValue]);

  const calculateDaysTogether = () => {
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

  const handleUnpairConfirm = async () => {
    // Case-insensitive comparison for English (allows 'unpair', 'Unpair', 'UNPAIR')
    if (confirmText.toLowerCase() === t('settings.unpair.confirmText').toLowerCase()) {
      // Show final confirmation alert before proceeding
      Alert.alert(
        t('settings.unpair.finalConfirmTitle'),
        t('settings.unpair.finalConfirmMessage'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.confirm'),
            style: 'destructive',
            onPress: () => executeUnpair(),
          },
        ]
      );
    }
  };

  const executeUnpair = async () => {
    setShowConfirmModal(false);
    setConfirmText('');

    const { user, partner, setCouple, setPartner, setIsOnboardingComplete } = useAuthStore.getState();
    const { cleanup: cleanupSync } = useCoupleSyncStore.getState();
    const { setStep: setOnboardingStep, updateData: updateOnboardingData } = useOnboardingStore.getState();

    // Get user nickname before clearing state
    const userNickname = user?.nickname || t('common.partner');
    const partnerId = partner?.id;

    try {
      // Soft delete - disconnect couple in database (30-day recovery period)
      if (!isDemoMode && couple?.id && user?.id) {
        const { error } = await db.couples.disconnect(couple.id, user.id);
        if (error) {
          console.error('[Unpair] Error disconnecting couple:', error);
          Alert.alert(t('common.error'), t('settings.unpair.error'));
          return;
        }

        // Clear this user's profile couple_id since the couple is disconnected
        console.log('[Unpair] Clearing profile couple_id for user:', user.id);
        await db.profiles.update(user.id, { couple_id: null });

        // Send push notification to partner
        if (partnerId) {
          await notifyPartnerUnpaired(
            partnerId,
            userNickname,
            t('settings.unpair.notificationTitle'),
            t('settings.unpair.notificationBody', { nickname: userNickname })
          );
        }

        // Delete any existing pending pairing codes for this user
        // This ensures a fresh code with full 24-hour timer will be created
        console.log('[Unpair] Deleting pending pairing codes for user:', user.id);
        await db.pairingCodes.deleteByCreatorId(user.id);
      }

      // Cancel any scheduled notifications
      await cancelHourlyReminders();
      console.log('[Unpair] Cancelled scheduled notifications');

      // Cleanup realtime subscriptions
      cleanupSync();

      // Reset couple-specific stores to prevent old data from showing after re-pairing
      const { reset: resetMemory } = useMemoryStore.getState();
      resetMemory();

      // Clear couple and partner from local state (but keep user logged in)
      setCouple(null);
      setPartner(null);

      // Set onboarding step first (before changing isOnboardingComplete)
      setOnboardingStep('pairing');
      // Reset all pairing state so user can pair with a new partner
      // Clear anniversaryDate to prevent old date from being applied to new couple
      updateOnboardingData({
        isPairingConnected: false,
        isCreatingCode: true,
        pairingCode: '', // Clear any previously entered code
        anniversaryDate: null, // Clear old anniversary date
        relationshipType: 'dating', // Reset relationship type
      });

      // Show success alert first, then set state on dismiss
      // Navigation will be handled automatically by _layout.tsx's navigation effect
      // when isOnboardingComplete becomes false
      Alert.alert(
        t('settings.unpair.success'),
        t('settings.unpair.successMessage'),
        [
          {
            text: t('common.confirm'),
            onPress: () => {
              // Set onboarding step to pairing AGAIN right before state change
              // This ensures the step is set correctly before navigation effect runs
              setOnboardingStep('pairing');
              updateOnboardingData({
                isPairingConnected: false,
                isCreatingCode: true,
                pairingCode: '',
                anniversaryDate: null,
                relationshipType: 'dating',
              });

              // Set onboarding incomplete and navigate to onboarding screen
              setIsOnboardingComplete(false);
              router.replace('/(auth)/onboarding');
            },
          },
        ]
      );
    } catch (error) {
      console.error('[Unpair] Unpair error:', error);
      Alert.alert(t('common.error'), t('settings.unpair.error'));
    }
  };

  const closeConfirmModal = () => {
    setShowConfirmModal(false);
    setConfirmText('');
  };

  // Show initial confirmation alert before showing the text-input modal
  const handleUnpairButtonPress = () => {
    Alert.alert(
      t('settings.unpair.confirmAlertTitle'),
      t('settings.unpair.confirmAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: () => setShowConfirmModal(true),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('settings.unpair.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
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
              <View style={[styles.infoCardIconWrapper, { backgroundColor: '#e3f2fd' }]}>
                <Calendar color="#2196f3" size={18} />
              </View>
              <Text style={styles.infoCardLabel}>{t('settings.unpair.daysTogether')}</Text>
            </View>
            <Text style={styles.infoCardValue}>{calculateDaysTogether()}{t('settings.unpair.daysUnit')}</Text>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <View style={[styles.infoCardIconWrapper, { backgroundColor: '#e8f5e9' }]}>
                <CheckCircle color="#4caf50" size={18} />
              </View>
              <Text style={styles.infoCardLabel}>{t('settings.unpair.dateRecords')}</Text>
            </View>
            <Text style={styles.infoCardValue}>{memories.length}{t('settings.unpair.recordsUnit')}</Text>
          </View>

          <View style={styles.infoCard}>
            <View style={styles.infoCardHeader}>
              <View style={[styles.infoCardIconWrapper, { backgroundColor: '#fff3e0' }]}>
                <RotateCcw color="#ff9800" size={18} />
              </View>
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
      <View style={styles.bottomButton}>
        <Pressable
          style={styles.unpairButton}
          onPress={handleUnpairButtonPress}
        >
          <Link2Off color={COLORS.white} size={20} />
          <Text style={styles.unpairButtonText}>{t('settings.unpair.button')}</Text>
        </Pressable>
      </View>

      {/* Confirmation Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={closeConfirmModal}
      >
        <View style={styles.confirmModalOverlay}>
          <Animated.View
            style={[
              styles.confirmModalContent,
              { transform: [{ translateY: modalAnimatedValue }] }
            ]}
          >
            <Text style={styles.confirmModalTitle}>{t('settings.unpair.confirmTitle')}</Text>
            <Text style={styles.confirmModalDescription}>
              {t('settings.unpair.confirmPrompt')}
            </Text>

            <TextInput
              style={styles.confirmInput}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={t('settings.unpair.confirmText')}
              placeholderTextColor="#ccc"
              autoFocus
            />

            <View style={styles.confirmButtonRow}>
              <Pressable
                style={styles.confirmCancelButton}
                onPress={closeConfirmModal}
              >
                <Text style={styles.confirmCancelButtonText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmUnpairButton,
                  confirmText.toLowerCase() !== t('settings.unpair.confirmText').toLowerCase() && styles.confirmUnpairButtonDisabled,
                ]}
                onPress={handleUnpairConfirm}
                disabled={confirmText.toLowerCase() !== t('settings.unpair.confirmText').toLowerCase()}
              >
                <Text style={styles.confirmUnpairButtonText}>{t('settings.unpair.button')}</Text>
              </Pressable>
            </View>
          </Animated.View>
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
  infoCardIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginLeft: 40,
  },
  infoCardSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    marginLeft: 40,
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
  bottomButton: {
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
    textAlign: Platform.OS === 'ios' ? 'center' : 'left',
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
