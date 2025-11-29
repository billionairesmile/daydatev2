import React, { useMemo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  ViewStyle,
  StyleProp,
  Text,
} from 'react-native';
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

export function RansomText({
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

  const renderCharacter = (charData: CharacterData, index: number) => {
    // Handle unsupported character (show as text fallback)
    if (!charData.image) {
      if (!isCharacterSupported(charData.char)) {
        return (
          <Text
            key={`fallback-${charData.globalIndex}`}
            style={[
              styles.fallbackText,
              {
                fontSize: characterSize * 0.8,
                marginHorizontal: spacing / 2,
              },
            ]}
          >
            {charData.char}
          </Text>
        );
      }
      return null;
    }

    // Render character image
    return (
      <View
        key={`char-${charData.globalIndex}`}
        style={[
          styles.characterWrapper,
          {
            marginHorizontal: spacing / 2,
            transform: [
              { rotate: `${charData.rotation}deg` },
              { translateY: charData.yOffset },
            ],
          },
        ]}
      >
        <Image
          source={charData.image}
          style={[
            styles.characterImage,
            {
              width: characterSize,
              height: characterSize,
            },
          ]}
          resizeMode="contain"
        />
      </View>
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
            {wordData.characters.map((charData, charIndex) =>
              renderCharacter(charData, charIndex)
            )}
          </View>
        );
      })}
    </View>
  );
}

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
  characterImage: {
    // Base styles, size is set dynamically
  },
  fallbackText: {
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
