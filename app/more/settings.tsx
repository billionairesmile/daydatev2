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
  Info,
  Globe,
  Check,
  LogOut,
  Gift,
  Clock,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, SPACING, RADIUS, IS_TABLET, scale, scaleFont } from '@/constants/design';
import { useOnboardingStore, useAuthStore, useMemoryStore, useLanguageStore, getLanguageDisplayName, useSubscriptionStore, useTimezoneStore, getTimezoneDisplayName, getDeviceTimezoneLabel, COMMON_TIMEZONES } from '@/stores';
import type { SupportedLanguage, TimezoneId } from '@/stores';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';

import { db, isDemoMode, supabase } from '@/lib/supabase';
import { signOut as supabaseSignOut } from '@/lib/socialAuth';
import { notifyPartnerUnpaired, getNotificationPermissionStatus } from '@/lib/pushNotifications';
import { useBackground } from '@/contexts';

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
  const { resetBackgroundState } = useBackground();

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

  // Version information
  const currentVersion = Constants.expoConfig?.version || '1.0.0';
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isCheckingVersion, setIsCheckingVersion] = useState(true);

  // Fetch latest version from Supabase (primary) or App Store (fallback)
  useEffect(() => {
    const checkLatestVersion = async () => {
      try {
        console.log('[Settings] Checking version... currentVersion:', currentVersion, 'Platform:', Platform.OS);

        // Primary: Check Supabase app_config table (instantly updated after app upload)
        if (!supabase) {
          console.log('[Settings] Supabase client not initialized (demo mode)');
          return;
        }

        const { data: configData, error: configError } = await supabase
          .from('app_config')
          .select('ios_latest_version, android_latest_version')
          .eq('id', 'main')
          .single();

        console.log('[Settings] Supabase response:', { configData, configError });

        if (!configError && configData) {
          const version = Platform.OS === 'ios'
            ? configData.ios_latest_version
            : configData.android_latest_version;
          console.log('[Settings] Latest version from DB:', version);
          if (version) {
            setLatestVersion(version);
            setIsCheckingVersion(false);
            return;
          }
        }

        // Fallback for iOS: Use iTunes Lookup API (may have 24-48h cache delay)
        if (Platform.OS === 'ios') {
          const response = await fetch(
            'https://itunes.apple.com/lookup?bundleId=com.daydate.app&country=kr'
          );
          const data = await response.json();
          if (data.resultCount > 0 && data.results[0]?.version) {
            setLatestVersion(data.results[0].version);
          }
        }
      } catch (error) {
        console.log('[Settings] Failed to fetch latest version:', error);
        setLatestVersion(null);
      } finally {
        setIsCheckingVersion(false);
      }
    };

    checkLatestVersion();
  }, []);

  // Check if update is available
  const isUpdateAvailable = () => {
    if (!latestVersion) {
      console.log('[Settings] isUpdateAvailable: No latestVersion');
      return false;
    }

    const current = currentVersion.split('.').map(Number);
    const latest = latestVersion.split('.').map(Number);

    console.log('[Settings] Version comparison:', { current, latest, currentVersion, latestVersion });

    for (let i = 0; i < 3; i++) {
      if (latest[i] > current[i]) return true;
      if (latest[i] < current[i]) return false;
    }
    return false;
  };

  // Open store for update
  const handleUpdate = () => {
    const storeUrl = Platform.OS === 'ios'
      ? 'https://apps.apple.com/kr/app/daydate-%EC%BB%A4%ED%94%8C-%EB%8D%B0%EC%9D%B4%ED%8A%B8-%EB%AF%B8%EC%85%98/id6757266824'
      : 'https://play.google.com/store/apps/details?id=com.daydate.app'; // TODO: Update with actual Play Store URL

    Linking.openURL(storeUrl);
  };


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

  // Handlers to sync notification settings to DB (non-blocking to preserve animation)
  const handlePushEnabledChange = (value: boolean) => {
    setPushEnabled(value);
    if (user?.id && !isDemoMode) {
      db.profiles.update(user.id, { push_enabled: value });
    }
  };

  const handleNewsEnabledChange = (value: boolean) => {
    setNewsEnabled(value);
    if (user?.id && !isDemoMode) {
      db.profiles.update(user.id, { news_agreed: value });
    }
  };

  const handleMarketingEnabledChange = (value: boolean) => {
    setMarketingEnabled(value);
    if (user?.id && !isDemoMode) {
      db.profiles.update(user.id, { marketing_agreed: value });
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
            // Cleanup realtime subscriptions and reset coupleSyncStore state
            const { cleanup: cleanupSync } = useCoupleSyncStore.getState();
            cleanupSync();

            // Reset all user-specific stores to prevent data leaking to next user
            const { reset: resetMemory } = useMemoryStore.getState();
            const { reset: resetSubscription } = useSubscriptionStore.getState();
            resetMemory();
            resetSubscription();

            // Reset background image state to prevent showing previous user's background
            // CRITICAL: Must await to ensure AsyncStorage is cleared before login
            await resetBackgroundState();

            // Sign out from Supabase (removes push token, cancels scheduled notifications)
            if (!isDemoMode) {
              await supabaseSignOut().catch(err => console.error('[Settings] Supabase signOut error:', err));
            }

            // Reset onboarding steps to welcome BEFORE clearing auth data
            // This ensures proper state synchronization
            resetOnboarding();

            // Clear all auth data (user, couple, partner)
            // This sets isOnboardingComplete to false
            signOut();

            // CRITICAL: Clear AsyncStorage auth data to ensure clean logout
            // Without this, persist middleware may reload old state before navigation completes
            await AsyncStorage.removeItem('daydate-auth-storage');

            // Small delay to ensure state updates propagate
            // _layout.tsx will automatically redirect to onboarding when isOnboardingComplete becomes false
            await new Promise(resolve => setTimeout(resolve, 100));
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

    // Dismiss keyboard before showing alert to prevent keyboard flicker
    Keyboard.dismiss();

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

        // Send push notification to partner about account deletion (fire-and-forget, don't block)
        if (partnerId) {
          notifyPartnerUnpaired(
            partnerId,
            userNickname,
            t('settings.deleteAccount.partnerNotificationTitle'),
            t('settings.deleteAccount.partnerNotificationBody', { nickname: userNickname })
          ).catch(err => console.error('[Settings] Push notification error:', err));
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
      // 4. Clear Zustand auth stores (which triggers navigation)
      // This ensures that when onboarding screen mounts, user is definitely not authenticated

      // Step 1: Sign out from Supabase to invalidate the session
      // This prevents any auth listeners from detecting an active session
      // Step 2: Clear all AsyncStorage (run in parallel with Supabase signOut)
      if (!isDemoMode) {
        await Promise.all([
          supabaseSignOut().catch(err => console.error('[Settings] Supabase signOut error:', err)),
          db.account.clearLocalStorage(),
        ]);
      } else {
        await db.account.clearLocalStorage();
      }

      // Step 3: Reset onboarding state to 'welcome' (in-memory) - synchronous, no delay needed
      setOnboardingStep('welcome');
      resetOnboarding();

      // Step 3.5: Reset background image state to prevent showing previous user's background
      // CRITICAL: Must await to ensure AsyncStorage is cleared before login
      await resetBackgroundState();

      // Step 4: Clear Zustand auth stores - this sets isOnboardingComplete to false
      signOut();

      // CRITICAL: Clear AsyncStorage auth data to ensure clean logout
      // Without this, persist middleware may reload old state before navigation completes
      await AsyncStorage.removeItem('daydate-auth-storage');

      // Small delay to ensure state updates propagate
      // _layout.tsx will automatically redirect to onboarding when isOnboardingComplete becomes false
      await new Promise(resolve => setTimeout(resolve, 200));

      // Show success alert after state update completes
      Alert.alert(
        t('settings.deleteAccount.success'),
        t('settings.deleteAccount.successMessage')
      );
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
          <ChevronLeft color={COLORS.black} size={scale(24)} />
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
                <Bell color={COLORS.black} size={scale(20)} />
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
                <Megaphone color={COLORS.black} size={scale(20)} />
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
                <Gift color={COLORS.black} size={scale(20)} />
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
                <Globe color={COLORS.black} size={scale(20)} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.language')}</Text>
            </View>
            <View style={styles.languageValue}>
              <Text style={styles.languageValueText}>{getLanguageDisplayName(language)}</Text>
              <ChevronRight color="#999" size={scale(20)} />
            </View>
          </Pressable>

          <View style={styles.settingDivider} />

          {/* Timezone mismatch warning */}
          {hasTimezoneMismatch && (
            <Pressable
              style={styles.timezoneMismatchBanner}
              onPress={() => setShowTimezoneModal(true)}
            >
              <AlertTriangle color="#F59E0B" size={scale(20)} />
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
                <Clock color={COLORS.black} size={scale(20)} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.timezone')}</Text>
            </View>
            <View style={styles.languageValue}>
              <Text style={styles.languageValueText}>{getTimezoneDisplayName(timezone)}</Text>
              <ChevronRight color="#999" size={scale(20)} />
            </View>
          </Pressable>

          <View style={styles.settingDivider} />

          <View style={styles.versionItem}>
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Info color={COLORS.black} size={scale(20)} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.version', { version: currentVersion })}</Text>
            </View>
            {isCheckingVersion ? (
              <Text style={styles.versionStatus}>...</Text>
            ) : isUpdateAvailable() ? (
              <Pressable style={styles.updateButton} onPress={handleUpdate}>
                <Text style={styles.updateButtonText}>{t('settings.other.updateAvailable')}</Text>
              </Pressable>
            ) : (
              <Text style={styles.versionStatus}>{t('settings.other.latestVersion')}</Text>
            )}
          </View>
        </View>

        {/* Account Actions */}
        <Text style={styles.sectionTitle}>{t('settings.sections.account')}</Text>
        <View style={styles.settingCard}>
          <Pressable style={styles.menuItem} onPress={handleLogout}>
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: '#e3f2fd' }]}>
                <LogOut color="#2196f3" size={scale(20)} />
              </View>
              <Text style={[styles.settingItemLabel, { color: '#2196f3' }]}>{t('settings.account.logout')}</Text>
            </View>
          </Pressable>

          <View style={styles.settingDivider} />

          <Pressable style={styles.dangerItem} onPress={() => router.push('/more/unpair')}>
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: '#fff3e0' }]}>
                <Link2Off color="#ff9800" size={scale(20)} />
              </View>
              <Text style={[styles.dangerItemLabel, { color: '#ff9800' }]}>{t('settings.account.unpair')}</Text>
            </View>
          </Pressable>

          <View style={styles.settingDivider} />

          <Pressable style={styles.dangerItem} onPress={handleAccountDeletion}>
            <View style={styles.settingItemLeft}>
              <View style={[styles.iconWrapper, { backgroundColor: '#ffebee' }]}>
                <UserX color="#f44336" size={scale(20)} />
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
                  <Check color="#4caf50" size={scale(20)} />
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
            <Text style={styles.timezoneHint}>{t('settings.other.coupleSharedTimezoneHint')}</Text>

            <ScrollView style={styles.timezoneScrollView} showsVerticalScrollIndicator={false}>
              {/* Couple Shared Timezones - Both partners will use the same timezone */}
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
                    <Check color="#4caf50" size={scale(20)} />
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
              <AlertTriangle color="#f44336" size={scale(32)} />
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
    paddingHorizontal: scale(SPACING.md),
    paddingVertical: scale(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: scale(40),
    height: scale(40),
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: scaleFont(18),
    fontWeight: '600',
    color: COLORS.black,
  },
  headerSpacer: {
    width: scale(40),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: scale(SPACING.lg),
    paddingBottom: scale(100),
  },
  sectionTitle: {
    fontSize: scaleFont(13),
    fontWeight: '600',
    color: '#999',
    marginLeft: scale(SPACING.lg),
    marginTop: scale(SPACING.lg),
    marginBottom: scale(SPACING.sm),
    textTransform: 'uppercase',
    letterSpacing: scale(0.5),
  },
  settingCard: {
    marginHorizontal: scale(SPACING.lg),
    backgroundColor: '#f8f8f8',
    borderRadius: scale(RADIUS.md),
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.md),
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: scale(SPACING.md),
  },
  iconWrapperEmpty: {
    width: scale(36),
    marginRight: scale(SPACING.md),
  },
  settingItemContent: {
    flex: 1,
  },
  settingItemLabel: {
    fontSize: scaleFont(15),
    fontWeight: '500',
    color: COLORS.black,
    marginBottom: scale(2),
  },
  settingItemDescription: {
    fontSize: scaleFont(13),
    color: '#999',
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#e8e8e8',
    marginLeft: scale(SPACING.lg) + scale(36) + scale(SPACING.md),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.lg),
  },
  versionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.lg),
  },
  versionStatus: {
    fontSize: scaleFont(13),
    color: '#999',
    fontWeight: '400',
  },
  updateButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: scale(12),
    paddingVertical: scale(8),
    borderRadius: scale(100),
  },
  updateButtonText: {
    fontSize: scaleFont(15),
    color: '#FFFFFF',
    fontWeight: '600',
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(SPACING.lg),
    paddingVertical: scale(SPACING.lg),
  },
  dangerItemLabel: {
    fontSize: scaleFont(15),
    fontWeight: '500',
    color: '#f44336',
  },
  // Confirm Modal
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(SPACING.lg),
  },
  confirmModalContent: {
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: scale(RADIUS.md),
    padding: scale(SPACING.xl),
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontSize: scaleFont(20),
    fontWeight: '700',
    color: COLORS.black,
    marginBottom: scale(SPACING.sm),
  },
  confirmModalDescription: {
    fontSize: scaleFont(14),
    color: '#666',
    textAlign: 'center',
    lineHeight: scale(20),
    marginBottom: scale(SPACING.lg),
  },
  confirmInput: {
    width: '100%',
    height: scale(52),
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.sm),
    paddingHorizontal: scale(SPACING.lg),
    fontSize: scaleFont(16),
    color: COLORS.black,
    textAlign: Platform.OS === 'ios' ? 'center' : 'left',
    marginBottom: scale(SPACING.lg),
  },
  confirmButtonRow: {
    flexDirection: 'row',
    gap: scale(12),
    width: '100%',
  },
  confirmCancelButton: {
    flex: 1,
    height: scale(48),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: scale(RADIUS.full),
  },
  confirmCancelButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    color: '#666',
  },
  // Account Deletion Modal Styles
  deleteWarningIcon: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(32),
    backgroundColor: '#ffebee',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: scale(SPACING.md),
  },
  deleteWarningText: {
    color: '#f44336',
    fontWeight: '700',
  },
  deleteConfirmHint: {
    fontSize: scaleFont(13),
    color: '#999',
    textAlign: 'center',
    marginBottom: scale(SPACING.md),
  },
  confirmDeleteButton: {
    flex: 1,
    height: scale(48),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f44336',
    borderRadius: scale(RADIUS.full),
  },
  confirmDeleteButtonDisabled: {
    backgroundColor: '#ffcdd2',
  },
  confirmDeleteButtonText: {
    fontSize: scaleFont(15),
    fontWeight: '600',
    color: COLORS.white,
  },
  // Language Selection Styles
  languageValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
  },
  languageValueText: {
    fontSize: scaleFont(14),
    color: '#666',
  },
  languageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: scale(SPACING.lg),
  },
  languageModalContent: {
    width: '100%',
    maxWidth: scale(320),
    backgroundColor: COLORS.white,
    borderRadius: scale(RADIUS.md),
    padding: scale(SPACING.lg),
  },
  languageModalTitle: {
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    marginBottom: scale(SPACING.lg),
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: scale(SPACING.md),
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  languageOptionLeft: {
    flex: 1,
  },
  languageOptionName: {
    fontSize: scaleFont(16),
    fontWeight: '500',
    color: COLORS.black,
  },
  languageOptionSubname: {
    fontSize: scaleFont(13),
    color: '#999',
    marginTop: scale(2),
  },
  // Timezone Selection Styles
  timezoneModalContent: {
    width: '100%',
    maxWidth: scale(360),
    maxHeight: '80%',
    backgroundColor: COLORS.white,
    borderRadius: scale(RADIUS.md),
    padding: scale(SPACING.lg),
  },
  timezoneScrollView: {
    flexGrow: 0,
  },
  timezoneHint: {
    fontSize: scaleFont(13),
    color: '#999',
    textAlign: 'center',
    marginBottom: scale(SPACING.md),
  },
  timezoneManualHeader: {
    fontSize: scaleFont(13),
    fontWeight: '600',
    color: '#999',
    marginTop: scale(SPACING.md),
    marginBottom: scale(SPACING.sm),
    textTransform: 'uppercase',
    letterSpacing: scale(0.5),
  },
  // Timezone Mismatch Banner Styles
  timezoneMismatchBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderRadius: scale(RADIUS.md),
    padding: scale(SPACING.md),
    marginHorizontal: scale(SPACING.md),
    marginBottom: scale(SPACING.sm),
    gap: scale(SPACING.sm),
  },
  timezoneMismatchTextContainer: {
    flex: 1,
  },
  timezoneMismatchTitle: {
    fontSize: scaleFont(14),
    fontWeight: '600',
    color: '#92400E',
    marginBottom: scale(4),
  },
  timezoneMismatchDesc: {
    fontSize: scaleFont(13),
    color: '#B45309',
    lineHeight: scale(18),
  },
});
