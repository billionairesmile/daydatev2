// Date utility functions for Daydate app

/**
 * Formats a Date object to YYYY-MM-DD string in local timezone
 * This avoids the UTC conversion issue that occurs with toISOString()
 */
export const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parses a YYYY-MM-DD string to Date object in local timezone
 * Handles the timezone issue by creating date at noon to avoid edge cases
 */
export const parseDateFromLocal = (dateString: string): Date => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0); // Use noon to avoid timezone edge cases
};

/**
 * Formats a date to Korean display format (YYYY년 MM월 DD일)
 */
export const formatDateKorean = (date: Date | string | null): string => {
  if (!date) return '설정되지 않음';
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
};

/**
 * Safely converts a date string or Date to Date object
 * Handles various input formats and returns null for invalid inputs
 */
export const toSafeDate = (value: Date | string | null | undefined): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;

  // Handle YYYY-MM-DD format (from DB)
  if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return parseDateFromLocal(value);
  }

  // Handle ISO string
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
};
