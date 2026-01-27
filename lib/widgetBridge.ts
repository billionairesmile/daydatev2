/**
 * Widget Bridge Module
 *
 * Provides interface to sync app data with iOS widget via App Groups.
 * The widget displays a calendar with completed mission photos.
 */

import { NativeModules, Platform } from 'react-native';

interface WidgetDataModule {
  updateWidgetData(jsonData: string): Promise<boolean>;
  reloadWidget(): Promise<boolean>;
}

interface CompletedMission {
  date: string; // "YYYY-MM-DD" format
  photoUrl: string | null;
}

interface WidgetData {
  completedMissions: CompletedMission[];
  isLoggedIn: boolean;
}

// Get the native module (iOS only)
const WidgetModule = Platform.OS === 'ios'
  ? NativeModules.WidgetDataModule as WidgetDataModule | undefined
  : undefined;

// Debug: Log native module availability
if (Platform.OS === 'ios') {
  console.log('[WidgetBridge] NativeModules available:', Object.keys(NativeModules));
  console.log('[WidgetBridge] WidgetDataModule exists:', WidgetModule !== undefined);
}

/**
 * Update widget with completed mission data
 * @param completedMissions Array of completed missions with photo URLs and dates
 * @param isLoggedIn Whether the user is logged in
 */
export async function updateWidgetData(
  completedMissions: CompletedMission[],
  isLoggedIn: boolean
): Promise<boolean> {
  console.log('[WidgetBridge] updateWidgetData called');
  console.log('[WidgetBridge] isLoggedIn:', isLoggedIn);
  console.log('[WidgetBridge] completedMissions count:', completedMissions.length);

  if (!WidgetModule) {
    console.log('[WidgetBridge] WidgetModule not available - skipping update');
    return false;
  }

  try {
    const widgetData: WidgetData = {
      completedMissions,
      isLoggedIn,
    };

    const jsonData = JSON.stringify(widgetData);
    console.log('[WidgetBridge] Sending data to native module:', jsonData.substring(0, 200) + '...');

    const result = await WidgetModule.updateWidgetData(jsonData);

    console.log('[WidgetBridge] Widget data updated successfully, result:', result);
    return result;
  } catch (error) {
    console.error('[WidgetBridge] Failed to update widget data:', error);
    return false;
  }
}

/**
 * Force reload the widget timeline
 */
export async function reloadWidget(): Promise<boolean> {
  if (!WidgetModule) {
    return false;
  }

  try {
    const result = await WidgetModule.reloadWidget();
    console.log('[WidgetBridge] Widget reloaded successfully');
    return result;
  } catch (error) {
    console.error('[WidgetBridge] Failed to reload widget:', error);
    return false;
  }
}

/**
 * Check if widget is supported on this platform
 */
export function isWidgetSupported(): boolean {
  return Platform.OS === 'ios' && WidgetModule !== undefined;
}

export default {
  updateWidgetData,
  reloadWidget,
  isWidgetSupported,
};
