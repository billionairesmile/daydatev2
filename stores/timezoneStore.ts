import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import { db, isInTestMode } from '@/lib/supabase';

// Common timezones for couples app
// Format: [offset, IANA timezone, display name]
export const COMMON_TIMEZONES = [
  { id: 'Pacific/Honolulu', label: 'Hawaii (HST)', offset: -10 },
  { id: 'America/Anchorage', label: 'Alaska (AKST)', offset: -9 },
  { id: 'America/Los_Angeles', label: 'Los Angeles (PST)', offset: -8 },
  { id: 'America/Denver', label: 'Denver (MST)', offset: -7 },
  { id: 'America/Chicago', label: 'Chicago (CST)', offset: -6 },
  { id: 'America/New_York', label: 'New York (EST)', offset: -5 },
  { id: 'America/Sao_Paulo', label: 'Sao Paulo (BRT)', offset: -3 },
  { id: 'Europe/London', label: 'London (GMT)', offset: 0 },
  { id: 'Europe/Paris', label: 'Paris (CET)', offset: 1 },
  { id: 'Europe/Berlin', label: 'Berlin (CET)', offset: 1 },
  { id: 'Asia/Dubai', label: 'Dubai (GST)', offset: 4 },
  { id: 'Asia/Kolkata', label: 'India (IST)', offset: 5.5 },
  { id: 'Asia/Bangkok', label: 'Bangkok (ICT)', offset: 7 },
  { id: 'Asia/Singapore', label: 'Singapore (SGT)', offset: 8 },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', offset: 8 },
  { id: 'Asia/Shanghai', label: 'Shanghai (CST)', offset: 8 },
  { id: 'Asia/Taipei', label: 'Taipei (CST)', offset: 8 },
  { id: 'Asia/Tokyo', label: 'Tokyo (JST)', offset: 9 },
  { id: 'Asia/Seoul', label: 'Seoul (KST)', offset: 9 },
  { id: 'Australia/Sydney', label: 'Sydney (AEDT)', offset: 11 },
  { id: 'Pacific/Auckland', label: 'Auckland (NZDT)', offset: 13 },
] as const;

export type TimezoneId = typeof COMMON_TIMEZONES[number]['id'] | 'auto';

interface TimezoneState {
  // Selected timezone ('auto' means use device timezone)
  timezone: TimezoneId;
  // Whether user has manually set timezone
  isManuallySet: boolean;

  // Actions
  setTimezone: (timezone: TimezoneId) => void;
  resetToDeviceTimezone: () => void;

  // DB Sync Actions
  syncFromCouple: (coupleTimezone: string | null | undefined) => void;
  updateTimezoneInDb: (coupleId: string, timezone: TimezoneId) => Promise<boolean>;

  // Getters
  getEffectiveTimezone: () => string;
}

// Get device timezone
const getDeviceTimezone = (): string => {
  try {
    const calendars = Localization.getCalendars();
    if (calendars && calendars.length > 0 && calendars[0].timeZone) {
      return calendars[0].timeZone;
    }
  } catch (e) {
    console.log('[TimezoneStore] Failed to get device timezone:', e);
  }
  // Fallback to Intl API
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

// Validate if a timezone string is a valid TimezoneId
const isValidTimezoneId = (tz: string | null | undefined): tz is TimezoneId => {
  if (!tz) return false;
  if (tz === 'auto') return true;
  return COMMON_TIMEZONES.some(t => t.id === tz);
};

export const useTimezoneStore = create<TimezoneState>()(
  persist(
    (set, get) => ({
      timezone: 'auto',
      isManuallySet: false,

      setTimezone: (timezone: TimezoneId) => {
        set({
          timezone,
          isManuallySet: timezone !== 'auto',
        });
      },

      resetToDeviceTimezone: () => {
        set({
          timezone: 'auto',
          isManuallySet: false,
        });
      },

      // Sync timezone from couple record (called when couple is loaded)
      syncFromCouple: (coupleTimezone: string | null | undefined) => {
        console.log('[TimezoneStore] Syncing from couple timezone:', coupleTimezone);

        if (isValidTimezoneId(coupleTimezone)) {
          set({
            timezone: coupleTimezone,
            isManuallySet: coupleTimezone !== 'auto',
          });
        } else {
          // If no valid timezone in DB, default to 'auto'
          set({
            timezone: 'auto',
            isManuallySet: false,
          });
        }
      },

      // Update timezone in DB and local store
      updateTimezoneInDb: async (coupleId: string, timezone: TimezoneId): Promise<boolean> => {
        console.log('[TimezoneStore] Updating timezone in DB:', timezone, 'for couple:', coupleId);

        // Update local store immediately for responsiveness
        set({
          timezone,
          isManuallySet: timezone !== 'auto',
        });

        // In test mode, skip DB update
        if (isInTestMode()) {
          console.log('[TimezoneStore] Test mode - skipping DB update');
          return true;
        }

        try {
          const { error } = await db.couples.updateTimezone(coupleId, timezone);
          if (error) {
            console.error('[TimezoneStore] Failed to update timezone in DB:', error);
            return false;
          }
          console.log('[TimezoneStore] Successfully updated timezone in DB');
          return true;
        } catch (e) {
          console.error('[TimezoneStore] Error updating timezone in DB:', e);
          return false;
        }
      },

      getEffectiveTimezone: () => {
        const { timezone } = get();
        if (timezone === 'auto') {
          return getDeviceTimezone();
        }
        return timezone;
      },
    }),
    {
      name: 'timezone-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Helper: Get timezone display name
export const getTimezoneDisplayName = (timezone: TimezoneId): string => {
  if (timezone === 'auto') {
    const deviceTz = getDeviceTimezone();
    const found = COMMON_TIMEZONES.find(tz => tz.id === deviceTz);
    if (found) {
      return `Auto (${found.label})`;
    }
    return `Auto (${deviceTz})`;
  }
  const found = COMMON_TIMEZONES.find(tz => tz.id === timezone);
  return found?.label || timezone;
};

// Helper: Format date in specified timezone
export const formatDateInTimezone = (date: Date, timezone: string): string => {
  try {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    };
    const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value || '';
    const month = parts.find(p => p.type === 'month')?.value || '';
    const day = parts.find(p => p.type === 'day')?.value || '';
    return `${year}-${month}-${day}`;
  } catch (e) {
    console.error('[TimezoneStore] Error formatting date in timezone:', e);
    // Fallback to local formatting
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

// Helper: Get current date string in effective timezone
export const getTodayInTimezone = (): string => {
  const timezone = useTimezoneStore.getState().getEffectiveTimezone();
  return formatDateInTimezone(new Date(), timezone);
};

// Helper: Check if a date is today in effective timezone
export const isDateTodayInTimezone = (dateString: string): boolean => {
  const today = getTodayInTimezone();
  return dateString === today;
};
