import { create } from 'zustand';
import { db } from '@/lib/supabase';
import i18n from 'i18next';

// Maximum allowed time difference between device and server (in milliseconds)
// 1 hour = 60 * 60 * 1000 = 3,600,000 ms
const MAX_TIME_DIFFERENCE_MS = 60 * 60 * 1000;

interface TimeValidationState {
  isTimeValid: boolean;
  timeDifferenceMs: number | null;
  lastCheckedAt: Date | null;
  isChecking: boolean;

  // Actions
  validateTime: () => Promise<boolean>;
  reset: () => void;
}

export const useTimeValidationStore = create<TimeValidationState>((set, get) => ({
  isTimeValid: true, // Assume valid until checked
  timeDifferenceMs: null,
  lastCheckedAt: null,
  isChecking: false,

  validateTime: async () => {
    // Prevent concurrent checks
    if (get().isChecking) {
      return get().isTimeValid;
    }

    set({ isChecking: true });

    try {
      // Get server time
      const serverTime = await db.getServerTime();
      const deviceTime = new Date();

      // Calculate absolute time difference
      const timeDifferenceMs = Math.abs(deviceTime.getTime() - serverTime.getTime());

      // Check if within acceptable range
      const isValid = timeDifferenceMs <= MAX_TIME_DIFFERENCE_MS;

      console.log('[TimeValidation] Device time:', deviceTime.toISOString());
      console.log('[TimeValidation] Server time:', serverTime.toISOString());
      console.log('[TimeValidation] Time difference:', Math.round(timeDifferenceMs / 1000 / 60), 'minutes');
      console.log('[TimeValidation] Is valid:', isValid);

      set({
        isTimeValid: isValid,
        timeDifferenceMs,
        lastCheckedAt: new Date(),
        isChecking: false,
      });

      return isValid;
    } catch (error) {
      console.error('[TimeValidation] Error validating time:', error);
      // On error (e.g., network issue), allow operation to proceed
      // The server-side validation will still protect against abuse
      set({
        isTimeValid: true, // Be lenient on network errors
        isChecking: false,
      });
      return true;
    }
  },

  reset: () => {
    set({
      isTimeValid: true,
      timeDifferenceMs: null,
      lastCheckedAt: null,
      isChecking: false,
    });
  },
}));

// Helper function to get time difference in human-readable format (i18n)
export function getTimeDifferenceText(timeDifferenceMs: number | null): string {
  if (timeDifferenceMs === null) return '';

  const minutes = Math.round(timeDifferenceMs / 1000 / 60);
  if (minutes < 60) {
    return i18n.t('timeError.minutes', { count: minutes });
  }

  const hours = Math.round(minutes / 60);
  return i18n.t('timeError.hours', { count: hours });
}
