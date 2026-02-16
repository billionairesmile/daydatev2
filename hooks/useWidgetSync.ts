/**
 * useWidgetSync Hook
 *
 * Automatically syncs memory data with the iOS widget.
 * Should be used in the main app component to ensure widget stays updated.
 */

import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { useMemoryStore } from '@/stores/memoryStore';
import { useAuthStore } from '@/stores/authStore';
import { updateWidgetData, isWidgetSupported } from '@/lib/widgetBridge';

/**
 * Format date to YYYY-MM-DD string
 */
function formatDateToString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Hook to automatically sync widget data when memories change
 */
export function useWidgetSync() {
  const memories = useMemoryStore((state) => state.memories);
  const user = useAuthStore((state) => state.user);
  const isLoggedIn = !!user;

  const syncWidgetData = useCallback(async () => {
    console.log('[useWidgetSync] syncWidgetData called');
    console.log('[useWidgetSync] Platform:', Platform.OS);
    console.log('[useWidgetSync] isWidgetSupported:', isWidgetSupported());
    console.log('[useWidgetSync] memories count:', memories.length);
    console.log('[useWidgetSync] isLoggedIn:', isLoggedIn);

    // Only sync on iOS
    if (Platform.OS !== 'ios' || !isWidgetSupported()) {
      console.log('[useWidgetSync] Skipping sync - not iOS or widget not supported');
      return;
    }

    try {
      // Transform memories to widget format
      const widgetEntries = memories.map((memory) => ({
        date: formatDateToString(memory.completedAt),
        photoUrl: memory.photoUrl || null,
      }));

      console.log('[useWidgetSync] Transformed entries:', JSON.stringify(widgetEntries.slice(0, 3)));

      const result = await updateWidgetData(widgetEntries, isLoggedIn);
      console.log('[useWidgetSync] updateWidgetData result:', result);
    } catch (error) {
      console.error('[useWidgetSync] Failed to sync widget data:', error);
    }
  }, [memories, isLoggedIn]);

  // Sync whenever memories or login status changes
  useEffect(() => {
    syncWidgetData();
  }, [syncWidgetData]);

  return { syncWidgetData };
}

/**
 * Manually sync widget data with current memories
 * Can be called after significant data changes
 */
export async function syncWidgetWithMemories(
  memories: Array<{
    id: string;
    photoUrl?: string | null;
    completedAt: Date | string;
  }>,
  isLoggedIn: boolean
) {
  if (Platform.OS !== 'ios' || !isWidgetSupported()) {
    return false;
  }

  try {
    const widgetEntries = memories.map((memory) => ({
      date: formatDateToString(memory.completedAt),
      photoUrl: memory.photoUrl || null,
    }));

    return await updateWidgetData(widgetEntries, isLoggedIn);
  } catch (error) {
    console.error('[syncWidgetWithMemories] Failed to sync:', error);
    return false;
  }
}

export default useWidgetSync;
