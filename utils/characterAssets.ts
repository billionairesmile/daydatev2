// Ransom note style character assets mapping
// Each character has multiple variations for visual variety

import { ImageSourcePropType, Image } from 'react-native';
import { Asset } from 'expo-asset';

type CharacterVariants = ImageSourcePropType[];

// Character to image mapping - React Native requires static require()
export const CHARACTER_ASSETS: Record<string, CharacterVariants> = {
  // Letters
  'a': [
    require('../assets/characters/a-1.webp'),
    require('../assets/characters/a-2.webp'),
    require('../assets/characters/a-3.webp'),
    require('../assets/characters/a-4.webp'),
  ],
  'b': [
    require('../assets/characters/b-1.webp'),
    require('../assets/characters/b-2.webp'),
    require('../assets/characters/b-3.webp'),
  ],
  'c': [
    require('../assets/characters/c-1.webp'),
    require('../assets/characters/c-2.webp'),
    require('../assets/characters/c-3.webp'),
  ],
  'd': [
    require('../assets/characters/d-1.webp'),
    require('../assets/characters/d-2.webp'),
    require('../assets/characters/d-3.webp'),
    require('../assets/characters/d-4.webp'),
  ],
  'e': [
    require('../assets/characters/e-1.webp'),
    require('../assets/characters/e-2.webp'),
    require('../assets/characters/e-3.webp'),
  ],
  'f': [
    require('../assets/characters/f-1.webp'),
    require('../assets/characters/f-2.webp'),
    require('../assets/characters/f-3.webp'),
    require('../assets/characters/f-4.webp'),
  ],
  'g': [
    require('../assets/characters/g-1.webp'),
    require('../assets/characters/g-2.webp'),
    require('../assets/characters/g-3.webp'),
    require('../assets/characters/g-4.webp'),
  ],
  'h': [
    require('../assets/characters/h-1.webp'),
    require('../assets/characters/h-2.webp'),
    require('../assets/characters/h-3.webp'),
  ],
  'i': [
    require('../assets/characters/i-1.webp'),
    require('../assets/characters/i-2.webp'),
    require('../assets/characters/i-3.webp'),
    require('../assets/characters/i-4.webp'),
  ],
  'j': [
    require('../assets/characters/j-1.webp'),
    require('../assets/characters/j-2.webp'),
    require('../assets/characters/j-3.webp'),
    require('../assets/characters/j-4.webp'),
  ],
  'k': [
    require('../assets/characters/k-1.webp'),
    require('../assets/characters/k-2.webp'),
    require('../assets/characters/k-3.webp'),
  ],
  'l': [
    require('../assets/characters/l-1.webp'),
    require('../assets/characters/l-2.webp'),
    require('../assets/characters/l-3.webp'),
    require('../assets/characters/l-4.webp'),
  ],
  'm': [
    require('../assets/characters/m-1.webp'),
    require('../assets/characters/m-2.webp'),
    require('../assets/characters/m-3.webp'),
  ],
  'n': [
    require('../assets/characters/n-1.webp'),
    require('../assets/characters/n-2.webp'),
    require('../assets/characters/n-3.webp'),
  ],
  'o': [
    require('../assets/characters/o-1.webp'),
    require('../assets/characters/o-2.webp'),
    require('../assets/characters/o-3.webp'),
    require('../assets/characters/o-4.webp'),
  ],
  'p': [
    require('../assets/characters/p-1.webp'),
    require('../assets/characters/p-2.webp'),
    require('../assets/characters/p-3.webp'),
    require('../assets/characters/p-4.webp'),
  ],
  'q': [
    require('../assets/characters/q-1.webp'),
    require('../assets/characters/q-2.webp'),
    require('../assets/characters/q-3.webp'),
    require('../assets/characters/q-4.webp'),
  ],
  'r': [
    require('../assets/characters/r-1.webp'),
    require('../assets/characters/r-2.webp'),
    require('../assets/characters/r-3.webp'),
    require('../assets/characters/r-4.webp'),
  ],
  's': [
    require('../assets/characters/s-1.webp'),
    require('../assets/characters/s-2.webp'),
    require('../assets/characters/s-3.webp'),
    require('../assets/characters/s-4.webp'),
  ],
  't': [
    require('../assets/characters/t-1.webp'),
    require('../assets/characters/t-2.webp'),
    require('../assets/characters/t-3.webp'),
    require('../assets/characters/t-4.webp'),
  ],
  'u': [
    require('../assets/characters/u-1.webp'),
    require('../assets/characters/u-2.webp'),
    require('../assets/characters/u-3.webp'),
    require('../assets/characters/u-4.webp'),
  ],
  'v': [
    require('../assets/characters/v-1.webp'),
    require('../assets/characters/v-2.webp'),
    require('../assets/characters/v-3.webp'),
    require('../assets/characters/v-4.webp'),
    require('../assets/characters/v-5.webp'),
  ],
  'w': [
    require('../assets/characters/w-1.webp'),
    require('../assets/characters/w-2.webp'),
    require('../assets/characters/w-3.webp'),
    require('../assets/characters/w-4.webp'),
  ],
  'x': [
    require('../assets/characters/x-1.webp'),
    require('../assets/characters/x-2.webp'),
    require('../assets/characters/x-3.webp'),
    require('../assets/characters/x-4.webp'),
  ],
  'y': [
    require('../assets/characters/y-1.webp'),
    require('../assets/characters/y-2.webp'),
    require('../assets/characters/y-3.webp'),
    require('../assets/characters/y-4.webp'),
  ],
  'z': [
    require('../assets/characters/z-1.webp'),
    require('../assets/characters/z-2.webp'),
    require('../assets/characters/z-3.webp'),
    require('../assets/characters/z-4.webp'),
  ],
  // Numbers
  '0': [
    require('../assets/characters/0-1.webp'),
    require('../assets/characters/0-2.webp'),
  ],
  '1': [
    require('../assets/characters/1-1.webp'),
    require('../assets/characters/1-2.webp'),
  ],
  '2': [
    require('../assets/characters/2-1.webp'),
    require('../assets/characters/2-2.webp'),
    require('../assets/characters/2-3.webp'),
    require('../assets/characters/2-4.webp'),
  ],
  '3': [
    require('../assets/characters/3-1.webp'),
    require('../assets/characters/3-2.webp'),
    require('../assets/characters/3-3.webp'),
  ],
  '4': [
    require('../assets/characters/4-1.webp'),
    require('../assets/characters/4-2.webp'),
    require('../assets/characters/4-3.webp'),
  ],
  '5': [
    require('../assets/characters/5-1.webp'),
    require('../assets/characters/5-2.webp'),
    require('../assets/characters/5-3.webp'),
  ],
  '6': [
    require('../assets/characters/6-1.webp'),
    require('../assets/characters/6-2.webp'),
    require('../assets/characters/6-3.webp'),
    require('../assets/characters/6-4.webp'),
  ],
  '7': [
    require('../assets/characters/7-1.webp'),
    require('../assets/characters/7-2.webp'),
    require('../assets/characters/7-3.webp'),
    require('../assets/characters/7-4.webp'),
  ],
  '8': [
    require('../assets/characters/8-1.webp'),
    require('../assets/characters/8-2.webp'),
    require('../assets/characters/8-3.webp'),
  ],
  '9': [
    require('../assets/characters/9-1.webp'),
    require('../assets/characters/9-2.webp'),
    require('../assets/characters/9-3.webp'),
  ],
};

