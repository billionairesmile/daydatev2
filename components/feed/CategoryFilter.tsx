import React, { useCallback, useRef } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS, FS, SP, RD, SZ } from '@/constants/design';
import type { FeedCategory } from '@/types';

interface CategoryFilterProps {
  selected: FeedCategory;
  onSelect: (category: FeedCategory) => void;
}

const CATEGORIES: FeedCategory[] = [
  'all',
  'festival',
  'performance',
  'restaurant',
  'activity',
  'spot',
];

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  const { t } = useTranslation();
  const flatListRef = useRef<FlatList<FeedCategory>>(null);

  const renderItem = useCallback(
    ({ item }: { item: FeedCategory }) => {
      const isSelected = item === selected;

      return (
        <Pressable
          onPress={() => onSelect(item)}
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
    [selected, onSelect, t],
  );

  const keyExtractor = useCallback((item: FeedCategory) => item, []);

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={CATEGORIES}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        bounces={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SP.md,
  },
  listContent: {
    paddingHorizontal: SP.lg,
    gap: SP.sm,
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
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  chipDefault: {
    backgroundColor: COLORS.glass.white08,
    borderColor: COLORS.border,
  },
  chipText: {
    fontSize: FS.md,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: COLORS.foreground,
  },
  chipTextDefault: {
    color: COLORS.glass.white60,
  },
});
