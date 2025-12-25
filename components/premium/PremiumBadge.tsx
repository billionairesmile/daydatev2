import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Crown } from 'lucide-react-native';

import { COLORS, SPACING, RADIUS } from '@/constants/design';

interface PremiumBadgeProps {
  size?: 'small' | 'medium' | 'large';
}

export default function PremiumBadge({ size = 'small' }: PremiumBadgeProps) {
  const sizeStyles = {
    small: {
      container: styles.containerSmall,
      icon: 12,
      text: styles.textSmall,
    },
    medium: {
      container: styles.containerMedium,
      icon: 14,
      text: styles.textMedium,
    },
    large: {
      container: styles.containerLarge,
      icon: 16,
      text: styles.textLarge,
    },
  };

  const currentSize = sizeStyles[size];

  return (
    <View style={[styles.container, currentSize.container]}>
      <Crown color="#FFD700" size={currentSize.icon} />
      <Text style={[styles.text, currentSize.text]}>Premium</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderRadius: RADIUS.sm,
    gap: 4,
  },
  containerSmall: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  containerMedium: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  containerLarge: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  text: {
    fontWeight: '600',
    color: '#FFD700',
  },
  textSmall: {
    fontSize: 10,
  },
  textMedium: {
    fontSize: 12,
  },
  textLarge: {
    fontSize: 14,
  },
});
