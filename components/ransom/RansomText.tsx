import React, { useMemo, memo } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Text,
} from 'react-native';
import { Image } from 'expo-image';
import {
  getCharacterImage,
  getRandomRotation,
  getRandomYOffset,
  isCharacterSupported,
} from '@/utils/characterAssets';

export interface RansomTextProps {
  text: string;
  seed?: number;
  characterSize?: number;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  enableRotation?: boolean;
  enableYOffset?: boolean;
}

interface CharacterData {
  char: string;
  image: ReturnType<typeof getCharacterImage>;
  rotation: number;
  yOffset: number;
  globalIndex: number;
}

interface WordData {
  word: string;
  characters: CharacterData[];
  isSpace: boolean;
}

// Memoized character image component for better performance
interface CharacterImageProps {
  image: ReturnType<typeof getCharacterImage>;
  size: number;
  rotation: number;
  yOffset: number;
  spacing: number;
  globalIndex: number;
}

const CharacterImage = memo(function CharacterImage({
  image,
  size,
  rotation,
  yOffset,
  spacing,
  globalIndex,
}: CharacterImageProps) {
  return (
    <View
      key={`char-${globalIndex}`}
      style={[
        styles.characterWrapper,
        {
          marginHorizontal: spacing / 2,
          transform: [
            { rotate: `${rotation}deg` },
            { translateY: yOffset },
          ],
        },
      ]}
    >
      <Image
        source={image}
        style={{
          width: size,
          height: size,
        }}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
        priority="high"
        recyclingKey={`char-${globalIndex}`}
      />
    </View>
  );
});

// Memoized fallback text component
interface FallbackTextProps {
  char: string;
  size: number;
  spacing: number;
  globalIndex: number;
}

const FallbackText = memo(function FallbackText({
  char,
  size,
  spacing,
  globalIndex,
}: FallbackTextProps) {
  return (
    <Text
      key={`fallback-${globalIndex}`}
      style={[
        styles.fallbackText,
        {
          fontSize: size * 0.8,
          marginHorizontal: spacing / 2,
        },
      ]}
    >
      {char}
    </Text>
  );
});

export const RansomText = memo(function RansomText({
  text,
  seed = Math.floor(Math.random() * 1000000),
  characterSize = 40,
  spacing = -4, // Default to negative spacing for tighter characters
  style,
  enableRotation = true,
  enableYOffset = true,
}: RansomTextProps) {
  // Split text into words and process each character
  const words = useMemo<WordData[]>(() => {
    const result: WordData[] = [];
    let currentWord = '';
    let globalIndex = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === ' ') {
        // Save current word if exists
        if (currentWord.length > 0) {
          const characters: CharacterData[] = [];
          for (let j = 0; j < currentWord.length; j++) {
            const c = currentWord[j];
            const idx = globalIndex - currentWord.length + j;
            characters.push({
              char: c,
              image: getCharacterImage(c, seed, idx),
              rotation: enableRotation ? getRandomRotation(seed, idx) : 0,
              yOffset: enableYOffset ? getRandomYOffset(seed, idx) : 0,
              globalIndex: idx,
            });
          }
          result.push({ word: currentWord, characters, isSpace: false });
          currentWord = '';
        }
        // Add space
        result.push({ word: ' ', characters: [], isSpace: true });
        globalIndex++;
      } else {
        currentWord += char;
        globalIndex++;
      }
    }

    // Don't forget the last word
    if (currentWord.length > 0) {
      const characters: CharacterData[] = [];
      for (let j = 0; j < currentWord.length; j++) {
        const c = currentWord[j];
        const idx = globalIndex - currentWord.length + j;
        characters.push({
          char: c,
          image: getCharacterImage(c, seed, idx),
          rotation: enableRotation ? getRandomRotation(seed, idx) : 0,
          yOffset: enableYOffset ? getRandomYOffset(seed, idx) : 0,
          globalIndex: idx,
        });
      }
      result.push({ word: currentWord, characters, isSpace: false });
    }

    return result;
  }, [text, seed, enableRotation, enableYOffset]);

  const spaceWidth = characterSize * 0.3; // Reduced space width

  const renderCharacter = (charData: CharacterData) => {
    // Handle unsupported character (show as text fallback)
    if (!charData.image) {
      if (!isCharacterSupported(charData.char)) {
        return (
          <FallbackText
            key={`fallback-${charData.globalIndex}`}
            char={charData.char}
            size={characterSize}
            spacing={spacing}
            globalIndex={charData.globalIndex}
          />
        );
      }
      return null;
    }

    // Render character image using memoized component
    return (
      <CharacterImage
        key={`char-${charData.globalIndex}`}
        image={charData.image}
        size={characterSize}
        rotation={charData.rotation}
        yOffset={charData.yOffset}
        spacing={spacing}
        globalIndex={charData.globalIndex}
      />
    );
  };

  return (
    <View style={[styles.container, style]}>
      {words.map((wordData, wordIndex) => {
        // Handle space
        if (wordData.isSpace) {
          return (
            <View
              key={`space-${wordIndex}`}
              style={{ width: spaceWidth }}
            />
          );
        }

        // Render word as a group (keeps characters together when wrapping)
        return (
          <View key={`word-${wordIndex}`} style={styles.wordContainer}>
            {wordData.characters.map((charData) =>
              renderCharacter(charData)
            )}
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap', // Keep word characters together
  },
  characterWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
