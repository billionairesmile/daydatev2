import React, { useCallback, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, FS, SP, RD } from '@/constants/design';
import type { FeedCategory } from '@/types';

interface CategoryFilterProps {
  selected: FeedCategory;
  onSelect: (category: FeedCategory) => void;
}

const CATEGORIES: FeedCategory[] = [
  'all',
  'festival',
  'show',
  'restaurant',
  'activity',
  'spot',
  'pet',
];

export const CategoryFilter = React.memo(function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.x;
  }, []);

  const handleSelect = useCallback(
    (item: FeedCategory) => {
      // Capture scroll position before state update triggers re-render
      const offsetToRestore = scrollOffsetRef.current;
      onSelect(item);
      // Restore scroll position with multiple attempts for reliability across platforms
      const restore = () => scrollRef.current?.scrollTo({ x: offsetToRestore, animated: false });
      requestAnimationFrame(restore);
      setTimeout(restore, 50);
    },
    [onSelect],
  );

  const renderChip = useCallback(
    (item: FeedCategory) => {
      const isSelected = item === selected;

      return (
        <Pressable
          key={item}
          onPress={() => handleSelect(item)}
          style={[
            styles.chip,
            isSelected ? styles.chipSelected : styles.chipDefault,
          ]}
          accessibilityRole="tab"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={t(`feed.category.${item}`)}
        >
          <Text
            style={[
              styles.chipText,
              isSelected ? styles.chipTextSelected : styles.chipTextDefault,
            ]}
            numberOfLines={1}
          >
            {t(`feed.category.${item}`)}
          </Text>
        </Pressable>
      );
    },
    [selected, handleSelect, t],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        overScrollMode="never"
        decelerationRate="fast"
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {CATEGORIES.map(renderChip)}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    marginTop: SP.md,
    paddingVertical: SP.sm,
  },
  scrollContent: {
    paddingLeft: 0,
    paddingRight: SP.lg,
    gap: SP.sm,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: SP.lg,
    paddingVertical: SP.sm,
    borderRadius: RD.lg,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: '#FF4B6E',
    borderColor: '#FF4B6E',
  },
  chipDefault: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  chipText: {
    fontSize: FS.md,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: COLORS.foreground,
  },
  chipTextDefault: {
    color: 'rgba(255,255,255,0.85)',
  },
});
