import React, { memo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

interface OptimizedBackgroundProps {
  source: any;
  defaultSource?: any;
  style?: ViewStyle;
  children?: React.ReactNode;
}

// Blurhash for a smooth placeholder (subtle gray gradient)
const PLACEHOLDER_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0LTIpIp';

/**
 * Optimized background image component using expo-image
 * Features:
 * - Disk + memory caching
 * - Smooth crossfade transitions
 * - Blurhash placeholder for instant display
 * - Low priority to not block UI
 */
function OptimizedBackgroundComponent({
  source,
  defaultSource,
  style,
  children,
}: OptimizedBackgroundProps) {
  // Handle both require() sources and uri objects
  const imageSource = source?.uri
    ? { uri: source.uri }
    : source;

  return (
    <View style={[styles.container, style]}>
      <Image
        source={imageSource}
        placeholder={PLACEHOLDER_BLURHASH}
        contentFit="cover"
        transition={200} // Quick crossfade
        cachePolicy="memory-disk" // Cache in both memory and disk
        priority="low" // Don't block other operations
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

// Memoize to prevent unnecessary re-renders
export const OptimizedBackground = memo(OptimizedBackgroundComponent);
