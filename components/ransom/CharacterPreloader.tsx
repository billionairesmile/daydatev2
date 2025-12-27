import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { getAllCharacterAssets } from '@/utils/characterAssets';

// Get all assets once at module level for consistency
const ALL_CHARACTER_ASSETS = getAllCharacterAssets();

/**
 * Hidden component that pre-renders all character images to force them into memory cache.
 * This ensures instant display when RansomText is used.
 * Renders at actual size (40x40) to ensure proper caching.
 */
export const CharacterPreloader = memo(function CharacterPreloader() {
  return (
    <View style={styles.container} pointerEvents="none">
      {ALL_CHARACTER_ASSETS.map((asset, index) => (
        <Image
          key={`preload-${index}`}
          source={asset}
          style={styles.image}
          cachePolicy="memory-disk"
          priority="high"
          contentFit="contain"
          recyclingKey={`preload-${index}`}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: -9999,
    left: -9999,
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 400,
    height: 400,
    opacity: 0,
  },
  image: {
    width: 40,
    height: 40,
  },
});
