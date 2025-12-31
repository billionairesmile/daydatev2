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

// Helper: Get the resolved timezone label (city name with abbreviation)
// For 'auto', returns the device timezone's city label
// For manual selection, returns the selected timezone's city label
export const getTimezoneDisplayName = (timezone: TimezoneId): string => {
  if (timezone === 'auto') {
    const deviceTz = getDeviceTimezone();
    const found = COMMON_TIMEZONES.find(tz => tz.id === deviceTz);
    if (found) {
      return found.label; // e.g., "Seoul (KST)"
    }
    // For unknown timezones, try to get a readable name
    return deviceTz.split('/').pop()?.replace(/_/g, ' ') || deviceTz;
  }
  const found = COMMON_TIMEZONES.find(tz => tz.id === timezone);
  return found?.label || timezone;
};

// Helper: Get the device timezone label (for display in settings)
export const getDeviceTimezoneLabel = (): string => {
  const deviceTz = getDeviceTimezone();
  const found = COMMON_TIMEZONES.find(tz => tz.id === deviceTz);
  if (found) {
    return found.label; // e.g., "Seoul (KST)"
  }
  // For unknown timezones, try to get a readable name
  return deviceTz.split('/').pop()?.replace(/_/g, ' ') || deviceTz;
};

// Helper: Get the IANA timezone ID (e.g., 'Asia/Seoul')
export const getDeviceTimezoneId = (): string => {
  return getDeviceTimezone();
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

// Helper: Get the next midnight in specified timezone as ISO string (UTC)
// This is used for mission expiration times
export const getNextMidnightInTimezone = (timezone?: string): string => {
  const tz = timezone || useTimezoneStore.getState().getEffectiveTimezone();

  try {
    // Get tomorrow's date in the target timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const parts = formatter.formatToParts(now);
    const yearPart = parts.find(p => p.type === 'year')?.value;
    const monthPart = parts.find(p => p.type === 'month')?.value;
    const dayPart = parts.find(p => p.type === 'day')?.value;

    // Validate parts exist
    if (!yearPart || !monthPart || !dayPart) {
      throw new Error('Failed to parse date parts from formatter');
    }

    const year = parseInt(yearPart, 10);
    const month = parseInt(monthPart, 10) - 1; // 0-indexed
    const day = parseInt(dayPart, 10);

    // Validate parsed values
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      throw new Error(`Invalid date values: year=${year}, month=${month}, day=${day}`);
    }

    // Get the timezone offset for the target timezone
    const tzOffset = getTimezoneOffsetMinutes(tz);

    // Validate offset is a finite number
    if (!isFinite(tzOffset)) {
      console.warn('[TimezoneStore] Invalid timezone offset:', tzOffset, 'for timezone:', tz);
      throw new Error(`Invalid timezone offset: ${tzOffset}`);
    }

    // Create tomorrow at midnight in UTC first
    // day + 1 is safe because Date.UTC handles overflow (e.g., day 32 becomes next month day 1)
    const tomorrowMidnightUTC = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));

    // Validate the date is valid
    if (isNaN(tomorrowMidnightUTC.getTime())) {
      throw new Error('Created invalid date for tomorrow midnight');
    }

    // Adjust for timezone offset (subtract offset to get UTC time that corresponds to local midnight)
    // If timezone is UTC+9 (tzOffset = 540), midnight local = 15:00 UTC previous day
    // So we subtract the offset: 00:00 - 540min = 15:00 UTC previous day
    const adjustedTime = tomorrowMidnightUTC.getTime() - (tzOffset * 60 * 1000);

    // Validate adjusted time
    if (!isFinite(adjustedTime)) {
      throw new Error(`Invalid adjusted time: ${adjustedTime}`);
    }

    const result = new Date(adjustedTime);

    // Final validation
    if (isNaN(result.getTime())) {
      throw new Error('Final result is invalid date');
    }

    return result.toISOString();
  } catch (e) {
    console.error('[TimezoneStore] Error calculating next midnight:', e);
    // Fallback to device local time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }
};

// Helper: Get timezone offset in minutes for a given IANA timezone
const getTimezoneOffsetMinutes = (timezone: string): number => {
  try {
    // Use Intl.DateTimeFormat to get reliable timezone offset
    const now = new Date();

    // Get formatted date parts for target timezone
    const targetFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Get formatted date parts for UTC
    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const targetParts = targetFormatter.formatToParts(now);
    const utcParts = utcFormatter.formatToParts(now);

    const getPart = (parts: Intl.DateTimeFormatPart[], type: string): number => {
      const part = parts.find(p => p.type === type);
      return part ? parseInt(part.value, 10) : 0;
    };

    // Calculate total minutes from midnight for both
    const targetDay = getPart(targetParts, 'day');
    const targetHour = getPart(targetParts, 'hour');
    const targetMinute = getPart(targetParts, 'minute');

    const utcDay = getPart(utcParts, 'day');
    const utcHour = getPart(utcParts, 'hour');
    const utcMinute = getPart(utcParts, 'minute');

    // Calculate day difference (handle month boundaries)
    let dayDiff = targetDay - utcDay;
    if (dayDiff > 15) dayDiff -= 31; // Target is in previous month relative to UTC
    if (dayDiff < -15) dayDiff += 31; // Target is in next month relative to UTC

    // Total offset in minutes
    const targetTotalMinutes = (dayDiff * 24 * 60) + (targetHour * 60) + targetMinute;
    const utcTotalMinutes = (utcHour * 60) + utcMinute;

    const offset = targetTotalMinutes - utcTotalMinutes;

    // Sanity check: offset should be between -14 hours and +14 hours
    if (offset < -14 * 60 || offset > 14 * 60) {
      console.warn('[TimezoneStore] Calculated offset out of range:', offset, 'minutes for timezone:', timezone);
      return 0;
    }

    return offset;
  } catch (e) {
    console.error('[TimezoneStore] Error getting timezone offset:', e);
    return 0; // Default to UTC
  }
};
