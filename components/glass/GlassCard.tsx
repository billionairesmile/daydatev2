import React, { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS, GLASS_PRESETS, IS_TABLET, scale, scaleFont } from '@/constants/design';

type BlurIntensity = 'light' | 'default' | 'heavy';

interface GlassCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'default' | 'light' | 'dark' | 'primary';
  blur?: BlurIntensity;
  borderRadius?: number;
  noPadding?: boolean;
  noGradient?: boolean;
}

const blurIntensityMap: Record<BlurIntensity, number> = {
  light: 40,
  default: 60,
  heavy: 80,
};

const variantStyles: Record<string, { background: string; border: string }> = {
  default: {
    background: COLORS.glass.white10,
    border: COLORS.glass.white20,
  },
  light: {
    background: COLORS.glass.white20,
    border: COLORS.glass.white30,
  },
  dark: {
    background: COLORS.glass.black20,
    border: COLORS.glass.white10,
  },
  primary: {
    background: 'rgba(255, 107, 157, 0.15)',
    border: 'rgba(255, 107, 157, 0.3)',
  },
};

export function GlassCard({
  children,
  style,
  variant = 'default',
  blur = 'default',
  borderRadius = RADIUS.xxl,
  noPadding = false,
  noGradient = false,
}: GlassCardProps) {
  const variantStyle = variantStyles[variant];

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius,
          borderColor: variantStyle.border,
        },
        style,
      ]}
    >
      <BlurView
        experimentalBlurMethod="dimezisBlurView"
        intensity={blurIntensityMap[blur]}
        tint="dark"
        style={[styles.blur, { borderRadius }]}
      >
        <View
          style={[
            styles.content,
            {
              backgroundColor: variantStyle.background,
              borderRadius,
              padding: noPadding ? 0 : scale(16),
            },
          ]}
        >
          {!noGradient && (
            <LinearGradient
              colors={[
                'rgba(255, 255, 255, 0.1)',
                'rgba(255, 255, 255, 0.02)',
                'rgba(255, 255, 255, 0)',
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.gradient, { borderRadius }]}
            />
          )}
          {children}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: scale(1),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: scale(4) },
    shadowOpacity: 0.15,
    shadowRadius: scale(12),
    elevation: scale(8),
  },
  blur: {
    overflow: 'hidden',
  },
  content: {
    position: 'relative',
    overflow: 'hidden',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
});
