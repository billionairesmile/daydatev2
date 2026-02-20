import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FS, SP, SCREEN_WIDTH } from '@/constants/design';
import type { FeedPost } from '@/types';

interface FeedCardProps {
  post: FeedPost;
  isSaved: boolean;
  onPress: () => void;
}

const GAP = 10;
const PADDING = 12;
const CARD_WIDTH = (SCREEN_WIDTH - PADDING * 2 - GAP) / 2;
const CARD_IMAGE_HEIGHT = CARD_WIDTH * 1.25;

export function FeedCard({ post, isSaved, onPress }: FeedCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.cardShadow, pressed && styles.cardPressed]}
    >
      <View style={styles.cardInner}>
        {/* Thumbnail Image */}
        <View style={styles.imageContainer}>
          {post.images && post.images.length > 0 ? (
            <Image
              source={{ uri: post.images[0] }}
              style={styles.image}
              contentFit="cover"
              transition={200}
              recyclingKey={post.id}
            />
          ) : (
            <View style={[styles.image, styles.placeholder]} />
          )}
          {/* Bottom gradient on image */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.35)']}
            style={styles.imageGradient}
          />
        </View>

        {/* Title only */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>{post.title}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export { CARD_WIDTH, GAP, PADDING };

const styles = StyleSheet.create({
  cardShadow: {
    width: CARD_WIDTH,
    marginBottom: GAP,
    borderRadius: 14,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    // Android elevation
    elevation: 6,
  },
  cardInner: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  imageContainer: {
    width: CARD_WIDTH,
    height: CARD_IMAGE_HEIGHT,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
  },
  placeholder: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  info: {
    padding: 10,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 18,
  },
});
