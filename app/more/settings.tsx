import React, { useState, useEffect, useRef } from 'react';
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
  StatusBar,
  Animated,
  Keyboard,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  Bell,
  Megaphone,
  UserX,
  Link2Off,
  AlertTriangle,
  FileText,
  Info,
  Globe,
  Check,
  LogOut,
  Gift,
  Clock,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { useOnboardingStore, useAuthStore, useMemoryStore, useLanguageStore, getLanguageDisplayName, useSubscriptionStore, useTimezoneStore, getTimezoneDisplayName, getDeviceTimezoneLabel, COMMON_TIMEZONES } from '@/stores';
import type { SupportedLanguage, TimezoneId } from '@/stores';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { db, isDemoMode } from '@/lib/supabase';
import { signOut as supabaseSignOut } from '@/lib/socialAuth';
import { notifyPartnerUnpaired, getNotificationPermissionStatus } from '@/lib/pushNotifications';

const { width } = Dimensions.get('window');

export default function SettingsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { data, reset: resetOnboarding } = useOnboardingStore();
  const { signOut, couple, user, setIsOnboardingComplete } = useAuthStore();
  const { memories } = useMemoryStore();
  const { language, setLanguage } = useLanguageStore();
  const { timezone, updateTimezoneInDb, getEffectiveTimezone } = useTimezoneStore();
  const { isPremium } = useSubscriptionStore();
  const { hasTimezoneMismatch, partnerDeviceTimezone, dismissTimezoneMismatch } = useCoupleSyncStore();

  // Notification settings
  const [pushEnabled, setPushEnabled] = useState(true);
  const [newsEnabled, setNewsEnabled] = useState(false);
  const [marketingEnabled, setMarketingEnabled] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // Account deletion modal
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Language selection modal
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Timezone selection modal
  const [showTimezoneModal, setShowTimezoneModal] = useState(false);


  // Keyboard animation for modals
  const modalAnimatedValue = useRef(new Animated.Value(0)).current;

  // Load notification settings from DB on mount, syncing with OS permission status
  useEffect(() => {
    const loadSettings = async () => {
      if (!user?.id || isDemoMode) {
        setIsLoadingSettings(false);
        return;
      }

      try {
        // Check OS-level notification permission status
        const osPermissionGranted = await getNotificationPermissionStatus();

        const { data: profile } = await db.profiles.get(user.id);
        if (profile) {
          // If OS permission is OFF, force push_enabled to OFF regardless of DB value
          // This ensures the toggle reflects the actual system state
          const effectivePushEnabled = osPermissionGranted && (profile.push_enabled ?? true);

          setPushEnabled(effectivePushEnabled);
          setNewsEnabled(profile.news_agreed ?? false);
          setMarketingEnabled(profile.marketing_agreed ?? false);

          // Sync DB with OS permission if they're out of sync
          // (e.g., user turned off notifications in system settings)
          if (!osPermissionGranted && profile.push_enabled) {
            console.log('[Settings] OS permission OFF but DB shows ON - syncing to OFF');
            await db.profiles.update(user.id, { push_enabled: false });
          }
        } else {
          // No profile data - just check OS permission
          setPushEnabled(osPermissionGranted);
        }
      } catch (error) {
        console.error('[Settings] Error loading notification settings:', error);
      } finally {
        setIsLoadingSettings(false);
      }
    };

    loadSettings();
  }, [user?.id]);

  // Handlers to sync notification settings to DB
  const handlePushEnabledChange = async (value: boolean) => {
    setPushEnabled(value);
    if (user?.id && !isDemoMode) {
      await db.profiles.update(user.id, { push_enabled: value });
    }
  };

  const handleNewsEnabledChange = async (value: boolean) => {
    setNewsEnabled(value);
    if (user?.id && !isDemoMode) {
      await db.profiles.update(user.id, { news_agreed: value });
    }
  };

  const handleMarketingEnabledChange = async (value: boolean) => {
    setMarketingEnabled(value);
    if (user?.id && !isDemoMode) {
      await db.profiles.update(user.id, { marketing_agreed: value });
    }
  };

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

  const AVAILABLE_LANGUAGES: { code: SupportedLanguage; name: string; nativeName: string }[] = [
    { code: 'ko', name: 'Korean', nativeName: '한국어' },
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'zh-TW', name: 'Traditional Chinese', nativeName: '繁體中文' },
  ];

  const handleLanguageSelect = (langCode: SupportedLanguage) => {
    setLanguage(langCode);
    setShowLanguageModal(false);
  };

  const handleTimezoneSelect = async (tzId: TimezoneId) => {
    setShowTimezoneModal(false);
    if (couple?.id) {
      // Save to DB for couple-level sync
      await updateTimezoneInDb(couple.id, tzId);
      // Dismiss timezone mismatch warning when user selects a timezone
      if (tzId !== 'auto') {
        dismissTimezoneMismatch();
      }
    }
  };

  const handleLogout = () => {
    Alert.alert(
      t('settings.account.logoutTitle'),
      t('settings.account.logoutMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.account.logout'),
          style: 'destructive',
          onPress: async () => {
            // Cleanup realtime subscriptions and reset coupleSyncStore state (missions, bookmarks, etc.)
            const { cleanup: cleanupSync } = useCoupleSyncStore.getState();
            cleanupSync();
            // Clear all auth data (user, couple, partner)
            signOut();
            // Reset onboarding steps to welcome
            resetOnboarding();
            // Note: Don't clear hasSeenHomeTutorial - it should persist so returning users don't see the tutorial again
            router.replace('/(auth)/onboarding');
          },
        },
      ]
    );
  };

  const handleSubscriptionManagement = () => {
    // Open App Store or Google Play subscription management
    const url = Platform.select({
      ios: 'https://apps.apple.com/account/subscriptions',
      android: 'https://play.google.com/store/account/subscriptions',
    });
    if (url) {
      Linking.openURL(url);
    }
  };

  const handleAccountDeletion = () => {
    // If user has active subscription, show warning first
    if (isPremium) {
      Alert.alert(
        t('premium.deleteWarning.title'),
        t('premium.deleteWarning.message'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('premium.deleteWarning.manageSubscription'),
            onPress: handleSubscriptionManagement,
          },
          {
            text: t('premium.deleteWarning.continueDelete'),
            style: 'destructive',
            onPress: () => showDeleteConfirmation(),
          },
        ]
      );
    } else {
      showDeleteConfirmation();
    }
  };

  const showDeleteConfirmation = () => {
    // Show confirmation alert before opening the text-input modal
    Alert.alert(
      t('settings.deleteAccount.confirmAlertTitle'),
      t('settings.deleteAccount.confirmAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: () => setShowDeleteAccountModal(true),
        },
      ]
    );
  };

  const handleDeleteAccountConfirm = async () => {
    // Case-insensitive comparison for English (allows 'delete', 'Delete', 'DELETE')
    if (deleteConfirmText.toLowerCase() !== t('settings.deleteAccount.confirmText').toLowerCase()) return;

    // Show final confirmation alert before proceeding
    Alert.alert(
      t('settings.deleteAccount.finalConfirmTitle'),
      t('settings.deleteAccount.finalConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.confirm'),
          style: 'destructive',
          onPress: () => executeAccountDeletion(),
        },
      ]
    );
  };

  const executeAccountDeletion = async () => {
    setIsDeleting(true);
    const { user, partner } = useAuthStore.getState();
    const { cleanup: cleanupSync } = useCoupleSyncStore.getState();
    const { setStep: setOnboardingStep } = useOnboardingStore.getState();

    // Get user nickname before clearing state
    const userNickname = user?.nickname || t('common.partner');
    const partnerId = partner?.id;

    try {
      // Cleanup realtime subscriptions first
      cleanupSync();

      // If user has a couple, disconnect first to notify partner
      if (!isDemoMode && couple?.id && user?.id) {
        // Soft disconnect with 'account_deleted' reason - this triggers realtime subscription for partner
        // The reason helps partner know user deleted their account (not just unpaired)
        // Note: If couple is already disconnected (user did unpair first), this is a no-op
        const { error: disconnectError } = await db.couples.disconnect(couple.id, user.id, 'account_deleted');
        if (disconnectError && disconnectError.message) {
          console.error('[Settings] Error disconnecting couple before deletion:', disconnectError.message);
          // Continue with deletion even if disconnect fails
        }

        // Send push notification to partner about account deletion
        if (partnerId) {
          await notifyPartnerUnpaired(
            partnerId,
            userNickname,
            t('settings.deleteAccount.partnerNotificationTitle'),
            t('settings.deleteAccount.partnerNotificationBody', { nickname: userNickname })
          );
        }
      }

      // Delete all data from database
      if (!isDemoMode && user?.id) {
        const result = await db.account.deleteAccount(user.id, couple?.id || null);
        if (!result.success) {
          console.error('[Settings] Account deletion errors:', result.errors);
        }
      }

      // Close modal and reset UI state first
      setShowDeleteAccountModal(false);
      setDeleteConfirmText('');
      setIsDeleting(false);

      // CRITICAL ORDER FOR AVOIDING PAIRING SCREEN FLASH:
      // 1. Sign out from Supabase FIRST to invalidate the session
      // 2. Clear AsyncStorage so persist middleware can't restore old state
      // 3. Reset in-memory stores to 'welcome'
      // 4. Wait for React to process state changes
      // 5. Finally signOut from Zustand (which triggers navigation)
      // This ensures that when onboarding screen mounts, user is definitely not authenticated

      // Step 1: Sign out from Supabase to invalidate the session
      // This prevents any auth listeners from detecting an active session
      if (!isDemoMode) {
        try {
          await supabaseSignOut();
        } catch (supabaseError) {
          console.error('[Settings] Supabase signOut error:', supabaseError);
          // Continue even if Supabase signOut fails
        }
      }

      // Step 2: Clear all AsyncStorage
      await db.account.clearLocalStorage();

      // Step 3: Reset onboarding state to 'welcome' (in-memory)
      setOnboardingStep('welcome');
      resetOnboarding();

      // Step 4: Wait for React to process the state changes before triggering navigation
      // This ensures the 'welcome' step is fully committed to the store
      await new Promise(resolve => setTimeout(resolve, 50));

      // Step 5: Clear Zustand auth stores - this sets isOnboardingComplete to false
      signOut();

      // Step 6: Explicitly navigate to onboarding screen immediately
      // This prevents the brief flash of intermediate screens that would occur
      // if we relied on _layout.tsx useEffect to handle navigation
      router.replace('/(auth)/onboarding');

      // Show success alert after navigation completes
      setTimeout(() => {
        Alert.alert(
          t('settings.deleteAccount.success'),
          t('settings.deleteAccount.successMessage')
        );
      }, 100);
    } catch (error) {
      console.error('[Settings] Account deletion error:', error);
      setIsDeleting(false);
      Alert.alert(t('common.error'), t('settings.deleteAccount.error'));
    }
  };

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
              onValueChange={handlePushEnabledChange}
              trackColor={{ false: '#e0e0e0', true: '#4caf50' }}
              thumbColor={COLORS.white}
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
              onValueChange={handleNewsEnabledChange}
              trackColor={{ false: '#e0e0e0', true: '#4caf50' }}
              thumbColor={COLORS.white}
            />
          </View>

          <View style={styles.settingDivider} />

          <View style={styles.settingItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Gift color={COLORS.black} size={20} />
              </View>
              <View style={styles.settingItemContent}>
                <Text style={styles.settingItemLabel}>{t('settings.marketing.info')}</Text>
                <Text style={styles.settingItemDescription}>{t('settings.marketing.infoDesc')}</Text>
              </View>
            </View>
            <Switch
              value={marketingEnabled}
              onValueChange={handleMarketingEnabledChange}
              trackColor={{ false: '#e0e0e0', true: '#4caf50' }}
              thumbColor={COLORS.white}
            />
          </View>
        </View>

        {/* Others */}
        <Text style={styles.sectionTitle}>{t('settings.sections.other')}</Text>
        <View style={styles.settingCard}>
          <Pressable style={styles.menuItem} onPress={() => setShowLanguageModal(true)}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Globe color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.language')}</Text>
            </View>
            <View style={styles.languageValue}>
              <Text style={styles.languageValueText}>{getLanguageDisplayName(language)}</Text>
              <ChevronRight color="#999" size={20} />
            </View>
          </Pressable>

          <View style={styles.settingDivider} />

          {/* Timezone mismatch warning */}
          {hasTimezoneMismatch && (
            <Pressable
              style={styles.timezoneMismatchBanner}
              onPress={() => setShowTimezoneModal(true)}
            >
              <AlertTriangle color="#F59E0B" size={20} />
              <View style={styles.timezoneMismatchTextContainer}>
                <Text style={styles.timezoneMismatchTitle}>
                  {t('settings.other.timezoneMismatchTitle')}
                </Text>
                <Text style={styles.timezoneMismatchDesc}>
                  {t('settings.other.timezoneMismatchDesc', { partnerTimezone: partnerDeviceTimezone })}
                </Text>
              </View>
            </Pressable>
          )}

          <Pressable style={styles.menuItem} onPress={() => setShowTimezoneModal(true)}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Clock color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.timezone')}</Text>
            </View>
            <View style={styles.languageValue}>
              <Text style={styles.languageValueText}>{getTimezoneDisplayName(timezone)}</Text>
              <ChevronRight color="#999" size={20} />
            </View>
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

          <View style={styles.settingDivider} />

          <Pressable style={styles.menuItem} onPress={() => router.push('/more/terms')}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <FileText color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.termsAndPolicies')}</Text>
            </View>
            <ChevronRight color="#999" size={20} />
          </Pressable>
        </View>

        {/* Account Actions */}
        <Text style={styles.sectionTitle}>{t('settings.sections.account')}</Text>
        <View style={styles.settingCard}>
          <Pressable style={styles.menuItem} onPress={handleLogout}>
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: '#e3f2fd' }]}>
                <LogOut color="#2196f3" size={20} />
              </View>
              <Text style={[styles.settingItemLabel, { color: '#2196f3' }]}>{t('settings.account.logout')}</Text>
            </View>
          </Pressable>

          <View style={styles.settingDivider} />

          <Pressable style={styles.dangerItem} onPress={() => router.push('/more/unpair')}>
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: '#fff3e0' }]}>
                <Link2Off color="#ff9800" size={20} />
              </View>
              <Text style={[styles.dangerItemLabel, { color: '#ff9800' }]}>{t('settings.account.unpair')}</Text>
            </View>
          </Pressable>

          <View style={styles.settingDivider} />

          <Pressable style={styles.dangerItem} onPress={handleAccountDeletion}>
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: '#ffebee' }]}>
                <UserX color="#f44336" size={20} />
              </View>
              <Text style={styles.dangerItemLabel}>{t('settings.account.deleteAccount')}</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* Language Selection Modal */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <Pressable
          style={styles.languageModalOverlay}
          onPress={() => setShowLanguageModal(false)}
        >
          <View style={styles.languageModalContent}>
            <Text style={styles.languageModalTitle}>{t('settings.other.selectLanguage')}</Text>
            {AVAILABLE_LANGUAGES.map((lang) => (
              <Pressable
                key={lang.code}
                style={styles.languageOption}
                onPress={() => handleLanguageSelect(lang.code)}
              >
                <View style={styles.languageOptionLeft}>
                  <Text style={styles.languageOptionName}>{lang.nativeName}</Text>
                  <Text style={styles.languageOptionSubname}>{lang.name}</Text>
                </View>
                {language === lang.code && (
                  <Check color="#4caf50" size={20} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Timezone Selection Modal */}
      <Modal
        visible={showTimezoneModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTimezoneModal(false)}
      >
        <Pressable
          style={styles.languageModalOverlay}
          onPress={() => setShowTimezoneModal(false)}
        >
          <View style={styles.timezoneModalContent}>
            <Text style={styles.languageModalTitle}>{t('settings.other.selectTimezone')}</Text>
            <Text style={styles.timezoneHint}>{t('settings.other.timezoneHint')}</Text>

            <ScrollView style={styles.timezoneScrollView} showsVerticalScrollIndicator={false}>
              {/* Auto (Device) Option - Shows actual detected city */}
              <Pressable
                style={styles.languageOption}
                onPress={() => handleTimezoneSelect('auto')}
              >
                <View style={styles.languageOptionLeft}>
                  <Text style={styles.languageOptionName}>{getDeviceTimezoneLabel()}</Text>
                  <Text style={styles.languageOptionSubname}>{t('settings.other.timezoneAutoDesc')}</Text>
                </View>
                {timezone === 'auto' && (
                  <Check color="#4caf50" size={20} />
                )}
              </Pressable>

              {/* Manual Timezones */}
              <Text style={styles.timezoneManualHeader}>{t('settings.other.timezoneManual')}</Text>
              {COMMON_TIMEZONES.map((tz) => (
                <Pressable
                  key={tz.id}
                  style={styles.languageOption}
                  onPress={() => handleTimezoneSelect(tz.id)}
                >
                  <View style={styles.languageOptionLeft}>
                    <Text style={styles.languageOptionName}>{tz.label}</Text>
                    <Text style={styles.languageOptionSubname}>
                      UTC{tz.offset >= 0 ? '+' : ''}{tz.offset}
                    </Text>
                  </View>
                  {timezone === tz.id && (
                    <Check color="#4caf50" size={20} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

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
          <Animated.View
            style={[
              styles.confirmModalContent,
              { transform: [{ translateY: modalAnimatedValue }] }
            ]}
          >
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
                  (deleteConfirmText.toLowerCase() !== t('settings.deleteAccount.confirmText').toLowerCase() || isDeleting) && styles.confirmDeleteButtonDisabled,
                ]}
                onPress={handleDeleteAccountConfirm}
                disabled={deleteConfirmText.toLowerCase() !== t('settings.deleteAccount.confirmText').toLowerCase() || isDeleting}
              >
                {isDeleting ? (
                  <Text style={styles.confirmDeleteButtonText}>{t('settings.deleteAccount.deleting')}</Text>
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>{t('settings.deleteAccount.button')}</Text>
                )}
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
  // Language Selection Styles
  languageValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  languageValueText: {
    fontSize: 14,
    color: '#666',
  },
  languageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  languageModalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  languageModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  languageOptionLeft: {
    flex: 1,
  },
  languageOptionName: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.black,
  },
  languageOptionSubname: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  // Timezone Selection Styles
  timezoneModalContent: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
  },
  timezoneScrollView: {
    flexGrow: 0,
  },
  timezoneHint: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  timezoneManualHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Timezone Mismatch Banner Styles
  timezoneMismatchBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  timezoneMismatchTextContainer: {
    flex: 1,
  },
  timezoneMismatchTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  timezoneMismatchDesc: {
    fontSize: 13,
    color: '#B45309',
    lineHeight: 18,
  },
});
