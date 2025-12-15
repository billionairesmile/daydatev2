/**
 * Location utility functions for DayDate app
 * Handles location permission, fetching, and updates
 */

import * as Location from 'expo-location';
import { Alert, Linking } from 'react-native';
import { db } from './supabase';

export interface UserLocation {
  latitude: number;
  longitude: number;
  city?: string;
  district?: string;
}

/**
 * Check if location permission is granted
 */
export const checkLocationPermission = async (): Promise<boolean> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('[Location] Error checking permission:', error);
    return false;
  }
};

/**
 * Request location permission
 */
export const requestLocationPermission = async (): Promise<boolean> => {
  try {
    const { status: existingStatus } = await Location.getForegroundPermissionsAsync();

    if (existingStatus === 'granted') {
      return true;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      Alert.alert(
        '위치 권한 필요',
        '미션 생성을 위해 위치 권한이 필요합니다. 설정에서 위치 권한을 허용해주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정으로 이동', onPress: () => Linking.openSettings() },
        ]
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Location] Error requesting permission:', error);
    return false;
  }
};

/**
 * Get current location
 */
export const getCurrentLocation = async (): Promise<UserLocation | null> => {
  try {
    const hasPermission = await checkLocationPermission();
    if (!hasPermission) {
      console.log('[Location] Permission not granted');
      return null;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const { latitude, longitude } = location.coords;

    // Try to get city/district from reverse geocoding
    let city: string | undefined;
    let district: string | undefined;

    try {
      const [reverseGeocode] = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (reverseGeocode) {
        city = reverseGeocode.city || reverseGeocode.region || undefined;
        district = reverseGeocode.district || reverseGeocode.subregion || undefined;
      }
    } catch (geocodeError) {
      console.warn('[Location] Reverse geocoding failed:', geocodeError);
    }

    return {
      latitude,
      longitude,
      city,
      district,
    };
  } catch (error) {
    console.error('[Location] Error getting current location:', error);
    return null;
  }
};

/**
 * Update user location in database
 */
export const updateUserLocationInDB = async (userId: string): Promise<boolean> => {
  try {
    const location = await getCurrentLocation();
    if (!location) {
      return false;
    }

    const { error } = await db.profiles.update(userId, {
      location_latitude: location.latitude,
      location_longitude: location.longitude,
      location_city: location.city,
      location_district: location.district,
    });

    if (error) {
      console.error('[Location] Error updating user location in DB:', error);
      return false;
    }

    console.log('[Location] User location updated:', location);
    return true;
  } catch (error) {
    console.error('[Location] Error in updateUserLocationInDB:', error);
    return false;
  }
};

/**
 * Check if both users in a couple have location enabled
 * Returns object with status and missing user info
 */
export const checkCoupleLocationStatus = async (
  userId: string,
  partnerId: string
): Promise<{
  bothEnabled: boolean;
  userLocation: UserLocation | null;
  partnerLocation: UserLocation | null;
  missingUsers: string[];
}> => {
  const result = {
    bothEnabled: false,
    userLocation: null as UserLocation | null,
    partnerLocation: null as UserLocation | null,
    missingUsers: [] as string[],
  };

  try {
    // Check current user's location permission
    const hasPermission = await checkLocationPermission();
    if (!hasPermission) {
      result.missingUsers.push('나');
      return result;
    }

    // Get current user's location
    result.userLocation = await getCurrentLocation();
    if (!result.userLocation) {
      result.missingUsers.push('나');
    }

    // Get partner's location from DB
    const { data: partnerProfile } = await db.profiles.get(partnerId);
    if (partnerProfile?.location_latitude && partnerProfile?.location_longitude) {
      result.partnerLocation = {
        latitude: partnerProfile.location_latitude,
        longitude: partnerProfile.location_longitude,
        city: partnerProfile.location_city || undefined,
        district: partnerProfile.location_district || undefined,
      };
    } else {
      result.missingUsers.push('파트너');
    }

    result.bothEnabled = result.userLocation !== null && result.partnerLocation !== null;

    return result;
  } catch (error) {
    console.error('[Location] Error checking couple location status:', error);
    return result;
  }
};

/**
 * Show alert when location is required but not enabled
 */
export const showLocationRequiredAlert = (missingUsers: string[]) => {
  const missingText = missingUsers.join(', ');
  Alert.alert(
    '위치 정보 필요',
    `미션을 생성하려면 두 분 모두 위치 정보가 필요합니다.\n\n${missingText}의 위치 정보가 없습니다.\n\n위치 서비스를 켜주세요.`,
    [
      { text: '취소', style: 'cancel' },
      {
        text: '설정으로 이동',
        onPress: () => Linking.openSettings(),
      },
    ]
  );
};

/**
 * Calculate distance between two coordinates in kilometers
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRadians = (degrees: number): number => {
  return degrees * (Math.PI / 180);
};

/**
 * Get midpoint between two coordinates
 */
export const getMidpoint = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { latitude: number; longitude: number } => {
  return {
    latitude: (lat1 + lat2) / 2,
    longitude: (lon1 + lon2) / 2,
  };
};

export default {
  checkLocationPermission,
  requestLocationPermission,
  getCurrentLocation,
  updateUserLocationInDB,
  checkCoupleLocationStatus,
  showLocationRequiredAlert,
  calculateDistance,
  getMidpoint,
};