// Seeded random number generator for consistent results
export function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Get random character image based on seed
export function getCharacterImage(
  char: string,
  seed: number,
  index: number
): ImageSourcePropType | null {
  const lowerChar = char.toLowerCase();
  const variants = CHARACTER_ASSETS[lowerChar];

  if (!variants || variants.length === 0) {
    return null;
  }

  // Use seed + index to get consistent but varied selection
  const modifiedSeed = seed + index;
  const randomIndex = Math.floor(seededRandom(modifiedSeed) * variants.length);

  return variants[randomIndex];
}

// Get random rotation angle (-5 to 5 degrees)
export function getRandomRotation(seed: number, index: number): number {
  const modifiedSeed = seed + index + 1000;
  return Math.floor(seededRandom(modifiedSeed) * 11) - 5;
}

// Get random vertical offset for more natural look
export function getRandomYOffset(seed: number, index: number): number {
  const modifiedSeed = seed + index + 2000;
  return Math.floor(seededRandom(modifiedSeed) * 6) - 3;
}

// Check if character is supported
export function isCharacterSupported(char: string): boolean {
  const lowerChar = char.toLowerCase();
  return lowerChar in CHARACTER_ASSETS || char === ' ';
}

// Get all character assets as a flat array for preloading
export function getAllCharacterAssets(): ImageSourcePropType[] {
  const allAssets: ImageSourcePropType[] = [];
  Object.values(CHARACTER_ASSETS).forEach(variants => {
    variants.forEach(asset => {
      allAssets.push(asset);
    });
  });
  return allAssets;
}

// Preload all character images for instant rendering
let preloadPromise: Promise<void> | null = null;
let isPreloaded = false;

export async function preloadCharacterAssets(): Promise<void> {
  if (isPreloaded) return;

  if (preloadPromise) {
    return preloadPromise;
  }

  preloadPromise = (async () => {
    try {
      const allAssets = getAllCharacterAssets();

      // Use Asset.loadAsync for bundled assets
      const assetPromises = allAssets.map(asset => {
        if (typeof asset === 'number') {
          return Asset.fromModule(asset).downloadAsync();
        }
        return Promise.resolve();
      });

      await Promise.all(assetPromises);
      isPreloaded = true;
    } catch (error) {
      console.warn('Failed to preload character assets:', error);
    }
  })();

  return preloadPromise;
}

// Check if assets are preloaded
export function areCharacterAssetsPreloaded(): boolean {
  return isPreloaded;
}
