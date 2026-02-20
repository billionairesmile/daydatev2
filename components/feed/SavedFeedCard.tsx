import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MapPin, Calendar, Tag } from 'lucide-react-native';
import { COLORS, SCREEN_WIDTH, rs, fp } from '@/constants/design';
import type { FeedPost } from '@/types';

interface SavedFeedCardProps {
  post: FeedPost;
  onPress: () => void;
}

const CARD_PADDING = 16;
const IMAGE_WIDTH = SCREEN_WIDTH - CARD_PADDING * 2;
const IMAGE_HEIGHT = IMAGE_WIDTH * 0.65;
const ACCENT = '#FF4B6E';

function formatDateRange(startDate?: string, endDate?: string): string | null {
  if (!startDate) return null;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}.${d.getDate()}`;
  };
  const s = fmt(startDate);
  return endDate ? `${s} - ${fmt(endDate)}` : s;
}

export function SavedFeedCard({ post, onPress }: SavedFeedCardProps) {
  const dateRange = formatDateRange(post.eventStartDate, post.eventEndDate);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* Image - contain to show full image without cropping */}
      <View style={styles.imageContainer}>
        {post.images && post.images.length > 0 ? (
          <Image
            source={{ uri: post.images[0] }}
            style={styles.image}
            contentFit="contain"
            transition={200}
            recyclingKey={post.id}
          />
        ) : (
          <View style={[styles.image, styles.placeholder]} />
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.title}>{post.title}</Text>

        {post.caption ? (
          <Text style={styles.caption} numberOfLines={3}>{post.caption}</Text>
        ) : null}

        {/* Meta info - each on separate line */}
        <View style={styles.metaSection}>
          {post.locationName ? (
            <View style={styles.metaItem}>
              <MapPin size={rs(12)} color={ACCENT} strokeWidth={2} />
              <Text style={styles.metaText} numberOfLines={1}>{post.locationName}</Text>
            </View>
          ) : null}
          {dateRange ? (
            <View style={styles.metaItem}>
              <Calendar size={rs(12)} color={ACCENT} strokeWidth={2} />
              <Text style={styles.metaText}>{dateRange}</Text>
            </View>
          ) : null}
          {post.price ? (
            <View style={styles.metaItem}>
              <Tag size={rs(12)} color={ACCENT} strokeWidth={2} />
              <Text style={styles.metaText}>{post.price}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: CARD_PADDING,
    marginBottom: 14,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  imageContainer: {
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    backgroundColor: '#111',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  content: {
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: fp(16),
    fontWeight: '700',
    color: '#fff',
    lineHeight: fp(22),
  },
  caption: {
    fontSize: fp(13),
    lineHeight: fp(19),
    color: 'rgba(255,255,255,0.7)',
  },
  metaSection: {
    gap: 6,
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rs(4),
  },
  metaText: {
    fontSize: fp(11),
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
    flex: 1,
  },
});
