// Daydate Design Tokens - Glassmorphism UI System
// Based on Figma designs - aligned with figma-designs/src/styles/globals.css

export const COLORS = {
  // Core semantic colors (from figma-designs CSS variables)
  background: 'transparent',
  foreground: 'rgba(255, 255, 255, 1)',

  // Card & Popover
  card: 'rgba(255, 255, 255, 0.08)',
  cardForeground: 'rgba(255, 255, 255, 1)',
  popover: 'rgba(255, 255, 255, 0.08)',
  popoverForeground: 'rgba(255, 255, 255, 1)',

  // Primary (white on dark theme)
  primary: 'rgba(255, 255, 255, 1)',
  primaryForeground: 'rgba(0, 0, 0, 1)',

  // Secondary
  secondary: 'rgba(255, 255, 255, 0.2)',
  secondaryForeground: 'rgba(255, 255, 255, 1)',

  // Muted
  muted: 'rgba(255, 255, 255, 0.2)',
  mutedForeground: 'rgba(255, 255, 255, 0.6)',

  // Accent (blue)
  accent: 'rgba(1, 105, 249, 1)',
  accentForeground: 'rgba(255, 255, 255, 1)',

  // Destructive
  destructive: 'rgba(220, 38, 38, 1)',
  destructiveForeground: 'rgba(255, 255, 255, 1)',

  // Border & Input
  border: 'rgba(255, 255, 255, 0.1)',
  input: 'rgba(255, 255, 255, 0.08)',
  inputBackground: 'rgba(255, 255, 255, 0.08)',
  ring: 'rgba(255, 255, 255, 0.4)',

  // Neutral colors
  white: '#FFFFFF',
  black: '#000000',

  // Status colors (top-level shortcuts)
  success: '#6BCB77',
  warning: '#FFD93D',
  error: '#FF6B6B',
  info: '#4ECDC4',

  // Glass colors (with opacity) - extended from figma-designs
  glass: {
    white05: 'rgba(255, 255, 255, 0.05)',
    white08: 'rgba(255, 255, 255, 0.08)',
    white10: 'rgba(255, 255, 255, 0.1)',
    white20: 'rgba(255, 255, 255, 0.2)',
    white30: 'rgba(255, 255, 255, 0.3)',
    white40: 'rgba(255, 255, 255, 0.4)',
    white50: 'rgba(255, 255, 255, 0.5)',
    white60: 'rgba(255, 255, 255, 0.6)',
    white70: 'rgba(255, 255, 255, 0.7)',
    white80: 'rgba(255, 255, 255, 0.8)',
    white90: 'rgba(255, 255, 255, 0.9)',
    black10: 'rgba(0, 0, 0, 0.1)',
    black20: 'rgba(0, 0, 0, 0.2)',
    black30: 'rgba(0, 0, 0, 0.3)',
    black40: 'rgba(0, 0, 0, 0.4)',
    black50: 'rgba(0, 0, 0, 0.5)',
    black60: 'rgba(0, 0, 0, 0.6)',
  },

  // Text colors (aligned with figma-designs)
  text: {
    primary: 'rgba(255, 255, 255, 1)',
    secondary: 'rgba(255, 255, 255, 0.8)',
    tertiary: 'rgba(255, 255, 255, 0.6)',
    muted: 'rgba(255, 255, 255, 0.4)',
    inverse: 'rgba(0, 0, 0, 1)',
  },

  // Status colors
  status: {
    success: '#6BCB77',
    successLight: 'rgba(107, 203, 119, 0.3)',
    warning: '#FFD93D',
    warningLight: 'rgba(255, 217, 61, 0.3)',
    error: '#DC2626',
    errorLight: 'rgba(220, 38, 38, 0.3)',
    info: '#0169F9',
    infoLight: 'rgba(1, 105, 249, 0.3)',
  },

  // Chart colors (from figma-designs)
  chart: {
    chart1: 'rgba(99, 102, 241, 1)',
    chart2: 'rgba(34, 197, 94, 1)',
    chart3: 'rgba(251, 191, 36, 1)',
    chart4: 'rgba(239, 68, 68, 1)',
    chart5: 'rgba(168, 85, 247, 1)',
  },

  // Background gradients
  gradients: {
    primary: ['#667EEA', '#764BA2'],
    sunset: ['#FF6B9D', '#C44569', '#764BA2'],
    ocean: ['#667EEA', '#4ECDC4'],
    warm: ['#FF9A9E', '#FECFEF', '#FFA500'],
    cool: ['#A8EDEA', '#FED6E3'],
    night: ['#1a1a2e', '#16213e', '#0f3460'],
    period: ['#ef4444', '#ec4899'],
  },
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  massive: 48,
};

// Border radius aligned with figma-designs CSS variables
export const RADIUS = {
  xs: 4,
  sm: 12,   // --radius-sm: 12px
  md: 24,   // --radius-md: 24px (default)
  lg: 44,   // --radius-lg: 44px
  xl: 60,   // --radius-xl: 60px
  xxl: 80,  // Extended for backward compatibility
  xxxl: 100, // Extended for backward compatibility (same as full)
  full: 100, // --radius-full: 100px
};

export const TYPOGRAPHY = {
  // Font families
  fontFamily: {
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
    // For Polaroid handwriting style
    handwriting: 'System', // Will be replaced with Gloria Hallelujah
    // Korean display font (Jua) - for anniversary section
    display: 'Jua',
  },

  // Font sizes
  fontSize: {
    xs: 10,
    sm: 12,
    md: 14,
    base: 15,
    lg: 16,
    xl: 18,
    xxl: 20,
    xxxl: 24,
    display: 28,
    hero: 32,
    giant: 36,
    massive: 48,
  },

  // Font weights
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semiBold: '600' as const,
    bold: '700' as const,
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.5,
    loose: 1.6,
  },
};

export const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  }),
};

export const BLUR = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
};

export const ANIMATION = {
  duration: {
    fast: 150,
    normal: 300,
    slow: 500,
    slower: 800,
  },
  easing: {
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
  },
};

// Glass panel presets
export const GLASS_PRESETS = {
  light: {
    backgroundColor: COLORS.glass.white20,
    borderColor: COLORS.glass.white30,
    blurAmount: BLUR.md,
  },
  medium: {
    backgroundColor: COLORS.glass.white30,
    borderColor: COLORS.glass.white40,
    blurAmount: BLUR.lg,
  },
  heavy: {
    backgroundColor: COLORS.glass.white40,
    borderColor: COLORS.glass.white50,
    blurAmount: BLUR.xl,
  },
  dark: {
    backgroundColor: COLORS.glass.black30,
    borderColor: COLORS.glass.white20,
    blurAmount: BLUR.lg,
  },
};

// Navigation tab bar config
export const TAB_BAR = {
  height: 70,
  paddingBottom: 8,
  paddingHorizontal: 16,
  iconSize: 28,
  labelSize: 12,
  activeColor: COLORS.white,
  inactiveColor: COLORS.glass.white60,
  backgroundColor: COLORS.glass.white20,
  borderColor: COLORS.glass.white20,
  blurAmount: BLUR.xl,
};

export default {
  COLORS,
  SPACING,
  RADIUS,
  TYPOGRAPHY,
  SHADOWS,
  BLUR,
  ANIMATION,
  GLASS_PRESETS,
  TAB_BAR,
};
