import React, { useCallback, useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Calendar, Tag, ExternalLink } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, FS, SP, RD, SZ, SCREEN_WIDTH } from '@/constants/design';
import type { FeedPost } from '@/types';
import { ImageCarousel } from './ImageCarousel';
import { FeedSaveButton } from './FeedSaveButton';

interface FeedCardProps {
  post: FeedPost;
  isSaved: boolean;
  onToggleSave: () => void;
}

const CARD_WIDTH = SCREEN_WIDTH - SP.lg * 2;

function formatDateRange(startDate?: string, endDate?: string): string | null {
  if (!startDate) return null;

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${month}.${day}`;
  };

  const start = formatDate(startDate);
  if (!endDate) return start;

  const end = formatDate(endDate);
  return `${start} - ${end}`;
}

export function FeedCard({ post, isSaved, onToggleSave }: FeedCardProps) {
  const { t } = useTranslation();

  const linkUrl = post.affiliateLink || post.externalLink;

  const dateRange = useMemo(
    () => formatDateRange(post.eventStartDate, post.eventEndDate),
    [post.eventStartDate, post.eventEndDate],
  );

  const hasMetadata = !!(post.locationName || dateRange || post.price);

  const handleOpenLink = useCallback(() => {
    if (linkUrl) {
      Linking.openURL(linkUrl);
    }
  }, [linkUrl]);

  const handleImagePress = useCallback(() => {
    if (linkUrl) {
      Linking.openURL(linkUrl);
    }
  }, [linkUrl]);

  return (
    <View style={styles.cardOuter}>
      <BlurView
        experimentalBlurMethod="dimezisBlurView"
        intensity={60}
        tint="dark"
        style={styles.blur}
      >
        <View style={styles.cardInner}>
          <LinearGradient
            colors={[
              'rgba(255, 255, 255, 0.08)',
              'rgba(255, 255, 255, 0.02)',
              'rgba(255, 255, 255, 0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          />

          {/* Image Carousel */}
          <ImageCarousel images={post.images} onPress={handleImagePress} />

          {/* Content */}
          <View style={styles.content}>
            {/* Title */}
            <Text style={styles.title} numberOfLines={2}>
              {post.title}
            </Text>

            {/* Caption */}
            {post.caption ? (
              <Text style={styles.caption} numberOfLines={2}>
                {post.caption}
              </Text>
            ) : null}

            {/* Metadata Row */}
            {hasMetadata && (
              <View style={styles.metadataRow}>
                {post.locationName ? (
                  <View style={styles.metaItem}>
                    <MapPin
                      size={SZ.iconXs}
                      color={COLORS.glass.white50}
                      strokeWidth={1.8}
                    />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {post.locationName}
                    </Text>
                  </View>
                ) : null}

                {dateRange ? (
                  <View style={styles.metaItem}>
                    <Calendar
                      size={SZ.iconXs}
                      color={COLORS.glass.white50}
                      strokeWidth={1.8}
                    />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {dateRange}
                    </Text>
                  </View>
                ) : null}

                {post.price ? (
                  <View style={styles.metaItem}>
                    <Tag
                      size={SZ.iconXs}
                      color={COLORS.glass.white50}
                      strokeWidth={1.8}
                    />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {post.price}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

            {/* Action Row */}
            <View style={styles.actionRow}>
              {linkUrl ? (
                <Pressable
                  onPress={handleOpenLink}
                  style={({ pressed }) => [
                    styles.ctaButton,
                    pressed && styles.ctaPressed,
                  ]}
                  accessibilityRole="link"
                  accessibilityLabel={t('feed.openLink')}
                >
                  <ExternalLink
                    size={SZ.iconSm}
                    color={COLORS.foreground}
                    strokeWidth={1.8}
                  />
                  <Text style={styles.ctaText}>
                    {t('feed.viewMore')}
                  </Text>
                </Pressable>
              ) : (
                <View />
              )}

              <FeedSaveButton
                isSaved={isSaved}
                onToggle={onToggleSave}
                saveCount={post.saveCount}
              />
            </View>
          </View>
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    width: CARD_WIDTH,
    alignSelf: 'center',
    borderRadius: RD.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glass.white10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  blur: {
    overflow: 'hidden',
    borderRadius: RD.sm,
  },
  cardInner: {
    backgroundColor: COLORS.glass.white08,
    overflow: 'hidden',
    position: 'relative',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 1,
  },
  content: {
    padding: SP.lg,
    gap: SP.sm,
  },
  title: {
    fontSize: FS.xl,
    fontWeight: '700',
    color: COLORS.foreground,
    lineHeight: FS.xl * 1.3,
  },
  caption: {
    fontSize: FS.md,
    fontWeight: '400',
    color: COLORS.glass.white70,
    lineHeight: FS.md * 1.5,
  },
  metadataRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: SP.md,
    marginTop: SP.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs,
  },
  metaText: {
    fontSize: FS.sm,
    fontWeight: '500',
    color: COLORS.glass.white50,
    maxWidth: CARD_WIDTH * 0.35,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SP.sm,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.sm,
    backgroundColor: COLORS.accent,
    paddingVertical: SP.sm,
    paddingHorizontal: SP.lg,
    borderRadius: RD.lg,
  },
  ctaPressed: {
    opacity: 0.8,
  },
  ctaText: {
    fontSize: FS.md,
    fontWeight: '600',
    color: COLORS.foreground,
  },
});
