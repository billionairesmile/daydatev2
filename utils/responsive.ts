/**
 * Responsive Design Utilities for DayDate App
 * Base dimensions: iPhone 16 (393 x 852)
 *
 * Usage:
 * - wp(percentage): Width percentage (0-100) → pixels
 * - hp(percentage): Height percentage (0-100) → pixels
 * - fp(size): Font scaling with min/max bounds
 * - rs(size): Responsive scale (general dimensions)
 * - rw(size): Responsive width scaling
 * - rh(size): Responsive height scaling
 */

import { Dimensions, PixelRatio, Platform } from 'react-native';

// Screen dimensions
export const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base dimensions: iPhone 16
const BASE_WIDTH = 393;
const BASE_HEIGHT = 852;

// Scaling ratios
export const widthRatio = SCREEN_WIDTH / BASE_WIDTH;
export const heightRatio = SCREEN_HEIGHT / BASE_HEIGHT;

/**
 * Width percentage (0-100) - returns pixels
 * @example wp(50) on 393px screen = 196px
 * @example wp(71.2) for polaroid width = 280px on base device
 */
export const wp = (percentage: number): number => {
  return Math.round((percentage / 100) * SCREEN_WIDTH);
};

/**
 * Height percentage (0-100) - returns pixels
 * @example hp(50) on 852px screen = 426px
 */
export const hp = (percentage: number): number => {
  return Math.round((percentage / 100) * SCREEN_HEIGHT);
};

/**
 * Font scaling with min/max bounds for readability
 * - Min: 80% of original or 10px (whichever is larger)
 * - Max: 130% of original
 * @param size - Base font size for iPhone 16
 * @returns Scaled font size with bounds
 */
export const fp = (size: number): number => {
  const scaledSize = size * widthRatio;
  const minSize = Math.max(10, size * 0.8); // At least 10px or 80% of original
  const maxSize = size * 1.3; // At most 130% of original
  return Math.round(
    PixelRatio.roundToNearestPixel(
      Math.min(Math.max(scaledSize, minSize), maxSize)
    )
  );
};

/**
 * Responsive scale - general dimension scaling based on width
 * Use for: padding, margins, border radius, icon sizes
 * @param size - Base size for iPhone 16
 * @returns Scaled size
 */
export const rs = (size: number): number => {
  return Math.round(size * widthRatio);
};

/**
 * Responsive width - width-based scaling
 * @param size - Base width for iPhone 16
 * @returns Scaled width
 */
export const rw = (size: number): number => {
  return Math.round(size * widthRatio);
};

/**
 * Responsive height - height-based scaling
 * @param size - Base height for iPhone 16
 * @returns Scaled height
 */
export const rh = (size: number): number => {
  return Math.round(size * heightRatio);
};

// Device type helpers
export const isSmallDevice = (): boolean => SCREEN_WIDTH < 375;
export const isLargeDevice = (): boolean => SCREEN_WIDTH > 428;
export const isCompactHeight = (): boolean => SCREEN_HEIGHT < 700;

// Foldable device detection (Galaxy Z Flip, etc.)
// Foldables have narrower screens with high aspect ratios
export const aspectRatio = SCREEN_HEIGHT / SCREEN_WIDTH;
export const isFoldableDevice = (): boolean => {
  // Foldable phones typically have narrow width (< 385) and high aspect ratio (> 2.0)
  return SCREEN_WIDTH < 385 && aspectRatio > 2.0;
};

// Platform-specific helpers
export const isAndroid = Platform.OS === 'android';
export const isIOS = Platform.OS === 'ios';

// Android Navigation Bar Height (for bottom padding calculations)
export const ANDROID_NAV_BAR_HEIGHT = isAndroid ? 48 : 0;
export const ANDROID_BOTTOM_PADDING = isAndroid ? 16 : 0;
