import { Platform, Alert, Linking } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import i18n from 'i18next';

// Store URLs
const STORE_URLS = {
  ios: 'https://apps.apple.com/app/daydate/id6739075876',
  android: 'https://play.google.com/store/apps/details?id=com.daydate.app',
};

/**
 * Compare two semantic version strings (e.g., "1.1.1" vs "1.2.0")
 * Returns:
 *   1 if version1 > version2
 *   0 if version1 === version2
 *  -1 if version1 < version2
 */
export function compareVersions(version1: string, version2: string): number {
  const parts1 = version1.split('.').map(Number);
  const parts2 = version2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;

    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }

  return 0;
}

/**
 * Get current app version from app.json
 */
export function getCurrentAppVersion(): string {
  return Constants.expoConfig?.version || '1.0.0';
}

/**
 * Fetch latest app version from Supabase app_config
 */
export async function getLatestAppVersion(): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('ios_latest_version, android_latest_version')
      .eq('id', 'main')
      .single();

    if (error) {
      console.error('[VersionCheck] Error fetching app config:', error);
      return null;
    }

    const latestVersion = Platform.OS === 'ios'
      ? data.ios_latest_version
      : data.android_latest_version;

    return latestVersion;
  } catch (error) {
    console.error('[VersionCheck] Exception:', error);
    return null;
  }
}

/**
 * Check if app update is available
 * Returns true if update is available, false otherwise
 */
export async function isUpdateAvailable(): Promise<boolean> {
  const currentVersion = getCurrentAppVersion();
  const latestVersion = await getLatestAppVersion();

  if (!latestVersion) {
    console.log('[VersionCheck] Could not fetch latest version');
    return false;
  }

  const comparison = compareVersions(latestVersion, currentVersion);
  const updateAvailable = comparison > 0; // Latest > Current

  console.log('[VersionCheck]', {
    current: currentVersion,
    latest: latestVersion,
    updateAvailable,
  });

  return updateAvailable;
}

/**
 * Open app store for update
 */
export function openAppStore(): void {
  const storeUrl = Platform.OS === 'ios' ? STORE_URLS.ios : STORE_URLS.android;
  Linking.openURL(storeUrl).catch((err) => {
    console.error('[VersionCheck] Error opening store:', err);
  });
}

/**
 * Show update available alert
 * @param onUpdate - Callback when user taps "Update" button
 * @param onCancel - Callback when user taps "Cancel" button
 */
export function showUpdateAlert(
  onUpdate?: () => void,
  onCancel?: () => void
): void {
  const t = (key: string) => i18n.t(key);

  Alert.alert(
    t('update.title'),
    t('update.message'),
    [
      {
        text: t('update.cancel'),
        style: 'cancel',
        onPress: onCancel,
      },
      {
        text: t('update.confirm'),
        onPress: () => {
          openAppStore();
          onUpdate?.();
        },
      },
    ],
    { cancelable: true }
  );
}

/**
 * Check for updates and show alert if available
 * Call this on app launch
 */
export async function checkForUpdates(): Promise<void> {
  const updateAvailable = await isUpdateAvailable();

  if (updateAvailable) {
    showUpdateAlert();
  }
}
